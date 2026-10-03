// Shared helpers for the smoke tests. Test users use @smoke.test emails; test colleges, clubs,
// events etc. are named with "[T…]" so cleanup() removes exactly what the tests made.
require('dotenv').config({ quiet: true });
const { Op } = require('sequelize');
const db = require('../src/models');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const TAG = `[T${stamp}]`;
const SHORT = String(stamp).slice(-6);
let failed = 0;
let seq = 0;

async function call(method, path, body, token) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const type = r.headers.get('content-type') || '';
  return [r.status, type.includes('json') ? await r.json() : await r.text()];
}

function check(label, cond, detail) {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
}

const email = (name) => `${String(name).toLowerCase().replace(/\W+/g, '')}.${stamp}@smoke.test`;

async function platformAdmin() {
  const [, j] = await call('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  return { token: j.token, id: j.user.id };
}

// Signs up a new user (optionally choosing a college)
async function signup(name, collegeId) {
  const [s, j] = await call('POST', '/auth/register', { name, email: email(`${name}${++seq}`), password: 'Smoke@1234', collegeId: collegeId || undefined });
  if (s !== 201) throw new Error(`signup failed for ${name}: ${JSON.stringify(j)}`);
  return { token: j.token, id: j.user.id, email: j.user.email, name, user: j.user };
}

async function relogin(u) {
  const [, j] = await call('POST', '/auth/login', { email: u.email, password: 'Smoke@1234' });
  u.token = j.token;
  return u;
}

// A college (via the Platform Admin) with a College Head
async function makeCollege(admin, label, { approveStudents = true } = {}) {
  const head = await signup(`${label} Head`);
  const code = `${label.replace(/\W/g, '').slice(0, 2).toUpperCase()}${SHORT}`;
  const [s, j] = await call('POST', '/platform/colleges', { name: `${TAG} ${label} College`, code, approveStudents, headEmail: head.email }, admin.token);
  if (s !== 201) throw new Error(`college create failed: ${JSON.stringify(j)}`);
  return { college: j.college, head: await relogin(head) };
}

// A club in a college (via its Head) with a manager
async function makeClub(college, head, label, extra = {}) {
  const manager = await signup(`${label} Manager`, college.id);
  const code = `${label.replace(/\W/g, '').slice(0, 4).toUpperCase()}${seq % 100}`;
  const [s, j] = await call('POST', `/colleges/${college.id}/manage/clubs`, { name: `${TAG} ${label}`, code, description: `${label} club`, managerEmail: manager.email, ...extra }, head.token);
  if (s !== 201) throw new Error(`club create failed: ${JSON.stringify(j)}`);
  return { club: j.club, manager };
}

// Verified student of a college (head approves if the college asks for it)
async function student(name, college, head) {
  const u = await signup(name, college.id);
  if (u.user.collegeStatus === 'PENDING') await call('POST', `/colleges/${college.id}/manage/students/${u.id}/decision`, { decision: 'VERIFIED' }, head.token);
  return u;
}

// Adds a user to a club with a role (manager adds directly)
async function addToClub(club, manager, u, role = 'MEMBER') {
  const [s, j] = await call('POST', `/clubs/${club.id}/manage/members`, { email: u.email, role }, manager.token);
  if (s !== 201) throw new Error(`addToClub failed: ${JSON.stringify(j)}`);
  return j.member;
}

// The standard cast used by most suites
async function makeWorld() {
  const admin = await platformAdmin();
  const A = await makeCollege(admin, 'Alpha'); // approves students
  const B = await makeCollege(admin, 'Beta', { approveStudents: false });
  const { club, manager } = await makeClub(A.college, A.head, 'Coding');
  const treasurer = await student('Tara Treasurer', A.college, A.head);
  const volunteer = await student('Vik Volunteer', A.college, A.head);
  const member = await student('Mia Member', A.college, A.head);
  const collegeStudent = await student('Cal Collegian', A.college, A.head); // same college, not in club
  const external = await student('Eve External', B.college, B.head); // other college (verified)
  const pending = await signup('Pat Pending', A.college.id); // chose Alpha, not approved yet
  const guest = await signup('Gus Guest'); // no college
  await addToClub(club, manager, treasurer, 'TREASURER');
  await addToClub(club, manager, volunteer, 'VOLUNTEER');
  await addToClub(club, manager, member, 'MEMBER');
  return { admin, A, B, club, manager, treasurer, volunteer, member, collegeStudent, external, pending, guest };
}

async function pay(paymentId, token) {
  return call('POST', `/payments/${paymentId}/confirm`, {}, token);
}

const inDays = (d, h = 18) => {
  const x = new Date(Date.now() + d * 86400000);
  x.setUTCHours(h, 0, 0, 0);
  return x.toISOString();
};

// Removes everything the smoke tests created (children before parents)
async function cleanup() {
  const m = db;
  const like = (col) => ({ [col]: { [Op.like]: '[T%' } });
  const users = (await m.User.findAll({ where: { email: { [Op.like]: '%@smoke.test' } }, attributes: ['id'] })).map((u) => u.id);
  const colleges = (await m.College.findAll({ where: like('name'), attributes: ['id'] })).map((c) => c.id);
  const clubs = (await m.Club.findAll({ where: { [Op.or]: [{ collegeId: colleges }, like('name')] }, attributes: ['id'] })).map((c) => c.id);
  const events = (await m.Event.findAll({ where: { [Op.or]: [{ clubId: clubs }, like('title')] }, attributes: ['id'] })).map((e) => e.id);
  const payments = (await m.Payment.findAll({ where: { [Op.or]: [{ userId: users }, { clubId: clubs }] }, attributes: ['id'] })).map((p) => p.id);
  const orders = (await m.Order.findAll({ where: { [Op.or]: [{ userId: users }, { clubId: clubs }] }, attributes: ['id'] })).map((o) => o.id);
  const products = (await m.Product.findAll({ where: { clubId: clubs }, attributes: ['id'] })).map((p) => p.id);

  await m.Notification.destroy({ where: { userId: users } });
  await m.SupportRequest.destroy({ where: { [Op.or]: [{ userId: users }, { collegeId: colleges }] } });
  await m.EventVolunteer.destroy({ where: { [Op.or]: [{ eventId: events }, { userId: users }] } });
  await m.LedgerEntry.destroy({ where: { [Op.or]: [{ clubId: clubs }, { paymentId: payments }] } });
  await m.Ticket.destroy({ where: { [Op.or]: [{ userId: users }, { eventId: events }] } });
  await m.OrderItem.destroy({ where: { orderId: orders } });
  await m.Order.destroy({ where: { id: orders } });
  await m.ExpenseClaim.destroy({ where: { [Op.or]: [{ clubId: clubs }, { claimantId: users }] } });
  await m.Membership.destroy({ where: { [Op.or]: [{ clubId: clubs }, { userId: users }] } });
  await m.Payment.destroy({ where: { id: payments } });
  await m.Task.destroy({ where: { clubId: clubs } });
  await m.Fundraiser.destroy({ where: { clubId: clubs } });
  await m.Event.destroy({ where: { id: events } });
  await m.ProductVariant.destroy({ where: { productId: products } });
  await m.Product.destroy({ where: { id: products } });
  await m.MembershipPlan.destroy({ where: { clubId: clubs } });
  await m.Announcement.destroy({ where: { [Op.or]: [{ collegeId: colleges }, { clubId: clubs }] } });
  await m.Subscriber.destroy({ where: { clubId: clubs } });
  await m.ClubMember.destroy({ where: { [Op.or]: [{ clubId: clubs }, { userId: users }] } });
  await m.Club.destroy({ where: { id: clubs } });
  await m.CollegeAdmin.destroy({ where: { [Op.or]: [{ collegeId: colleges }, { userId: users }] } });
  await m.User.destroy({ where: { id: users } });
  await m.College.destroy({ where: { id: colleges } });
}

async function finish(name) {
  try {
    await cleanup();
  } finally {
    await db.sequelize.close();
  }
  console.log(failed ? `\n${name}: ${failed} check(s) FAILED` : `\n${name}: all checks passed`);
  process.exit(failed ? 1 : 0);
}

function run(name, fn) {
  fn()
    .then(() => finish(name))
    .catch(async (err) => {
      console.error(err);
      failed++;
      await finish(name);
    });
}

module.exports = { db, call, check, email, platformAdmin, signup, relogin, makeCollege, makeClub, student, addToClub, makeWorld, pay, inDays, cleanup, run, TAG, stamp, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
