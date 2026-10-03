// Help & Support: users ask for help; their College Head (or the Platform Admin) answers
const { SupportRequest, User, College, CollegeAdmin } = require('../models');
const { notify } = require('../services/notificationService');
const AppError = require('../utils/AppError');

const INCLUDE = [
  { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
  { model: User, as: 'resolvedBy', attributes: ['id', 'name'] },
  { model: College, as: 'college', attributes: ['id', 'name', 'code'] },
];

// POST /api/support { subject, message, to: 'COLLEGE' | 'PLATFORM' }
// Goes to the College Head of my college; to the Platform Admin when I have no college, I head a
// college myself, or I choose the platform.
async function create(req, res) {
  const { subject, message, to } = req.body;
  const heads = await CollegeAdmin.count({ where: { userId: req.user.id } });
  const collegeId = to === 'PLATFORM' || !req.user.collegeId || heads ? null : req.user.collegeId;
  const request = await SupportRequest.create({ userId: req.user.id, collegeId, subject, message });

  const recipients = collegeId
    ? (await CollegeAdmin.findAll({ where: { collegeId }, attributes: ['userId'] })).map((h) => h.userId)
    : (await User.findAll({ where: { role: 'PLATFORM_ADMIN', isActive: true }, attributes: ['id'] })).map((u) => u.id);
  await notify(
    recipients.filter((id) => id !== req.user.id),
    { title: `Help request: ${subject}`, body: `From ${req.user.name}`, link: collegeId ? `/college/${collegeId}/support` : '/platform/support' }
  );
  res.status(201).json({ request });
}

// GET /api/me/support — my requests and their answers
async function mine(req, res) {
  res.json({ requests: await SupportRequest.findAll({ where: { userId: req.user.id }, include: INCLUDE, order: [['createdAt', 'DESC']] }) });
}

// Inbox for one recipient: collegeId = a college, or null = the platform
async function inbox(collegeId, status) {
  const where = { collegeId };
  if (status) where.status = status;
  const [requests, open] = await Promise.all([
    SupportRequest.findAll({ where, include: INCLUDE, order: [['status', 'ASC'], ['createdAt', 'DESC']], limit: 300 }),
    SupportRequest.count({ where: { collegeId, status: 'OPEN' } }),
  ]);
  return { requests, open };
}

async function resolve(collegeId, req) {
  const request = await SupportRequest.findOne({ where: { id: req.params.requestId, collegeId } });
  if (!request) throw new AppError('Request not found', 404);
  if (request.status === 'RESOLVED') throw new AppError('This request is already resolved', 409);
  const reply = String(req.body.reply || '').trim();
  if (!reply) throw new AppError('Write a reply so the person knows what to do');
  await request.update({ status: 'RESOLVED', reply, resolvedById: req.user.id, resolvedAt: new Date() });
  await notify(request.userId, { title: `Answer to: ${request.subject}`, body: reply.slice(0, 200), link: '/help' });
  return request;
}

// Platform Admin: /api/platform/support
const platformInbox = async (req, res) => res.json(await inbox(null, req.query.status));
const platformResolve = async (req, res) => res.json({ request: await resolve(null, req) });

// College Head: /api/colleges/:collegeId/manage/support
const collegeInbox = async (req, res) => res.json(await inbox(req.college.id, req.query.status));
const collegeResolve = async (req, res) => res.json({ request: await resolve(req.college.id, req) });

module.exports = { create, mine, platformInbox, platformResolve, collegeInbox, collegeResolve };
