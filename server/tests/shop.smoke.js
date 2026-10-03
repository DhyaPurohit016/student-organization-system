// Club shops: products with sizes and stock, member prices for THIS club's members,
// one club per order, pickup flow, refunds, and managers limited to their own club
const { db, call, check, makeWorld, makeClub, pay, run, TAG } = require('./helpers');

run('Shop', async () => {
  const w = await makeWorld();
  const { club, manager, member, collegeStudent, external, volunteer, A } = w;
  const { club: music, manager: musicMgr } = await makeClub(A.college, A.head, 'Music');

  let [s, j] = await call('POST', `/clubs/${club.id}/manage/products`, { name: `${TAG} Coding Hoodie`, price: 800, memberPrice: 600, variants: [{ size: 'S', stock: 2 }, { size: 'M', stock: 5 }, { size: 'L', stock: 1 }] }, manager.token);
  check('manager adds a product with sizes', s === 201 && j.product.clubId === club.id, j);
  const hoodieId = j.product.id;
  [s, j] = await call('POST', `/clubs/${music.id}/manage/products`, { name: `${TAG} Music Tee`, price: 400, variants: [{ size: 'One size', stock: 10 }] }, musicMgr.token);
  const teeId = j.product.id;
  [s] = await call('POST', `/clubs/${club.id}/manage/products`, { name: 'x', price: 1, variants: [] }, volunteer.token);
  check('volunteers cannot add products (403)', s === 403);
  [s] = await call('PATCH', `/clubs/${music.id}/manage/products/${hoodieId}`, { price: 1 }, musicMgr.token);
  check("a manager can't edit another club's product", s === 404);
  [s] = await call('POST', `/clubs/${club.id}/manage/products`, { name: 'dup', price: 1, variants: [{ size: 'M', stock: 1 }, { size: 'm', stock: 1 }] }, manager.token);
  check('duplicate sizes rejected', s === 400);

  // --- Public shop per club, member pricing
  [s, j] = await call('GET', `/clubs/${club.id}/products`);
  const hoodie = j.products.find((p) => p.id === hoodieId);
  check("club shop lists only that club's products, with stock per size", hoodie && !j.products.some((p) => p.id === teeId) && hoodie.variants.map((v) => `${v.size}:${v.stock}`).join(',') === 'S:2,M:5,L:1');
  [s, j] = await call('GET', `/clubs/${club.id}/products`, null, member.token);
  check('club member sees member pricing', j.pricing.isMember === true);
  [s, j] = await call('GET', `/clubs/${club.id}/products`, null, collegeStudent.token);
  check('non-member of the club does not', j.pricing.isMember === false);
  const size = Object.fromEntries(hoodie.variants.map((v) => [v.size, v.id]));
  const teeVariant = (await db.ProductVariant.findOne({ where: { productId: teeId } })).id;

  [s, j] = await call('POST', '/orders', { items: [{ variantId: size.M, quantity: 1 }] }, member.token);
  check('club member pays ₹600 (member price)', s === 201 && j.order.total === 600 && j.order.clubId === club.id);
  await pay(j.payment.id, member.token);
  const memberOrder = j.order;
  [s, j] = await call('POST', '/orders', { items: [{ variantId: teeVariant, quantity: 1 }] }, member.token);
  check('…but full price in another club’s shop (₹400)', j.order.total === 400 && j.order.discount === 0);
  await call('POST', `/payments/${j.payment.id}/cancel`, {}, member.token);
  [s, j] = await call('POST', '/orders', { items: [{ variantId: size.M, quantity: 2 }] }, external.token);
  check('students of other colleges can buy at full price', s === 201 && j.order.total === 1600);
  await pay(j.payment.id, external.token);
  const extOrder = j.order;

  [s, j] = await call('POST', '/orders', { items: [{ variantId: size.S, quantity: 1 }, { variantId: teeVariant, quantity: 1 }] }, member.token);
  check('one order cannot mix two clubs’ shops', s === 400 && /different clubs/.test(j.message));
  [s, j] = await call('POST', '/orders', { items: [{ variantId: size.L, quantity: 2 }] }, collegeStudent.token);
  check('more than stock → "Only 1 left"', s === 409 && /Only 1 left/.test(j.message));
  check('stock taken by paid orders (M: 5 → 2)', (await db.ProductVariant.findByPk(size.M)).stock === 2);

  // --- My orders across clubs
  [s, j] = await call('GET', '/me/orders', null, member.token);
  check('my orders show the club', j.orders.some((o) => o.id === memberOrder.id && o.club.name.includes('Coding')));

  // --- Orders admin is per club
  [s, j] = await call('GET', `/clubs/${music.id}/manage/orders`, null, musicMgr.token);
  check("Music manager doesn't see Coding's orders", !j.orders.some((o) => o.id === memberOrder.id));
  [s] = await call('PATCH', `/clubs/${music.id}/manage/orders/${memberOrder.id}`, { status: 'READY' }, musicMgr.token);
  check("…and can't update them", s === 404);
  [s, j] = await call('PATCH', `/clubs/${club.id}/manage/orders/${memberOrder.id}`, { status: 'READY' }, manager.token);
  check('manager marks the order ready', j.order?.status === 'READY');
  [s, j] = await call('PATCH', `/clubs/${club.id}/manage/orders/${memberOrder.id}`, { status: 'COLLECTED' }, manager.token);
  check('…then collected', j.order?.status === 'COLLECTED');
  [s, j] = await call('POST', `/clubs/${club.id}/manage/orders/${extOrder.id}/refund`, {}, manager.token);
  check('refund puts stock back and records it in the club ledger', j.order?.status === 'REFUNDED' && (await db.ProductVariant.findByPk(size.M)).stock === 4 && (await db.LedgerEntry.count({ where: { clubId: club.id, category: 'REFUND' } })) === 1);

  // --- Inventory
  [s, j] = await call('GET', `/clubs/${club.id}/manage/products`, null, manager.token);
  const inv = j.products.find((p) => p.id === hoodieId);
  check('inventory: sold per size', inv.variants.find((v) => v.size === 'M').sold === 1 && inv.totalSold === 1);
  [s] = await call('DELETE', `/clubs/${club.id}/manage/products/${hoodieId}`, null, manager.token);
  check("can't delete a product with orders", s === 409);
  [s] = await call('PATCH', `/clubs/${club.id}/manage/products/${hoodieId}`, { isActive: false }, manager.token);
  [s] = await call('POST', '/orders', { items: [{ variantId: size.S, quantity: 1 }] }, collegeStudent.token);
  check("can't order a hidden product", s === 409);
  [s] = await call('PATCH', `/colleges/${A.college.id}/manage/clubs/${music.id}`, { status: 'ARCHIVED' }, A.head.token);
  [s] = await call('POST', '/orders', { items: [{ variantId: teeVariant, quantity: 1 }] }, collegeStudent.token);
  check("an archived club's shop is closed", s === 409);
});
