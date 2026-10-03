// Platform Admin: colleges, College Heads and accounts across the whole platform
const crypto = require('crypto');
const { Op } = require('sequelize');
const { QueryTypes } = require('sequelize');
const { sequelize, College, CollegeAdmin, Club, ClubMember, User, Event, Ticket, SupportRequest } = require('../models');
const { utc } = require('../models/helpers');
const { notify } = require('../services/notificationService');
const AppError = require('../utils/AppError');

const escapeLike = (s) => String(s).trim().replace(/[\\%_]/g, '\\$&');

// GET /api/platform/stats
async function stats(req, res) {
  const [colleges, clubs, users, events, tickets, collegeHeads, upcomingEvents, openSupport] = await Promise.all([
    College.count({ where: { status: 'ACTIVE' } }),
    Club.count({ where: { status: 'ACTIVE' } }),
    User.count(),
    Event.count({ where: { status: 'PUBLISHED' } }),
    Ticket.count({ where: { status: 'VALID' } }),
    CollegeAdmin.count({ distinct: true, col: 'userId' }),
    Event.count({ where: { status: 'PUBLISHED', startsAt: { [Op.gte]: new Date() } } }),
    SupportRequest.count({ where: { collegeId: null, status: 'OPEN' } }),
  ]);
  res.json({ colleges, clubs, users, events, tickets, collegeHeads, upcomingEvents, openSupport });
}

// GET /api/platform/colleges — with heads and counts
async function listColleges(req, res) {
  const colleges = await College.findAll({
    include: [{ model: CollegeAdmin, as: 'admins', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }] }],
    order: [['status', 'ASC'], ['name', 'ASC']],
  });
  const counts = async (Model, extra = {}) =>
    Object.fromEntries(
      (await Model.findAll({ attributes: ['collegeId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: extra, group: ['collegeId'], raw: true })).map((r) => [r.collegeId, Number(r.n)])
    );
  const [clubCounts, studentCounts] = await Promise.all([counts(Club, { status: 'ACTIVE' }), counts(User, { collegeStatus: 'VERIFIED' })]);
  res.json({
    colleges: colleges.map((c) => ({ ...c.toJSON(), heads: c.admins.map((a) => a.user), clubs: clubCounts[c.id] || 0, students: studentCounts[c.id] || 0 })),
  });
}

const pickCollege = (b) =>
  Object.fromEntries(['name', 'code', 'city', 'address', 'email', 'phone', 'approveStudents', 'status'].filter((k) => b[k] !== undefined).map((k) => [k, b[k] === '' ? null : b[k]]));

// POST /api/platform/colleges { ..., headEmail? }
async function createCollege(req, res) {
  const college = await sequelize.transaction(async (t) => {
    const c = await College.create({ ...pickCollege(req.body), createdById: req.user.id }, { transaction: t });
    if (req.body.headEmail) await assignHead(c, req.body.headEmail, req.user, t);
    return c;
  });
  res.status(201).json({ college });
}

// PATCH /api/platform/colleges/:id
async function updateCollege(req, res) {
  const college = await College.findByPk(req.params.id);
  if (!college) throw new AppError('College not found', 404);
  await college.update(pickCollege(req.body));
  res.json({ college });
}

async function assignHead(college, email, by, transaction) {
  const user = await User.findOne({ where: { email: String(email || '').trim().toLowerCase() }, transaction });
  if (!user) throw new AppError('No account with that email. Ask them to sign up first.', 404);
  if (user.role === 'PLATFORM_ADMIN') throw new AppError('A Platform Admin cannot also be a College Head. Use a separate account.', 409);
  const [row, created] = await CollegeAdmin.findOrCreate({ where: { collegeId: college.id, userId: user.id }, defaults: { assignedById: by.id }, transaction });
  if (!created) throw new AppError(`${user.name} is already a College Head of ${college.name}`, 409);
  // A College Head belongs to the college they run
  if (user.collegeId !== college.id || user.collegeStatus !== 'VERIFIED') await user.update({ collegeId: college.id, collegeStatus: 'VERIFIED' }, { transaction });
  await notify(user.id, { title: `You are now College Head of ${college.name}`, body: 'Create clubs and appoint club managers from your college dashboard.', link: `/college/${college.id}` }, transaction);
  return row;
}

// POST /api/platform/colleges/:id/heads { email }
async function addHead(req, res) {
  const college = await College.findByPk(req.params.id);
  if (!college) throw new AppError('College not found', 404);
  await assignHead(college, req.body.email, req.user);
  res.status(201).json({ message: 'College Head assigned' });
}

// DELETE /api/platform/colleges/:id/heads/:userId
async function removeHead(req, res) {
  const removed = await CollegeAdmin.destroy({ where: { collegeId: req.params.id, userId: req.params.userId } });
  if (!removed) throw new AppError('Not a College Head of this college', 404);
  res.json({ message: 'College Head removed' });
}

// GET /api/platform/users?search=&collegeId=&page=
async function listUsers(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 25;
  const where = {};
  if (req.query.collegeId) where.collegeId = req.query.collegeId;
  if (req.query.search) {
    const q = `%${escapeLike(req.query.search)}%`;
    where[Op.or] = [{ name: { [Op.like]: q } }, { email: { [Op.like]: q } }, { studentId: { [Op.like]: q } }];
  }
  const { rows, count } = await User.findAndCountAll({
    where,
    include: [{ model: College, as: 'college', attributes: ['id', 'name', 'code'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  res.json({ users: rows, total: count, page, pages: Math.ceil(count / limit) || 1 });
}

// PATCH /api/platform/users/:id { isActive?, role? }
async function updateUser(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  const isSelf = user.id === req.user.id;
  if (isSelf && (req.body.isActive === false || req.body.role === 'USER')) throw new AppError("You can't remove your own access");
  if (req.body.role !== undefined) {
    if (!User.ROLES.includes(req.body.role)) throw new AppError('Invalid role');
    if (req.body.role === 'PLATFORM_ADMIN' && user.role !== 'PLATFORM_ADMIN') {
      // One account, one job: a Platform Admin doesn't belong to a college or run clubs
      if (await CollegeAdmin.count({ where: { userId: user.id } })) throw new AppError(`${user.name} is a College Head. Remove them as head first, or use a separate account.`, 409);
      if (await ClubMember.count({ where: { userId: user.id, status: ['ACTIVE', 'PENDING'] } })) throw new AppError(`${user.name} belongs to clubs. A Platform Admin needs a separate account with no club roles.`, 409);
      user.collegeId = null;
      user.collegeStatus = 'NONE';
    }
    user.role = req.body.role;
  }
  if (req.body.isActive !== undefined) user.isActive = Boolean(req.body.isActive);
  await user.save();
  res.json({ user });
}

// POST /api/platform/users/:id/reset-password
async function resetPassword(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  const temporaryPassword = `Sky-${crypto.randomBytes(3).toString('hex')}`;
  user.password = temporaryPassword;
  await user.save();
  res.json({ temporaryPassword });
}

// GET /api/platform/reports?from&to — every college side by side
async function reports(req, res) {
  const from = req.query.from ? new Date(req.query.from) : new Date('2000-01-01');
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59`) : new Date('2999-01-01');
  const colleges = await College.findAll({ order: [['name', 'ASC']], attributes: ['id', 'name', 'code', 'status'] });
  const q = (sql) => sequelize.query(sql, { replacements: { from: utc(from), to: utc(to) }, type: QueryTypes.SELECT });
  const [clubs, students, events, tickets, money] = await Promise.all([
    q(`SELECT collegeId, COUNT(*) AS n FROM clubs WHERE status = 'ACTIVE' GROUP BY collegeId`),
    q(`SELECT collegeId, COUNT(*) AS n FROM users WHERE collegeStatus = 'VERIFIED' GROUP BY collegeId`),
    q(`SELECT collegeId, COUNT(*) AS n FROM events WHERE status = 'PUBLISHED' AND startsAt BETWEEN :from AND :to GROUP BY collegeId`),
    q(`SELECT e.collegeId, SUM(t.status = 'VALID') AS sold, SUM(t.status = 'VALID' AND t.checkedInAt IS NOT NULL) AS checkedIn
       FROM tickets t JOIN events e ON e.id = t.eventId WHERE e.startsAt BETWEEN :from AND :to GROUP BY e.collegeId`),
    q(`SELECT c.collegeId, SUM(CASE WHEN l.type = 'INCOME' THEN l.amount ELSE 0 END) AS income, SUM(CASE WHEN l.type = 'EXPENSE' THEN l.amount ELSE 0 END) AS expense
       FROM ledger_entries l JOIN clubs c ON c.id = l.clubId WHERE l.date BETWEEN :from AND :to GROUP BY c.collegeId`),
  ]);
  const by = (rows, key = 'n') => Object.fromEntries(rows.map((r) => [r.collegeId, Number(r[key] || 0)]));
  const [c, s, e, sold, inn, out, arrived] = [by(clubs), by(students), by(events), by(tickets, 'sold'), by(money, 'income'), by(money, 'expense'), by(tickets, 'checkedIn')];
  const rows = colleges.map((col) => ({
    ...col.toJSON(),
    clubs: c[col.id] || 0,
    students: s[col.id] || 0,
    events: e[col.id] || 0,
    ticketsSold: sold[col.id] || 0,
    checkedIn: arrived[col.id] || 0,
    income: inn[col.id] || 0,
    expense: out[col.id] || 0,
  }));
  const total = rows.reduce((t, r) => ({ clubs: t.clubs + r.clubs, students: t.students + r.students, events: t.events + r.events, ticketsSold: t.ticketsSold + r.ticketsSold, income: t.income + r.income, expense: t.expense + r.expense }), { clubs: 0, students: 0, events: 0, ticketsSold: 0, income: 0, expense: 0 });
  res.json({ colleges: rows, total });
}

// GET /api/platform/settings — how this installation is configured (no secrets)
async function settings(req, res) {
  const provider = process.env.PAYMENT_PROVIDER === 'razorpay' ? 'razorpay' : 'mock';
  res.json({
    payments: {
      provider,
      mode: provider === 'razorpay' ? (String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : 'test') : 'test',
      webhook: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    },
    email: { configured: Boolean(process.env.SMTP_HOST), from: process.env.MAIL_FROM || null },
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    environment: process.env.NODE_ENV || 'development',
    platformAdmins: await User.count({ where: { role: 'PLATFORM_ADMIN', isActive: true } }),
  });
}

module.exports = { reports, settings, stats, listColleges, createCollege, updateCollege, addHead, removeHead, listUsers, updateUser, resetPassword, assignHead };
