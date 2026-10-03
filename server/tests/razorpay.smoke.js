// Razorpay integration test. Self-contained: starts its own API instance in Razorpay mode,
// talking to a FAKE Razorpay API that mimics the real Orders / Payments / Refunds endpoints.
// All keys and secrets below are made up for this test; no real Razorpay account is used.
const http = require('http');
const crypto = require('crypto');

const FAKE_PORT = 5055;
const API_PORT = 5056;
Object.assign(process.env, {
  PORT: String(API_PORT),
  NODE_ENV: 'test',
  PAYMENT_PROVIDER: 'razorpay',
  RAZORPAY_KEY_ID: 'rzp_test_FAKEKEY123',
  RAZORPAY_KEY_SECRET: 'fake_secret_for_tests_only',
  RAZORPAY_WEBHOOK_SECRET: 'fake_webhook_secret',
  RAZORPAY_API_BASE: `http://localhost:${FAKE_PORT}/v1`,
  DB_SYNC_ALTER: 'true', // adds payments.providerPaymentId on existing databases
});

const { db, call, check, makeWorld, addToClub, run, TAG } = require('./helpers');
const connectDB = require('../src/config/db');
const app = require('../src/app');

// ---------- Fake Razorpay ----------
const fake = { orders: {}, payments: {}, refunds: [], calls: [] };
// The fake account's real credentials (fixed, so changing the env later simulates a wrong key)
const EXPECTED_AUTH = `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
let seq = 0;
const id = (p) => `${p}_${(++seq).toString().padStart(6, '0')}${crypto.randomBytes(3).toString('hex')}`;

const gateway = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = body ? JSON.parse(body) : {};
    const send = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    fake.calls.push({ method: req.method, url: req.url, body: json, authOk: req.headers.authorization === EXPECTED_AUTH });
    if (req.headers.authorization !== EXPECTED_AUTH) return send(401, { error: { description: 'Authentication failed' } });

    let m;
    if (req.method === 'POST' && req.url === '/v1/orders') {
      const order = { id: id('order'), entity: 'order', amount: json.amount, currency: json.currency, receipt: json.receipt, notes: json.notes, status: 'created' };
      fake.orders[order.id] = order;
      return send(200, order);
    }
    if (req.method === 'GET' && (m = req.url.match(/^\/v1\/payments\/([\w]+)$/))) {
      return fake.payments[m[1]] ? send(200, fake.payments[m[1]]) : send(400, { error: { description: 'The id provided does not exist' } });
    }
    if (req.method === 'POST' && (m = req.url.match(/^\/v1\/payments\/([\w]+)\/capture$/))) {
      const p = fake.payments[m[1]];
      if (!p || p.status !== 'authorized' || json.amount !== p.amount) return send(400, { error: { description: 'Capture failed' } });
      p.status = 'captured';
      return send(200, p);
    }
    if (req.method === 'POST' && (m = req.url.match(/^\/v1\/payments\/([\w]+)\/refund$/))) {
      const p = fake.payments[m[1]];
      if (!p || p.status !== 'captured') return send(400, { error: { description: 'Payment not captured' } });
      const refund = { id: id('rfnd'), payment_id: p.id, amount: json.amount };
      fake.refunds.push(refund);
      return send(200, refund);
    }
    send(404, { error: { description: 'Not found' } });
  });
});

// Simulates the student paying in Razorpay Checkout: creates the gateway payment and returns
// what Checkout hands the browser (signed with the key secret, as Razorpay does)
function studentPays(orderId, { amount, status = 'authorized', secret = process.env.RAZORPAY_KEY_SECRET } = {}) {
  const order = fake.orders[orderId];
  const payment = { id: id('pay'), entity: 'payment', order_id: orderId, amount: amount ?? order.amount, currency: 'INR', status, method: 'upi' };
  fake.payments[payment.id] = payment;
  const signature = crypto.createHmac('sha256', secret).update(`${orderId}|${payment.id}`).digest('hex');
  return { razorpay_order_id: orderId, razorpay_payment_id: payment.id, razorpay_signature: signature };
}

async function webhook(event, entity, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  const raw = JSON.stringify({ entity: 'event', event, payload: { payment: { entity } } });
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const r = await fetch(`http://localhost:${API_PORT}/api/payments/webhook/razorpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sig },
    body: raw,
  });
  return [r.status, await r.json()];
}

run('Razorpay', async () => {
  await connectDB();
  await new Promise((r) => gateway.listen(FAKE_PORT, r));
  const server = await new Promise((r) => {
    const s = app.listen(API_PORT, () => r(s));
  });

  try {
    const w = await makeWorld();
    const { club, manager } = w;
    const student = w.member; // approved club member, can pay club dues
    const [, planRes] = await call('POST', `/clubs/${club.id}/manage/plans`, { name: 'Annual', price: 500, durationType: 'YEAR_END' }, manager.token);
    const annual = planRes.plan;

    // --- Order creation
    let [s, j] = await call('POST', `/clubs/${club.id}/dues/checkout`, { planId: annual.id }, student.token);
    const pay1 = j.payment;
    const orderCall = fake.calls.find((c) => c.url === '/v1/orders');
    check('checkout creates a Razorpay order', s === 201 && pay1.provider === 'razorpay' && /^order_/.test(pay1.providerRef), j);
    check('order amount in paise, INR, with our payment id', orderCall.body.amount === annual.price * 100 && orderCall.body.currency === 'INR' && orderCall.body.notes.paymentId === String(pay1.id));
    check('API called with key id + secret (basic auth)', fake.calls.length > 0 && fake.calls.every((c) => c.authOk));

    [s, j] = await call('GET', `/payments/${pay1.id}`, null, student.token);
    check('checkout page gets Razorpay options (key id, order, paise, prefill)', j.gateway?.key === 'rzp_test_FAKEKEY123' && j.gateway.order_id === pay1.providerRef && j.gateway.amount === annual.price * 100 && j.gateway.prefill.email === student.email && j.gateway.testMode, j.gateway);
    check('key secret is never sent to the browser', !JSON.stringify(j).includes(process.env.RAZORPAY_KEY_SECRET));

    // --- Verification
    const forged = studentPays(pay1.providerRef, { secret: 'attacker-guess' });
    [s, j] = await call('POST', `/payments/${pay1.id}/confirm`, forged, student.token);
    check('forged signature rejected', s === 400 && /signature/i.test(j.message), j);
    [s] = await call('POST', `/payments/${pay1.id}/confirm`, {}, student.token);
    check('missing Razorpay fields rejected (no "just click pay")', s === 400);

    await addToClub(club, manager, w.collegeStudent, 'MEMBER');
    const otherOrder = (await call('POST', `/clubs/${club.id}/dues/checkout`, { planId: annual.id }, w.collegeStudent.token))[1].payment.providerRef;
    const wrongOrder = studentPays(otherOrder);
    [s, j] = await call('POST', `/payments/${pay1.id}/confirm`, wrongOrder, student.token);
    check("another order's valid payment can't be reused", s === 400, j);

    const tooLittle = studentPays(pay1.providerRef, { amount: 100 });
    [s, j] = await call('POST', `/payments/${pay1.id}/confirm`, tooLittle, student.token);
    check('paid amount must match', s === 400 && /amount/i.test(j.message), j);
    check('payment still pending after failed attempts', (await db.Payment.findByPk(pay1.id)).status === 'PENDING');

    const good = studentPays(pay1.providerRef);
    [s, j] = await call('POST', `/payments/${pay1.id}/confirm`, good, student.token);
    check('valid payment → PAID, membership active', s === 200 && j.payment.status === 'PAID' && j.result?.status === 'ACTIVE', j);
    check('authorized payment was captured at Razorpay', fake.payments[good.razorpay_payment_id].status === 'captured');
    check('Razorpay payment id stored for refunds', (await db.Payment.findByPk(pay1.id)).providerPaymentId === good.razorpay_payment_id);
    check('income recorded in ledger once', (await db.LedgerEntry.count({ where: { paymentId: pay1.id } })) === 1);

    [s, j] = await call('POST', `/payments/${pay1.id}/confirm`, good, student.token);
    check('confirming again is harmless', s === 200 && j.payment.status === 'PAID');

    // --- Webhook: student paid but closed the tab
    [s, j] = await call('POST', `/clubs/${club.id}/manage/events`, { title: `${TAG} Razor Gala`, venue: 'Hall', startsAt: new Date(Date.now() + 9 * 86400000).toISOString(), capacity: 5, guestPrice: 250, status: 'PUBLISHED' }, manager.token);
    const gala = j.event;
    const buyer = w.guest; // public event: guests can buy
    [s, j] = await call('POST', `/events/${gala.id}/checkout`, { quantity: 2 }, buyer.token);
    const ticketPay = j.payment;
    check('ticket checkout: Razorpay order for ₹500', fake.orders[ticketPay.providerRef].amount === 50000);
    const tabClosed = studentPays(ticketPay.providerRef, { status: 'captured' });
    const entity = fake.payments[tabClosed.razorpay_payment_id];

    [s] = await webhook('payment.captured', entity, 'wrong-secret');
    check('webhook with bad signature rejected', s === 400);
    [s, j] = await webhook('payment.captured', entity);
    check('webhook accepted', s === 200);
    check('webhook alone confirms payment and issues tickets', (await db.Payment.findByPk(ticketPay.id)).status === 'PAID' && (await db.Ticket.count({ where: { paymentId: ticketPay.id, status: 'VALID' } })) === 2);
    [s] = await webhook('order.paid', entity);
    check('duplicate webhook is idempotent', s === 200 && (await db.LedgerEntry.count({ where: { paymentId: ticketPay.id } })) === 1);
    [s, j] = await call('POST', `/payments/${ticketPay.id}/confirm`, tabClosed, buyer.token);
    check('browser confirm after webhook also fine', s === 200 && j.payment.status === 'PAID');
    [s] = await webhook('payment.captured', { id: 'pay_unknown', order_id: 'order_unknown', amount: 100 });
    check('webhook for unknown order ignored (200)', s === 200);

    // --- Refunds go back through Razorpay
    [s, j] = await call('GET', `/clubs/${club.id}/manage/events/${gala.id}/tickets`, null, manager.token);
    [s, j] = await call('POST', `/clubs/${club.id}/manage/tickets/${j.tickets[0].id}/refund`, {}, manager.token);
    const r1 = fake.refunds.at(-1);
    check('ticket refund → Razorpay refund of ₹250 on the right payment', s === 200 && r1.amount === 25000 && r1.payment_id === tabClosed.razorpay_payment_id, r1);
    const refundEntry = await db.LedgerEntry.findOne({ where: { sourceKey: `refund:ticket:${j.ticket.id}` } });
    check('ledger refund mentions the Razorpay refund id', refundEntry?.description.includes(r1.id));

    // Merch order refund
    const product = await db.Product.create({ clubId: club.id, name: `${TAG} Razor Tee`, price: 400 });
    const variant = await db.ProductVariant.create({ productId: product.id, size: 'M', stock: 5 });
    [s, j] = await call('POST', '/orders', { items: [{ variantId: variant.id, quantity: 2 }] }, buyer.token);
    const order = j.order;
    await call('POST', `/payments/${j.payment.id}/confirm`, studentPays(j.payment.providerRef), buyer.token);
    [s, j] = await call('POST', `/clubs/${club.id}/manage/orders/${order.id}/refund`, {}, manager.token);
    check('order refund → Razorpay refund of ₹800', s === 200 && fake.refunds.at(-1).amount === 80000, fake.refunds.at(-1));

    // --- Paid after the hold expired → automatic refund, nothing delivered
    [s, j] = await call('POST', '/orders', { items: [{ variantId: variant.id, quantity: 1 }] }, buyer.token);
    const lateOrder = j.order;
    const latePay = j.payment;
    await db.sequelize.query('UPDATE payments SET createdAt = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?', { replacements: [latePay.id] });
    const { releaseStaleCheckouts } = require('../src/jobs/membershipJobs');
    await releaseStaleCheckouts();
    const stockAfterRelease = (await db.ProductVariant.findByPk(variant.id)).stock;
    const refundsBefore = fake.refunds.length;
    [s, j] = await call('POST', `/payments/${latePay.id}/confirm`, studentPays(latePay.providerRef), buyer.token);
    check('late payment: 409 telling the student they were refunded', s === 409 && /refunded/i.test(j.message), j);
    check('late payment: full refund issued at Razorpay', fake.refunds.length === refundsBefore + 1 && fake.refunds.at(-1).amount === 40000);
    const lateRow = await db.Payment.findByPk(latePay.id);
    check('late payment marked REFUNDED, order stays cancelled, stock untouched', lateRow.status === 'REFUNDED' && (await db.Order.findByPk(lateOrder.id)).status === 'CANCELLED' && (await db.ProductVariant.findByPk(variant.id)).stock === stockAfterRelease);
    check('no income recorded for the refunded payment', (await db.LedgerEntry.count({ where: { paymentId: latePay.id } })) === 0);

    // --- Gateway errors surface clearly
    process.env.RAZORPAY_KEY_SECRET = 'rotated-wrong-secret';
    [s, j] = await call('POST', `/events/${gala.id}/checkout`, { quantity: 1 }, student.token);
    check('Razorpay auth failure → 502 with message, no seats held', s === 502 && /Razorpay/.test(j.message) && (await db.Ticket.count({ where: { eventId: gala.id, userId: student.id } })) === 0, j);
    process.env.RAZORPAY_KEY_SECRET = 'fake_secret_for_tests_only';
  } finally {
    await new Promise((r) => server.close(r));
    await new Promise((r) => gateway.close(r));
  }
});
