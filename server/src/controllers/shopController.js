const { Op } = require('sequelize');
const { sequelize, Product, ProductVariant, Order, OrderItem, User, Club } = require('../models');
const shopService = require('../services/shopService');
const AppError = require('../utils/AppError');

const variantOrder = [[{ model: ProductVariant, as: 'variants' }, 'sortOrder', 'ASC'], [{ model: ProductVariant, as: 'variants' }, 'id', 'ASC']];

// ---------- Members ----------

// POST /api/orders { items: [{ variantId, quantity }], note } — all items must be from one club's shop
async function createOrder(req, res) {
  const result = await shopService.createOrder(req.user, req.body.items, req.body.note);
  res.status(201).json(result);
}

// GET /api/me/orders
async function myOrders(req, res) {
  const orders = await Order.findAll({
    where: { userId: req.user.id, status: { [Op.ne]: 'CANCELLED' } },
    include: [{ model: OrderItem, as: 'items' }, { model: Club, as: 'club', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json({ orders });
}

// ---------- Club manager (req.club from clubGuard) ----------

const clubProduct = async (req, t) => {
  const p = await Product.findOne({ where: { id: req.params.productId, clubId: req.club.id }, transaction: t });
  if (!p) throw new AppError('Product not found', 404);
  return p;
};
const clubOrder = async (req) => {
  const o = await Order.findOne({ where: { id: req.params.orderId, clubId: req.club.id } });
  if (!o) throw new AppError('Order not found', 404);
  return o;
};

// GET /api/clubs/:clubId/manage/products — every product with stock and units sold per size
async function adminList(req, res) {
  const products = await Product.findAll({ where: { clubId: req.club.id }, include: [{ model: ProductVariant, as: 'variants' }], order: [['isActive', 'DESC'], ['name', 'ASC'], ...variantOrder] });
  const sold = await shopService.soldByVariant(products.flatMap((p) => p.variants.map((v) => v.id)));
  res.json({
    products: products.map((p) => {
      const variants = p.variants.map((v) => ({ ...v.toJSON(), sold: sold[v.id] || 0 }));
      return {
        ...p.toJSON(),
        variants,
        totalStock: variants.reduce((a, v) => a + v.stock, 0),
        totalSold: variants.reduce((a, v) => a + v.sold, 0),
        lowStock: variants.some((v) => v.stock > 0 && v.stock <= 3),
      };
    }),
  });
}

function pickProduct(body) {
  const out = {};
  for (const k of ['name', 'description', 'imageUrl', 'price', 'memberPrice', 'isActive']) {
    if (body[k] !== undefined) out[k] = body[k] === '' && ['memberPrice', 'imageUrl', 'description'].includes(k) ? null : body[k];
  }
  return out;
}

// Applies the size list from the form: updates existing sizes, adds new ones, removes
// sizes that were dropped (only if nobody has ordered them; otherwise they're set to 0 stock)
async function syncVariants(product, variants = [], t) {
  if (!Array.isArray(variants)) throw new AppError('Sizes must be a list');
  const seen = new Set();
  for (const [i, v] of variants.entries()) {
    const size = String(v.size || '').trim();
    if (!size) throw new AppError('Every size needs a name');
    if (seen.has(size.toLowerCase())) throw new AppError(`Size "${size}" is listed twice`);
    seen.add(size.toLowerCase());
    if (!(Number(v.stock) >= 0)) throw new AppError(`Stock for ${size} must be 0 or more`);
  }

  const existing = await ProductVariant.findAll({ where: { productId: product.id }, transaction: t });
  const keepIds = new Set();
  for (const [i, v] of variants.entries()) {
    const size = String(v.size).trim();
    const match = existing.find((e) => (v.id && e.id === Number(v.id)) || e.size.toLowerCase() === size.toLowerCase());
    if (match) {
      await match.update({ size, stock: Number(v.stock), sortOrder: i }, { transaction: t });
      keepIds.add(match.id);
    } else {
      const created = await ProductVariant.create({ productId: product.id, size, stock: Number(v.stock), sortOrder: i }, { transaction: t });
      keepIds.add(created.id);
    }
  }
  for (const e of existing.filter((x) => !keepIds.has(x.id))) {
    const used = await OrderItem.count({ where: { variantId: e.id }, transaction: t });
    // Old orders point at this size, so keep it, but with no stock and at the end of the list
    if (used) await e.update({ stock: 0, sortOrder: 999 }, { transaction: t });
    else await e.destroy({ transaction: t });
  }
}

// POST /api/clubs/:clubId/manage/products { ...product, variants: [{ size, stock }] }
async function create(req, res) {
  const product = await sequelize.transaction(async (t) => {
    const p = await Product.create({ ...pickProduct(req.body), clubId: req.club.id }, { transaction: t });
    await syncVariants(p, req.body.variants || [], t);
    return p;
  });
  res.status(201).json({ product });
}

// PATCH /api/clubs/:clubId/manage/products/:productId
async function update(req, res) {
  const product = await sequelize.transaction(async (t) => {
    const p = await clubProduct(req, t);
    await p.update(pickProduct(req.body), { transaction: t });
    if (req.body.variants) await syncVariants(p, req.body.variants, t);
    return p;
  });
  res.json({ product });
}

// DELETE /api/clubs/:clubId/manage/products/:productId — only if never ordered; otherwise hide it
async function remove(req, res) {
  await clubProduct(req);
  if (await OrderItem.count({ where: { productId: req.params.productId } })) {
    throw new AppError('This product has orders. Hide it from the shop instead.', 409);
  }
  const deleted = await Product.destroy({ where: { id: req.params.productId, clubId: req.club.id } });
  if (!deleted) throw new AppError('Product not found', 404);
  res.json({ message: 'Product deleted' });
}

// GET /api/clubs/:clubId/manage/orders?status=&search=
async function adminOrders(req, res) {
  const where = { clubId: req.club.id, status: { [Op.ne]: 'CANCELLED' } };
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) {
    const q = `%${String(req.query.search).trim()}%`;
    where[Op.or] = [{ orderNumber: { [Op.like]: q } }, { '$user.name$': { [Op.like]: q } }, { '$user.email$': { [Op.like]: q } }];
  }
  const orders = await Order.findAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] },
      { model: OrderItem, as: 'items' },
    ],
    order: [['createdAt', 'DESC']],
    limit: 300,
  });
  const counts = await Order.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { clubId: req.club.id }, group: ['status'], raw: true });
  res.json({ orders, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
}

// PATCH /api/clubs/:clubId/manage/orders/:orderId { status: 'READY' | 'COLLECTED' }
async function setStatus(req, res) {
  const order = await clubOrder(req);
  res.json({ order: await shopService.advanceStatus(order.id, req.body.status) });
}

// POST /api/clubs/:clubId/manage/orders/:orderId/refund
async function refund(req, res) {
  const order = await clubOrder(req);
  res.json({ order: await shopService.refundOrder(order.id, req.user.id) });
}

module.exports = { createOrder, myOrders, adminList, create, update, remove, adminOrders, setStatus, refund };
