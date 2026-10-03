// Razorpay payment provider (Orders API + Standard Checkout).
//
// Flow: createOrder() makes a Razorpay order for the exact amount → the browser opens Razorpay
// Checkout for that order → Razorpay returns { razorpay_order_id, razorpay_payment_id,
// razorpay_signature } → verify() checks the signature AND fetches the payment to confirm it
// belongs to that order with that amount, capturing it if it is only authorized.
// The webhook (see paymentController) uses settle() for payments whose browser tab was closed.
const AppError = require('../utils/AppError');
const { hmacSha256, safeEqual } = require('../utils/signature');

function config() {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
  if (!keyId || !keySecret) throw new AppError('Razorpay is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET', 500);
  return { keyId, keySecret, base: (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/$/, '') };
}

const toPaise = (rupees) => Math.round(Number(rupees) * 100);

async function api(method, path, body) {
  const { keyId, keySecret, base } = config();
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new AppError(`Could not reach Razorpay (${err.name === 'TimeoutError' ? 'timed out' : err.message}). Please try again.`, 502);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(`Razorpay: ${data?.error?.description || `request failed (${res.status})`}`, 502);
  return data;
}

// Fetches the gateway payment and checks it matches our record; captures it if needed
async function settle(payment, gatewayPaymentId) {
  let p = await api('GET', `/payments/${encodeURIComponent(gatewayPaymentId)}`);
  if (p.order_id !== payment.providerRef) return { ok: false, reason: 'Payment does not belong to this order' };
  if (Number(p.amount) !== toPaise(payment.amount)) return { ok: false, reason: 'Paid amount does not match' };
  if (p.status === 'authorized') {
    p = await api('POST', `/payments/${encodeURIComponent(gatewayPaymentId)}/capture`, { amount: p.amount, currency: p.currency || payment.currency });
  }
  if (p.status !== 'captured') return { ok: false, reason: `Payment is ${p.status}` };
  return { ok: true, captured: true, providerPaymentId: gatewayPaymentId };
}

module.exports = {
  name: 'razorpay',
  config,
  toPaise,

  async createOrder(payment) {
    const order = await api('POST', '/orders', {
      amount: toPaise(payment.amount),
      currency: payment.currency || 'INR',
      receipt: `payment_${payment.id}`,
      notes: { paymentId: String(payment.id), purpose: payment.purpose },
    });
    return { providerRef: order.id };
  },

  // Called with what Razorpay Checkout hands the browser after a successful payment
  async verify(payment, payload = {}) {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = payload;
    if (!orderId || !paymentId || !signature) return { ok: false, reason: 'Missing payment details' };
    if (orderId !== payment.providerRef) return { ok: false, reason: 'Payment is for a different order' };
    const expected = hmacSha256(config().keySecret, `${orderId}|${paymentId}`);
    if (!safeEqual(expected, signature)) return { ok: false, reason: 'Invalid payment signature' };
    return settle(payment, paymentId);
  },

  settle,

  async refund(payment, amount, notes = {}) {
    if (!payment.providerPaymentId) throw new AppError('This payment has no Razorpay payment id to refund', 409);
    const r = await api('POST', `/payments/${encodeURIComponent(payment.providerPaymentId)}/refund`, { amount: toPaise(amount), notes });
    return { refundId: r.id };
  },

  // Options for Razorpay Checkout in the browser (key id is public by design; the secret never leaves the server)
  checkoutOptions(payment, user, description) {
    return {
      key: config().keyId,
      order_id: payment.providerRef,
      amount: toPaise(payment.amount),
      currency: payment.currency || 'INR',
      name: 'Skyline Student Association',
      description,
      prefill: { name: user.name, email: user.email, contact: user.phone || undefined },
      notes: { paymentId: String(payment.id) },
      testMode: config().keyId.startsWith('rzp_test_'),
    };
  },

  // Webhook body signature: HMAC-SHA256 of the raw request body with the webhook secret
  verifyWebhook(rawBody, signature) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new AppError('Razorpay webhook secret is not configured', 503);
    return safeEqual(hmacSha256(secret, rawBody), signature);
  },
};
