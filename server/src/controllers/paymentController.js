const { Op } = require('sequelize');
const { Payment, Membership, Event, Ticket, Order, OrderItem, Club } = require('../models');
const paymentService = require('../services/paymentService');
const razorpay = require('../services/razorpay');
const { handlePaid, handleCancelled } = require('../services/paymentHandlers');
const AppError = require('../utils/AppError');

// Human-readable description of what a payment is for (shown on the checkout page)
async function describe(payment) {
  if (payment.purpose === 'MEMBERSHIP') {
    const m = await Membership.findByPk(payment.referenceId, { attributes: ['id', 'planName', 'status', 'clubId'], include: [{ model: Club, as: 'club', attributes: ['id', 'name'] }] });
    return (
      m && {
        type: 'MEMBERSHIP',
        name: `${m.club.name}: ${m.planName} membership`,
        lines: [{ label: `${m.club.name} · ${m.planName} membership`, amount: payment.amount }],
        next: `/clubs/${m.clubId}`,
      }
    );
  }
  if (payment.purpose === 'TICKET') {
    const event = await Event.findByPk(payment.referenceId, { attributes: ['id', 'title', 'startsAt', 'venue'] });
    const tickets = await Ticket.findAll({ where: { paymentId: payment.id }, attributes: ['holderName', 'priceType', 'price'] });
    return (
      event && {
        type: 'TICKET',
        name: `Tickets: ${event.title}`,
        subtitle: `${new Date(event.startsAt).toDateString()} · ${event.venue}`,
        lines: tickets.map((t) => ({ label: `${t.holderName} (${t.priceType === 'MEMBER' ? 'member' : 'guest'})`, amount: t.price })),
        next: '/tickets',
      }
    );
  }
  if (payment.purpose === 'MERCH') {
    const order = await Order.findByPk(payment.referenceId, { include: [{ model: OrderItem, as: 'items' }] });
    return (
      order && {
        type: 'MERCH',
        name: `Order ${order.orderNumber}`,
        lines: order.items.map((i) => ({ label: `${i.productName} (${i.size}) × ${i.quantity}`, amount: i.lineTotal })),
        discount: order.discount,
        next: '/orders',
      }
    );
  }
  return null;
}

// GET /api/payments/me
async function listMine(req, res) {
  const payments = await Payment.findAll({
    where: { userId: req.user.id, status: { [Op.in]: ['PAID', 'REFUNDED'] } },
    order: [['paidAt', 'DESC']],
  });
  res.json({ payments });
}

// GET /api/payments/:id — for the checkout page
async function getOne(req, res) {
  const payment = await Payment.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!payment) throw new AppError('Payment not found', 404);
  const expiresAt = new Date(payment.createdAt.getTime() + paymentService.HOLD_MINUTES * 60000);
  const item = await describe(payment);
  // Razorpay Checkout needs these in the browser to open the payment window for this order
  const gateway = payment.provider === 'razorpay' && payment.status === 'PENDING' ? razorpay.checkoutOptions(payment, req.user, item?.name || 'Payment') : null;
  res.json({ payment, item, provider: payment.provider, expiresAt, gateway });
}

// POST /api/payments/webhook/razorpay — Razorpay calls this server-to-server.
// Verified with the webhook secret against the RAW body. Business problems (e.g. the payment
// was auto-refunded) still return 200 so Razorpay doesn't retry; server faults return 500 so it does.
async function razorpayWebhook(req, res) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!razorpay.verifyWebhook(raw, req.get('x-razorpay-signature'))) throw new AppError('Invalid webhook signature', 400);

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError('Invalid JSON', 400);
  }

  const entity = event?.payload?.payment?.entity;
  if (['payment.captured', 'payment.authorized', 'order.paid'].includes(event.event) && entity?.order_id) {
    try {
      const out = await paymentService.confirmFromGateway(entity.order_id, entity.id, handlePaid);
      if (out?.ignored) console.log(`[razorpay webhook] ${event.event} ${entity.id}: ignored (${out.ignored})`);
    } catch (err) {
      if (!err.statusCode || err.statusCode >= 500) throw err;
      console.warn(`[razorpay webhook] ${event.event} ${entity.id}: ${err.message}`);
    }
  } else if (event.event === 'payment.failed' && entity) {
    console.log(`[razorpay webhook] payment failed for order ${entity.order_id}: ${entity.error_description || entity.error_code || ''}`);
  }
  res.json({ ok: true });
}

// POST /api/payments/:id/confirm — the gateway callback (test mode: the "Pay" button)
async function confirm(req, res) {
  const { payment, result } = await paymentService.confirmOnlinePayment(req.params.id, req.user.id, req.body, handlePaid);
  res.json({ payment, result });
}

// POST /api/payments/:id/cancel
async function cancel(req, res) {
  const payment = await paymentService.cancelPayment(req.params.id, req.user.id, handleCancelled);
  res.json({ payment });
}

module.exports = { listMine, getOne, confirm, cancel, razorpayWebhook };
