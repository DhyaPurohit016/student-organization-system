// Deactivating a college switches off everything in it: logins, clubs, events, shop, news.
// Reactivating brings it all back. Other colleges and the Platform Admin carry on as normal.
const { db, call, check, makeWorld, makeClub, addToClub, inDays, run, TAG } = require('./helpers');

run('Deactivate', async () => {
  const w = await makeWorld();
  const { admin, A, B, club, manager, volunteer, member, external, guest } = w;
  let s, j;

  // Something in the college to hide: a public event, a product, a public announcement
  [s, j] = await call('POST', `/clubs/${club.id}/manage/events`, { title: `${TAG} Fest`, venue: 'Hall', startsAt: inDays(5), capacity: 50, guestPrice: 0, status: 'PUBLISHED' }, manager.token);
  const fest = j.event;
  [s, j] = await call('POST', `/clubs/${club.id}/manage/products`, { name: `${TAG} Tee`, price: 300, variants: [{ size: 'M', stock: 5 }] }, manager.token);
  const tee = j.product;
  await call('POST', `/clubs/${club.id}/manage/announcements`, { title: `${TAG} Big news`, body: 'Hello', audience: 'PUBLIC', publish: true }, manager.token);
  // A student of the OTHER college who volunteers in this college's club
  await addToClub(club, manager, external, 'VOLUNTEER');
  // B's own club keeps working throughout
  const { club: bClub, manager: bManager } = await makeClub(B.college, B.head, 'Chess');

  [s] = await call('PATCH', `/platform/colleges/${A.college.id}`, { status: 'INACTIVE' }, admin.token);
  check('Platform Admin deactivates college A', s === 200);

  // ---------- Nobody from college A can log in or keep using a session ----------
  [s, j] = await call('POST', '/auth/login', { email: A.head.email, password: 'Smoke@1234' });
  check("A's College Head can't log in (403)", s === 403 && /deactivated/.test(j.message), j);
  [s] = await call('POST', '/auth/login', { email: manager.email, password: 'Smoke@1234' });
  check("A's club manager can't log in", s === 403);
  [s] = await call('POST', '/auth/login', { email: member.email, password: 'Smoke@1234' });
  check("A's students can't log in", s === 403);
  [s] = await call('GET', '/me/context', null, volunteer.token);
  check('sessions already open are ended straight away (401)', s === 401);
  [s] = await call('GET', `/colleges/${A.college.id}/manage`, null, A.head.token);
  check("A's College Head is locked out of the college workspace", s === 401);

  // ---------- Nothing from college A is visible or usable ----------
  [s, j] = await call('GET', '/colleges');
  check('college A is gone from the college list (and sign-up)', !j.colleges.some((c) => c.id === A.college.id));
  [s, j] = await call('POST', '/auth/register', { name: 'Late Joiner', email: `late.${Date.now()}@smoke.test`, password: 'Smoke@1234', collegeId: A.college.id });
  check("nobody can sign up to college A", s === 400);
  [s, j] = await call('GET', '/clubs');
  check("A's clubs are gone from the directory", !j.clubs.some((c) => c.id === club.id));
  [s] = await call('GET', `/clubs/${club.id}`);
  check("A's club page is gone (404)", s === 404);
  [s, j] = await call('GET', `/events?clubId=${club.id}`, null, guest.token);
  check("A's events are gone from the events list", s === 200 && !j.events.some((e) => e.id === fest.id));
  [s, j] = await call('GET', `/events?collegeId=${A.college.id}`, null, guest.token);
  check("...even when asking for college A's events directly", s === 200 && j.events.length === 0);
  [s, j] = await call('GET', `/announcements?collegeId=${A.college.id}`);
  check("...and college A's news", s === 200 && j.announcements.length === 0);
  [s] = await call('GET', `/events/${fest.id}`, null, guest.token);
  check("A's event page is gone (404)", s === 404);
  [s] = await call('POST', `/events/${fest.id}/checkout`, { quantity: 1 }, guest.token);
  check("nobody can register for A's events", s === 404);
  [s] = await call('GET', `/clubs/${club.id}/products`);
  check("A's shop is gone (404)", s === 404);
  const teeSize = await db.ProductVariant.findOne({ where: { productId: tee.id } });
  [s, j] = await call('POST', '/orders', { items: [{ variantId: teeSize.id, quantity: 1 }] }, guest.token);
  check("nobody can buy from A's shop (shop closed)", s === 409 && /closed/.test(j.message), j);
  [s] = await call('POST', `/clubs/${club.id}/join`, {}, guest.token);
  check("nobody can join A's clubs", s === 404);
  [s, j] = await call('GET', '/announcements');
  check("A's announcements are gone from the news", !j.announcements.some((a) => a.title === `${TAG} Big news`));
  [s] = await call('GET', `/clubs/${club.id}/manage`, null, external.token);
  check("members from other colleges can't open A's club workspace (410)", s === 410);
  [s, j] = await call('GET', '/me/context', null, external.token);
  check('...but they can still log in and use their own college', s === 200);

  // ---------- Everyone else carries on ----------
  [s, j] = await call('POST', '/auth/login', { email: B.head.email, password: 'Smoke@1234' });
  check("college B's head still logs in", s === 200);
  [s] = await call('GET', `/clubs/${bClub.id}/manage`, null, bManager.token);
  check("college B's clubs keep working", s === 200);
  [s, j] = await call('GET', '/platform/colleges', null, admin.token);
  check('Platform Admin still sees college A (as deactivated)', j.colleges.some((c) => c.id === A.college.id && c.status === 'INACTIVE'));

  // ---------- Reactivate: everything comes back ----------
  [s] = await call('PATCH', `/platform/colleges/${A.college.id}`, { status: 'ACTIVE' }, admin.token);
  [s] = await call('POST', '/auth/login', { email: A.head.email, password: 'Smoke@1234' });
  check("after reactivating, A's College Head logs in again", s === 200);
  [s] = await call('GET', '/me/context', null, volunteer.token);
  check('old sessions work again', s === 200);
  [s] = await call('GET', `/clubs/${club.id}`);
  check("A's club page is back", s === 200);
  [s, j] = await call('GET', `/events?clubId=${club.id}`, null, guest.token);
  check("A's events are back", j.events.some((e) => e.id === fest.id));
});
