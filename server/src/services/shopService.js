const { Op } = require('sequelize');
const { sequelize, Product, ProductVariant, Order, OrderItem, Payment, User, Counter, Club } = require('../models');
const membershipService = require('./membershipService');
const access = require('./access');
const paymentService = require('./paymentService');
const { notify } = require('./notificationService');
const { sendEmail } = require('../utils/email');
const AppError = require('../utils/AppError');

const MAX_QTY_PER_LINE = 10;
const round2 = (n) => Math.round(n * 100) / 100;

// Price a member pays for one item: the product's fixed member price, or the plan's merch discount
function memberUnitPrice(product, discountPercent) {
  if (product.memberPrice !== null && product.memberPrice !== undefined) return product.memberPrice;
  return round2(product.price * (1 - (discountPercent || 0) / 100));
}

async function orderNumber(transaction) {
  const year = new Date().getFullYear();
  const seq = await Counter.next(`order-${year}`, transaction);
  return `ORD-${year}-${String(seq).padStart(5, '0')}`;
}

// Creates an order from cart lines [{ variantId, quantity }]. Stock is taken immediately
// (so two people can't buy the last hoodie) and given back if the order isn't paid in time.
async function createOrder(user, lines, note) {
  if (!Array.isArray(lines) || !lines.length) throw new AppError('Your cart is empty');

  // Merge duplicate lines for the same size
  const wanted = new Map();
  for (const line of lines) {
    const id = parseInt(line.variantId, 10);
    const qty = parseInt(line.quantity, 10);
    if (!id || !(qty >= 1)) throw new AppError('Invalid cart item');
    wanted.set(id, (wanted.get(id) || 0) + qty);
  }
  for (const qty of wanted.values()) if (qty > MAX_QTY_PER_LINE) throw new AppError(`You can order up to ${MAX_QTY_PER_LINE} of each item`);

  return sequelize.transaction(async (t) => {
    // Lock the variant rows (sorted ids, so concurrent orders lock in the same order: no deadlocks)
    const ids = [...wanted.keys()].sort((a, b) => a - b);
    const variants = await ProductVariant.findAll({ where: { id: ids }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
    if (variants.length !== ids.length) throw new AppError('One of the items is no longer available', 409);
    const products = await Product.findAll({ where: { id: [...new Set(variants.map((v) => v.productId))] }, transaction: t });
    const productById = Object.fromEntries(products.map((p) => [p.id, p]));

    // Each club runs its own shop, so one order = one club
    const clubIds = [...new Set(products.map((p) => p.clubId))];
    if (clubIds.length !== 1) throw new AppError('Your cart has items from different clubs. Please order from one club at a time.');
    const club = await Club.findByPk(clubIds[0], { transaction: t });
    if (!(await access.isClubOpen(club))) throw new AppError("This club's shop is closed", 409);

    // Member prices go to approved members of THIS club (plus any discount from their paid plan)
    const standing = await access.clubAccess(user, club, t);
    const membership = standing.isMember ? { merchDiscountPercent: (await membershipService.getBenefits(user.id, club.id, t))?.merchDiscountPercent || 0 } : null;
    const discount = membership?.merchDiscountPercent || 0;

    const items = [];
    for (const v of variants) {
      const product = productById[v.productId];
      const qty = wanted.get(v.id);
      if (!product?.isActive) throw new AppError(`${product?.name || 'An item'} is no longer for sale`, 409);
      if (v.stock < qty) {
        throw new AppError(v.stock === 0 ? `${product.name} (${v.size}) is sold out` : `Only ${v.stock} left of ${product.name} (${v.size})`, 409);
      }
      const unit = membership ? memberUnitPrice(product, discount) : product.price;
      items.push({
        variantId: v.id,
        productId: product.id,
        productName: product.name,
        size: v.size,
        quantity: qty,
        unitPrice: unit,
        fullPrice: product.price,
        lineTotal: round2(unit * qty),
      });
      await v.decrement('stock', { by: qty, transaction: t });
    }

    const subtotal = round2(items.reduce((a, i) => a + i.fullPrice * i.quantity, 0));
    const total = round2(items.reduce((a, i) => a + i.lineTotal, 0));
    const order = await Order.create(
      {
        clubId: club.id,
        orderNumber: await orderNumber(t),
        userId: user.id,
        subtotal,
        discount: round2(subtotal - total),
        total,
        memberDiscountApplied: Boolean(membership) && total < subtotal,
        note: note ? String(note).slice(0, 300) : null,
      },
      { transaction: t }
    );
    await OrderItem.bulkCreate(items.map((i) => ({ ...i, orderId: order.id })), { transaction: t });

    if (total === 0) {
      await order.update({ status: 'PAID', paidAt: new Date() }, { transaction: t });
      return { order, payment: null };
    }
    const payment = await paymentService.createOnlinePayment({ clubId: club.id, userId: user.id, amount: total, purpose: 'MERCH', referenceId: order.id }, t);
    await order.update({ paymentId: payment.id }, { transaction: t });
    return { order, payment };
  });
}

async function restoreStock(orderId, t) {
  const items = await OrderItem.findAll({ where: { orderId }, transaction: t });
  for (const item of items.sort((a, b) => a.variantId - b.variantId)) {
    await ProductVariant.increment('stock', { by: item.quantity, where: { id: item.variantId }, transaction: t });
  }
}

async function onPaid(payment, t) {
  const order = await Order.findByPk(payment.referenceId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status !== 'PENDING_PAYMENT') {
    if (order.status === 'CANCELLED') throw new AppError('This order expired. Please place it again.', 409);
    return order; // already paid
  }
  await order.update({ status: 'PAID', paidAt: new Date() }, { transaction: t });
  await notify(order.userId, { title: `Order ${order.orderNumber} confirmed`, body: "We'll let you know when it's ready to collect.", link: '/orders' }, t);
  const user = await User.findByPk(order.userId, { transaction: t });
  t.afterCommit(() =>
    sendEmail({
      to: user.email,
      subject: `Order ${order.orderNumber} confirmed`,
      text: `Hi ${user.name},\n\nThanks for your order (₹${order.total}). We'll email you when it's ready to collect.`,
    }).catch((err) => console.error('Order email failed:', err.message))
  );
  return order;
}

async function onCancelled(payment, t) {
  const order = await Order.findByPk(payment.referenceId, { transaction: t, lock: t.LOCK.UPDATE });
  if (order?.status === 'PENDING_PAYMENT') {
    await order.update({ status: 'CANCELLED' }, { transaction: t });
    await restoreStock(order.id, t);
  }
}

// ---------- Admin ----------

const NEXT_STATUS = { PAID: 'READY', READY: 'COLLECTED' };

async function advanceStatus(orderId, status) {
  return sequelize.transaction(async (t) => {
    const order = await Order.findByPk(orderId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!order) throw new AppError('Order not found', 404);
    if (NEXT_STATUS[order.status] !== status) throw new AppError(`Can't move an order from ${order.status} to ${status}`, 409);

    const stamp = status === 'READY' ? { readyAt: new Date() } : { collectedAt: new Date() };
    await order.update({ status, ...stamp }, { transaction: t });
    if (status === 'READY') {
      await notify(order.userId, { title: `Order ${order.orderNumber} is ready`, body: 'Collect it from the club table.', link: '/orders' }, t);
      const user = await User.findByPk(order.userId, { transaction: t });
      t.afterCommit(() =>
        sendEmail({ to: user.email, subject: `Order ${order.orderNumber} is ready to collect`, text: `Hi ${user.name},\n\nYour order is ready. Pick it up from the club table.` }).catch(
          (err) => console.error('Order email failed:', err.message)
        )
      );
    }
    return order;
  });
}

// Refunds a paid (not yet collected) order and puts the items back in stock
async function refundOrder(orderId, adminId) {
  return sequelize.transaction(async (t) => {
    const order = await Order.findByPk(orderId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!order) throw new AppError('Order not found', 404);
    if (!['PAID', 'READY'].includes(order.status)) throw new AppError('Only paid orders that are not yet collected can be refunded', 409);

    await order.update({ status: 'REFUNDED' }, { transaction: t });
    await restoreStock(order.id, t);
    if (order.paymentId) {
      const payment = await Payment.findByPk(order.paymentId, { transaction: t, lock: t.LOCK.UPDATE });
      await paymentService.refund(payment, { amount: order.total, key: `order:${order.id}`, description: `Order refund ${order.orderNumber}`, recordedById: adminId, full: true }, t);
    }
    await notify(order.userId, { title: `Order ${order.orderNumber} refunded`, body: `₹${order.total} has been refunded.`, link: '/orders' }, t);
    return order;
  });
}

// Units sold per variant (paid, ready or collected orders)
async function soldByVariant(variantIds) {
  const rows = await OrderItem.findAll({
    attributes: ['variantId', [sequelize.fn('SUM', sequelize.col('quantity')), 'sold']],
    where: { variantId: { [Op.in]: variantIds } },
    include: [{ model: Order, as: 'order', attributes: [], where: { status: { [Op.in]: ['PAID', 'READY', 'COLLECTED'] } } }],
    group: ['variantId'],
    raw: true,
  });
  return Object.fromEntries(rows.map((r) => [r.variantId, Number(r.sold)]));
}

module.exports = { memberUnitPrice, createOrder, onPaid, onCancelled, advanceStatus, refundOrder, soldByVariant, restoreStock };
