// Club Manager's workspace: dashboard, club settings, members & roles, membership plans, dues
const { Op } = require('sequelize');
const { sequelize, ClubMember, User, College, MembershipPlan, Membership, Payment, Event, Ticket, Order, ExpenseClaim, Task, EventVolunteer } = require('../models');
const clubMemberService = require('../services/clubMemberService');
const membershipService = require('../services/membershipService');
const paymentService = require('../services/paymentService');
const ledgerService = require('../services/ledgerService');
const AppError = require('../utils/AppError');

// GET /api/clubs/:clubId/manage — dashboard (any club staff can see it; money only for manager/treasurer)
async function dashboard(req, res) {
  const club = req.club;
  const now = new Date();
  const [members, pendingRequests, staff, upcomingEvents, ticketsSold, ordersToHandle, claimsToReview, overdueTasks, nextEvents, pendingTasks, participants, pendingVolunteers] = await Promise.all([
    ClubMember.count({ where: { clubId: club.id, status: 'ACTIVE' } }),
    ClubMember.count({ where: { clubId: club.id, status: 'PENDING' } }),
    ClubMember.count({ where: { clubId: club.id, status: 'ACTIVE', role: { [Op.ne]: 'MEMBER' } } }),
    Event.count({ where: { clubId: club.id, status: 'PUBLISHED', startsAt: { [Op.gte]: now } } }),
    Ticket.count({ where: { status: 'VALID' }, include: [{ model: Event, as: 'event', attributes: [], where: { clubId: club.id } }] }),
    Order.count({ where: { clubId: club.id, status: { [Op.in]: ['PAID', 'READY'] } } }),
    ExpenseClaim.count({ where: { clubId: club.id, status: { [Op.in]: ['SUBMITTED', 'APPROVED'] } } }),
    Task.count({ where: { clubId: club.id, status: { [Op.ne]: 'DONE' }, dueDate: { [Op.lt]: now.toISOString().slice(0, 10) } } }),
    Event.findAll({ where: { clubId: club.id, status: 'PUBLISHED', startsAt: { [Op.gte]: now } }, order: [['startsAt', 'ASC']], limit: 3, attributes: ['id', 'title', 'startsAt', 'capacity', 'visibility'] }),
    Task.count({ where: { clubId: club.id, status: { [Op.ne]: 'DONE' } } }),
    Ticket.count({ where: { status: 'VALID' }, include: [{ model: Event, as: 'event', attributes: [], where: { clubId: club.id, startsAt: { [Op.gte]: now } } }] }),
    EventVolunteer.count({ where: { status: 'PENDING' }, include: [{ model: Event, as: 'event', attributes: [], where: { clubId: club.id, startsAt: { [Op.gte]: now } } }] }),
  ]);
  const soldBy = nextEvents.length
    ? Object.fromEntries(
        (await Ticket.findAll({ attributes: ['eventId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { eventId: nextEvents.map((e) => e.id), status: 'VALID' }, group: ['eventId'], raw: true })).map((r) => [r.eventId, Number(r.n)])
      )
    : {};
  const finance = req.access.can.finance ? await ledgerService.summary({ clubIds: [club.id] }) : null;

  res.json({
    club,
    myRole: req.access.role,
    overseer: req.access.overseer,
    can: req.access.can,
    counts: { members, pendingRequests, staff, upcomingEvents, ticketsSold, participants, pendingTasks, pendingExpenses: claimsToReview },
    todo: { pendingRequests, ordersToHandle, claimsToReview, overdueTasks, pendingVolunteers },
    nextEvents: nextEvents.map((e) => ({ ...e.toJSON(), sold: soldBy[e.id] || 0 })),
    finance: finance && { totalIncome: finance.totalIncome, totalExpense: finance.totalExpense, balance: finance.balance, monthly: finance.monthly.slice(-6), income: finance.income },
  });
}

// PATCH /api/clubs/:clubId/manage/settings — profile and "requires dues"
async function updateSettings(req, res) {
  const allowed = ['name', 'description', 'logoUrl', 'requiresDues'];
  const changes = Object.fromEntries(allowed.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k] === '' ? null : req.body[k]]));
  if (changes.requiresDues && !(await MembershipPlan.count({ where: { clubId: req.club.id, isActive: true } }))) {
    throw new AppError('Create a membership plan first, then switch on "requires dues"');
  }
  await req.club.update(changes);
  res.json({ club: req.club });
}

// GET /api/clubs/:clubId/manage/members?status=&role=&search=
async function listMembers(req, res) {
  const where = { clubId: req.club.id };
  where.status = req.query.status || 'ACTIVE';
  if (req.query.role) where.role = req.query.role;
  const userWhere = {};
  if (req.query.search) {
    const q = `%${String(req.query.search).trim()}%`;
    userWhere[Op.or] = [{ name: { [Op.like]: q } }, { email: { [Op.like]: q } }, { studentId: { [Op.like]: q } }];
  }
  const rows = await ClubMember.findAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'phone', 'studentId', 'collegeId', 'collegeStatus'],
        where: userWhere,
        include: [{ model: College, as: 'college', attributes: ['id', 'name', 'code'] }],
      },
      { model: User, as: 'decidedBy', attributes: ['id', 'name'] },
    ],
    order: [['role', 'ASC'], ['createdAt', 'DESC']],
    limit: 500,
  });

  // Current dues per member (for clubs that charge)
  const dues = req.club.requiresDues || (await MembershipPlan.count({ where: { clubId: req.club.id } }))
    ? Object.fromEntries(
        (await Membership.findAll({ where: { clubId: req.club.id, userId: rows.map((r) => r.userId), status: 'ACTIVE', endDate: { [Op.gt]: new Date() } }, order: [['endDate', 'ASC']] })).map((m) => [m.userId, m])
      )
    : {};
  const counts = await ClubMember.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { clubId: req.club.id }, group: ['status'], raw: true });
  res.json({
    members: rows.map((r) => ({
      ...r.toJSON(),
      sameCollege: r.user.collegeId === req.club.collegeId && r.user.collegeStatus === 'VERIFIED',
      dues: dues[r.userId] ? { planName: dues[r.userId].planName, endDate: dues[r.userId].endDate } : null,
      duesOk: !req.club.requiresDues || r.role !== 'MEMBER' || Boolean(dues[r.userId]),
    })),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
  });
}

// POST /api/clubs/:clubId/manage/members/:memberId/decision { decision: APPROVE|REJECT, note }
async function decide(req, res) {
  const { decision, note } = req.body;
  if (!['APPROVE', 'REJECT'].includes(decision)) throw new AppError('Decision must be APPROVE or REJECT');
  res.json({ member: await clubMemberService.decide(req.club, req.params.memberId, decision, req.user, note) });
}

// POST /api/clubs/:clubId/manage/members { email, role }
async function addMember(req, res) {
  const role = req.body.role || 'MEMBER';
  if (role === 'MANAGER' && !req.access.overseer) throw new AppError('Only the College Head can appoint club managers', 403);
  res.status(201).json({ member: await clubMemberService.addByEmail(req.club, req.body.email, role, req.user) });
}

// PATCH /api/clubs/:clubId/manage/members/:memberId { role }
async function changeRole(req, res) {
  res.json({ member: await clubMemberService.changeRole(req.club, req.params.memberId, req.body.role, req.user, req.access) });
}

// DELETE /api/clubs/:clubId/manage/members/:memberId
async function removeMember(req, res) {
  await clubMemberService.remove(req.club, req.params.memberId, req.access);
  res.json({ message: 'Removed from the club' });
}

// POST /api/clubs/:clubId/manage/members/:memberId/dues { planId, paymentMethod, note } — dues paid in person
async function recordDues(req, res) {
  const cm = await ClubMember.findOne({ where: { id: req.params.memberId, clubId: req.club.id, status: 'ACTIVE' } });
  if (!cm) throw new AppError('Member not found', 404);
  const plan = await MembershipPlan.findOne({ where: { id: req.body.planId, clubId: req.club.id } });
  if (!plan) throw new AppError('Plan not found', 404);
  const membership = await sequelize.transaction(async (t) => {
    const m = await membershipService.createPending(cm.userId, plan.id, t);
    const p = await paymentService.recordManualPayment(
      { clubId: req.club.id, userId: cm.userId, amount: m.planPrice, purpose: 'MEMBERSHIP', referenceId: m.id, method: req.body.paymentMethod || 'CASH', recordedById: req.user.id, note: req.body.note },
      t
    );
    return membershipService.activate(m.id, p.id, t);
  });
  res.status(201).json({ membership });
}

// GET /api/clubs/:clubId/manage/members/:memberId — one member's history in this club
async function memberDetail(req, res) {
  const cm = await ClubMember.findOne({
    where: { id: req.params.memberId, clubId: req.club.id },
    include: [{ model: User, as: 'user', attributes: { exclude: ['password'] }, include: [{ model: College, as: 'college', attributes: ['id', 'name'] }] }],
  });
  if (!cm) throw new AppError('Member not found', 404);
  const [memberships, payments] = await Promise.all([
    Membership.findAll({ where: { clubId: req.club.id, userId: cm.userId, status: { [Op.ne]: 'PENDING' } }, order: [['createdAt', 'DESC']] }),
    Payment.findAll({ where: { clubId: req.club.id, userId: cm.userId, status: { [Op.in]: ['PAID', 'REFUNDED'] } }, order: [['paidAt', 'DESC']], include: [{ model: User, as: 'recordedBy', attributes: ['id', 'name'] }] }),
  ]);
  res.json({ member: cm, memberships, payments, card: await clubMemberService.cardQr(cm) });
}

// ---------- Membership plans ----------

const pickPlan = (b) => Object.fromEntries(['name', 'description', 'price', 'durationType', 'durationMonths', 'benefits', 'isActive'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

async function listPlans(req, res) {
  const plans = await MembershipPlan.findAll({ where: { clubId: req.club.id }, order: [['isActive', 'DESC'], ['price', 'ASC']] });
  const counts = Object.fromEntries(
    (
      await Membership.findAll({
        attributes: ['planId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
        where: { clubId: req.club.id, status: 'ACTIVE', endDate: { [Op.gt]: new Date() } },
        group: ['planId'],
        raw: true,
      })
    ).map((r) => [r.planId, Number(r.n)])
  );
  res.json({ plans: plans.map((p) => ({ ...p.toJSON(), activeMembers: counts[p.id] || 0 })) });
}

async function createPlan(req, res) {
  res.status(201).json({ plan: await MembershipPlan.create({ ...pickPlan(req.body), clubId: req.club.id }) });
}

async function updatePlan(req, res) {
  const plan = await MembershipPlan.findOne({ where: { id: req.params.planId, clubId: req.club.id } });
  if (!plan) throw new AppError('Plan not found', 404);
  plan.set(pickPlan(req.body));
  await plan.save();
  res.json({ plan });
}

async function deletePlan(req, res) {
  if (await Membership.count({ where: { planId: req.params.planId } })) throw new AppError('This plan has memberships. Hide it instead of deleting.', 409);
  const deleted = await MembershipPlan.destroy({ where: { id: req.params.planId, clubId: req.club.id } });
  if (!deleted) throw new AppError('Plan not found', 404);
  res.json({ message: 'Plan deleted' });
}

// GET /api/clubs/:clubId/manage/assignees — club staff who can be given tasks / event duties
async function assignees(req, res) {
  const rows = await ClubMember.findAll({
    where: { clubId: req.club.id, status: 'ACTIVE', ...(req.query.all ? {} : { role: { [Op.ne]: 'MEMBER' } }) },
    include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
    order: [['role', 'ASC']],
  });
  res.json({ users: rows.map((r) => ({ id: r.user.id, name: r.user.name, role: r.role })) });
}

module.exports = { dashboard, updateSettings, listMembers, decide, addMember, changeRole, removeMember, recordDues, memberDetail, listPlans, createPlan, updatePlan, deletePlan, assignees };
