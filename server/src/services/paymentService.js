const { sequelize, Payment, Counter } = require('../models');
const ledgerService = require('./ledgerService');
const razorpay = require('./razorpay');
const AppError = require('../utils/AppError');

// How long a checkout may stay unpaid before its seats/stock are released
const HOLD_MINUTES = Number(process.env.CHECKOUT_HOLD_MINUTES) || 15;

// Payment providers. Each implements createOrder(payment) and verify(payment, payload);
// real gateways also implement refund(payment, amount, notes).
const providers = {
  // Test mode: the "Pay" button confirms directly, no money moves
  mock: {
    async createOrder(payment) {
      return { providerRef: `mock_order_${payment.id}` };
    },
    async verify() {
      return { ok: true };
    },
  },
  razorpay,
};

// New payments use PAYMENT_PROVIDER; existing payments keep the provider they were created with
function activeProvider() {
  const name = process.env.PAYMENT_PROVIDER || 'mock';
  if (!providers[name]) throw new AppError(`Payment provider "${name}" is not configured`, 500);
  return { name, impl: providers[name] };
}
const providerFor = (payment) => providers[payment.provider];

async function receiptNumber(transaction) {
  const year = new Date().getFullYear();
  const seq = await Counter.next(`receipt-${year}`, transaction);
  return `RCPT-${year}-${String(seq).padStart(5, '0')}`;
}

// Starts an online payment; the user then pays through the provider
async function createOnlinePayment({ clubId, userId, amount, purpose, referenceId }, transaction) {
  const { name, impl } = activeProvider();
  const payment = await Payment.create({ clubId, userId, amount, purpose, referenceId, method: 'ONLINE', provider: name }, { transaction });
  const { providerRef } = await impl.createOrder(payment);
  await payment.update({ providerRef }, { transaction });
  return payment;
}

// Records money already received in person (cash at the sign-up table etc.)
async function recordManualPayment({ clubId, userId, amount, purpose, referenceId, method = 'CASH', recordedById, note }, transaction) {
  const payment = await Payment.create(
    {
      clubId,
      userId,
      amount,
      purpose,
      referenceId,
      method,
      provider: 'manual',
      status: 'PAID',
      paidAt: new Date(),
      receiptNumber: await receiptNumber(transaction),
      recordedById,
      note,
    },
    { transaction }
  );
  await ledgerService.recordPayment(payment, transaction);
  return payment;
}

// Marks the payment PAID and runs `onPaid` (activate membership, issue tickets, confirm order)
// in ONE transaction: either everything happens or nothing does. The row lock means two
// confirmations (browser + webhook, or a double-click) can't both pay.
//
// If the gateway has already captured the money but we can't deliver (the checkout expired and
// its seats were released, the event sold out meanwhile...), the money is refunded automatically.
async function finalize(paymentId, verification, onPaid) {
  try {
    return await sequelize.transaction(async (t) => {
      const payment = await Payment.findByPk(paymentId, { transaction: t, lock: t.LOCK.UPDATE });
      if (payment.status === 'PAID') {
        return { payment, result: onPaid ? await onPaid(payment, t) : null, alreadyPaid: true };
      }
      if (payment.status === 'CANCELLED') throw new AppError('This checkout expired or was cancelled. Please start again.', 409);
      if (payment.status !== 'PENDING') throw new AppError(`Payment is ${payment.status.toLowerCase()}`, 409);

      await payment.update(
        { status: 'PAID', paidAt: new Date(), receiptNumber: await receiptNumber(t), providerPaymentId: verification.providerPaymentId || null },
        { transaction: t }
      );
      const result = onPaid ? await onPaid(payment, t) : null;
      await ledgerService.recordPayment(payment, t);
      return { payment, result, alreadyPaid: false };
    });
  } catch (err) {
    if (verification.captured && err.statusCode === 409) {
      await autoRefund(paymentId, verification.providerPaymentId, err.message);
      const p = await Payment.findByPk(paymentId);
      throw new AppError(`${err.message} You were charged, so the full ₹${p.amount} has been refunded to you automatically.`, 409);
    }
    throw err;
  }
}

// Gives back money we captured but could not use. No ledger rows: the money never counted as income.
async function autoRefund(paymentId, gatewayPaymentId, reason) {
  const payment = await Payment.findByPk(paymentId);
  if (payment.status === 'REFUNDED') return payment;
  const impl = providerFor(payment);
  const target = Object.assign(payment, { providerPaymentId: gatewayPaymentId });
  const { refundId } = await impl.refund(target, payment.amount, { reason: String(reason).slice(0, 250), paymentId: String(payment.id) });
  await Payment.update(
    { status: 'REFUNDED', providerPaymentId: gatewayPaymentId, note: `Auto-refunded (${refundId}): ${reason}`.slice(0, 500) },
    { where: { id: payment.id } }
  );
  console.warn(`[payments] auto-refunded payment ${payment.id} (${refundId}): ${reason}`);
  return payment;
}

// The browser's confirmation after paying (test mode: the "Pay" button).
// The gateway is checked BEFORE the database transaction, so no locks are held during network calls.
async function confirmOnlinePayment(paymentId, userId, payload, onPaid) {
  const payment = await Payment.findOne({ where: { id: paymentId, userId } });
  if (!payment) throw new AppError('Payment not found', 404);
  if (payment.status === 'PAID') return finalize(payment.id, {}, onPaid);
  if (payment.status === 'REFUNDED') throw new AppError('This payment was refunded', 409);

  const verification = await providerFor(payment).verify(payment, payload || {});
  if (!verification.ok) throw new AppError(`Payment verification failed${verification.reason ? `: ${verification.reason}` : ''}`, 400);
  return finalize(payment.id, verification, onPaid);
}

// Razorpay webhook: the payment succeeded even if the student closed the tab before returning
async function confirmFromGateway(orderId, gatewayPaymentId, onPaid) {
  const payment = await Payment.findOne({ where: { provider: 'razorpay', providerRef: orderId } });
  if (!payment) return { ignored: 'unknown order' };
  if (payment.status === 'PAID' || payment.status === 'REFUNDED') return { ignored: `already ${payment.status.toLowerCase()}` };

  const verification = await razorpay.settle(payment, gatewayPaymentId);
  if (!verification.ok) return { ignored: verification.reason };
  return finalize(payment.id, verification, onPaid);
}

// Cancels a pending payment. userId = null is used by the expiry job.
async function cancelPayment(paymentId, userId, onCancelled) {
  return sequelize.transaction(async (t) => {
    const where = { id: paymentId, status: 'PENDING' };
    if (userId) where.userId = userId;
    const payment = await Payment.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
    if (!payment) throw new AppError('No pending payment to cancel', 404);
    await payment.update({ status: 'CANCELLED' }, { transaction: t });
    if (onCancelled) await onCancelled(payment, t);
    return payment;
  });
}

// Refunds money: through the gateway for online payments (cash/UPI taken in person is handed back
// by the treasurer), and always as a REFUND expense in the ledger.
// `full` marks the whole payment REFUNDED; partial refunds (one ticket of three) leave it PAID.
async function refund(payment, { amount, key, description, eventId, recordedById, full = false }, transaction) {
  if (payment.status !== 'PAID' && payment.status !== 'REFUNDED') throw new AppError('Only paid payments can be refunded', 409);

  let refundId = null;
  const impl = providerFor(payment);
  if (impl?.refund && payment.providerPaymentId && amount > 0) {
    ({ refundId } = await impl.refund(payment, amount, { reason: String(description).slice(0, 250), paymentId: String(payment.id) }));
  }
  await ledgerService.recordRefund(
    { clubId: payment.clubId, key, amount, description: refundId ? `${description} · ${refundId}` : description, paymentId: payment.id, eventId, method: payment.method, recordedById },
    transaction
  );
  if (full) await payment.update({ status: 'REFUNDED' }, { transaction });
  return { refundId };
}

module.exports = {
  HOLD_MINUTES,
  providers,
  activeProvider,
  createOnlinePayment,
  recordManualPayment,
  confirmOnlinePayment,
  confirmFromGateway,
  cancelPayment,
  refund,
  receiptNumber,
};
