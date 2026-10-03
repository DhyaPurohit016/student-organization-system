// A club's money: ledger, manual entries, expense claims. Routes are guarded by clubGuard('money')
// (manager, treasurer, College Head) except submitting claims, which any club staff can do.
const { Op } = require('sequelize');
const { sequelize, LedgerEntry, ExpenseClaim, User, Event, Fundraiser, ClubMember, Club } = require('../models');
const ledgerService = require('../services/ledgerService');
const { notify } = require('../services/notificationService');
const AppError = require('../utils/AppError');
const { CLUB_CAN } = require('../config/roles');

const CLAIM_INCLUDE = [
  { model: User, as: 'claimant', attributes: ['id', 'name', 'email'] },
  { model: User, as: 'reviewedBy', attributes: ['id', 'name'] },
  { model: Event, as: 'event', attributes: ['id', 'title'] },
  { model: Fundraiser, as: 'fundraiser', attributes: ['id', 'title'] },
];
const LEDGER_INCLUDE = [
  { model: User, as: 'recordedBy', attributes: ['id', 'name'] },
  { model: Event, as: 'event', attributes: ['id', 'title'] },
  { model: Fundraiser, as: 'fundraiser', attributes: ['id', 'title'] },
];
const AUTOMATIC = ['MEMBERSHIP_DUES', 'TICKET_SALES', 'MERCHANDISE', 'REIMBURSEMENT', 'REFUND'];

// Event / fundraiser links must belong to the same club
async function checkLinks(clubId, { eventId, fundraiserId }) {
  if (eventId && !(await Event.count({ where: { id: eventId, clubId } }))) throw new AppError("That event isn't one of this club's events");
  if (fundraiserId && !(await Fundraiser.count({ where: { id: fundraiserId, clubId } }))) throw new AppError("That fundraiser isn't one of this club's fundraisers");
}

// GET /api/clubs/:clubId/manage/finance/summary?from=&to=
async function summary(req, res) {
  const q = { ...req.query, clubIds: [req.club.id] };
  const [totals, events, pendingClaims] = await Promise.all([
    ledgerService.summary(q),
    ledgerService.eventProfitAndLoss(q),
    ExpenseClaim.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('SUM', sequelize.col('amount')), 'total']],
      where: { clubId: req.club.id, status: { [Op.in]: ['SUBMITTED', 'APPROVED'] } },
      group: ['status'],
      raw: true,
    }),
  ]);
  const claims = Object.fromEntries(pendingClaims.map((c) => [c.status, { count: Number(c.n), total: Number(c.total) }]));
  res.json({ ...totals, events, claims: { toReview: claims.SUBMITTED || { count: 0, total: 0 }, toPay: claims.APPROVED || { count: 0, total: 0 } } });
}

function ledgerWhere(clubId, q) {
  const where = { clubId };
  const range = ledgerService.dateRange(q.from, q.to);
  if (range) where.date = range;
  if (q.type) where.type = q.type;
  if (q.category) where.category = q.category;
  if (q.eventId) where.eventId = q.eventId;
  if (q.fundraiserId) where.fundraiserId = q.fundraiserId;
  if (q.search) where.description = { [Op.like]: `%${String(q.search).trim()}%` };
  return where;
}

// GET /api/clubs/:clubId/manage/finance/transactions
async function transactions(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const { rows, count } = await LedgerEntry.findAndCountAll({
    where: ledgerWhere(req.club.id, req.query),
    include: LEDGER_INCLUDE,
    order: [['date', 'DESC'], ['id', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  res.json({ entries: rows, total: count, page, pages: Math.ceil(count / limit) || 1 });
}

// GET /api/clubs/:clubId/manage/finance/transactions.csv
async function transactionsCsv(req, res) {
  const entries = await LedgerEntry.findAll({ where: ledgerWhere(req.club.id, req.query), include: LEDGER_INCLUDE, order: [['date', 'ASC'], ['id', 'ASC']] });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Date', 'Type', 'Category', 'Description', 'Amount', 'Method', 'Event', 'Fundraiser', 'Source', 'Recorded by'].join(',')];
  for (const e of entries) {
    lines.push(
      [e.date.toISOString().slice(0, 10), e.type, e.category, e.description, (e.type === 'EXPENSE' ? -e.amount : e.amount).toFixed(2), e.method, e.event?.title, e.fundraiser?.title, e.source, e.recordedBy?.name]
        .map(esc)
        .join(',')
    );
  }
  const slug = req.club.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-ledger-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${lines.join('\r\n')}`);
}

// POST /api/clubs/:clubId/manage/finance/transactions — money in/out not captured automatically
async function addEntry(req, res) {
  const { type, category, amount, date, description, method, eventId, fundraiserId, receiptUrl } = req.body;
  if (!['INCOME', 'EXPENSE'].includes(type)) throw new AppError('Choose income or expense');
  if (AUTOMATIC.includes(category)) throw new AppError('That category is recorded automatically. Use a different category for manual entries.');
  if (!description) throw new AppError('Description is required');
  await checkLinks(req.club.id, { eventId, fundraiserId });
  const entry = await LedgerEntry.create({
    clubId: req.club.id,
    type,
    category,
    amount,
    date: date ? new Date(date) : new Date(),
    description,
    method: method || null,
    eventId: eventId || null,
    fundraiserId: fundraiserId || null,
    receiptUrl: receiptUrl || null,
    source: 'MANUAL',
    recordedById: req.user.id,
  });
  res.status(201).json({ entry });
}

// DELETE /api/clubs/:clubId/manage/finance/transactions/:entryId — manual entries only
async function removeEntry(req, res) {
  const entry = await LedgerEntry.findOne({ where: { id: req.params.entryId, clubId: req.club.id } });
  if (!entry) throw new AppError('Entry not found', 404);
  if (entry.source !== 'MANUAL') throw new AppError('Automatic entries cannot be deleted. Refund the payment instead.', 409);
  await entry.destroy();
  res.json({ message: 'Entry deleted' });
}

// ---------- Expense claims ----------

// POST /api/clubs/:clubId/claims (club staff)
async function submitClaim(req, res) {
  const { title, description, amount, category, spentOn, eventId, fundraiserId, receiptUrl } = req.body;
  if (!receiptUrl) throw new AppError('Please attach a photo of the receipt');
  await checkLinks(req.club.id, { eventId, fundraiserId });
  const claim = await ExpenseClaim.create({
    clubId: req.club.id,
    claimantId: req.user.id,
    title,
    description,
    amount,
    category: category || 'SUPPLIES',
    spentOn: spentOn || new Date().toISOString().slice(0, 10),
    eventId: eventId || null,
    fundraiserId: fundraiserId || null,
    receiptUrl,
  });
  const reviewers = await ClubMember.findAll({ where: { clubId: req.club.id, status: 'ACTIVE', role: CLUB_CAN.money }, attributes: ['userId'] });
  await notify(
    reviewers.map((r) => r.userId).filter((id) => id !== req.user.id),
    { title: `New expense to review · ${req.club.name}`, body: `${req.user.name}: ${title} (₹${claim.amount})`, link: `/c/${req.club.id}/expenses` }
  );
  res.status(201).json({ claim });
}

// GET /api/me/claims — my claims in every club
async function myClaims(req, res) {
  const claims = await ExpenseClaim.findAll({
    where: { claimantId: req.user.id },
    include: [...CLAIM_INCLUDE, { model: Club, as: 'club', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json({ claims });
}

// GET /api/clubs/:clubId/manage/claims?status=
async function adminClaims(req, res) {
  const where = { clubId: req.club.id, ...(req.query.status ? { status: req.query.status } : {}) };
  const claims = await ExpenseClaim.findAll({
    where,
    include: CLAIM_INCLUDE,
    order: [[sequelize.literal("FIELD(ExpenseClaim.status, 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED')"), 'ASC'], ['createdAt', 'DESC']],
  });
  const counts = await ExpenseClaim.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { clubId: req.club.id }, group: ['status'], raw: true });
  res.json({ claims, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
}

const clubClaim = async (req, t) => {
  const c = await ExpenseClaim.findOne({ where: { id: req.params.claimId, clubId: req.club.id }, transaction: t, ...(t ? { lock: t.LOCK.UPDATE } : {}) });
  if (!c) throw new AppError('Claim not found', 404);
  return c;
};

// POST /api/clubs/:clubId/manage/claims/:claimId/review { decision: APPROVED|REJECTED, note }
async function reviewClaim(req, res) {
  const { decision, note } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new AppError('Decision must be APPROVED or REJECTED');
  if (decision === 'REJECTED' && !note) throw new AppError('Please give a reason when rejecting a claim');
  const claim = await clubClaim(req);
  if (claim.status !== 'SUBMITTED') throw new AppError(`This claim is already ${claim.status.toLowerCase()}`, 409);
  if (claim.claimantId === req.user.id) throw new AppError('Someone else must review your own claim', 403);

  await claim.update({ status: decision, reviewedById: req.user.id, reviewedAt: new Date(), reviewNote: note || null });
  await notify(claim.claimantId, {
    title: `${req.club.name}: expense ${decision === 'APPROVED' ? 'approved' : 'rejected'}`,
    body: `${claim.title} (₹${claim.amount})${note ? `: ${note}` : ''}`,
    link: '/expenses',
  });
  res.json({ claim });
}

// POST /api/clubs/:clubId/manage/claims/:claimId/pay { method }
async function payClaim(req, res) {
  const claim = await sequelize.transaction(async (t) => {
    const c = await clubClaim(req, t);
    if (c.status !== 'APPROVED') throw new AppError('Only approved claims can be paid', 409);
    await c.update({ status: 'PAID', paidAt: new Date(), paidMethod: req.body.method || 'UPI' }, { transaction: t });
    const claimant = await User.findByPk(c.claimantId, { transaction: t });
    await ledgerService.recordClaimPayment(c, claimant.name, req.user.id, t);
    await notify(c.claimantId, { title: `${req.club.name}: you've been reimbursed`, body: `₹${c.amount} for ${c.title}`, link: '/expenses' }, t);
    return c;
  });
  res.json({ claim });
}

// GET /api/clubs/:clubId/finance/options — this club's events and fundraisers to link a claim or entry to
async function linkOptions(req, res) {
  const [events, fundraisers] = await Promise.all([
    Event.findAll({ where: { clubId: req.club.id, status: { [Op.ne]: 'DRAFT' } }, attributes: ['id', 'title', 'startsAt'], order: [['startsAt', 'DESC']], limit: 50 }),
    Fundraiser.findAll({ where: { clubId: req.club.id }, attributes: ['id', 'title', 'status'], order: [['createdAt', 'DESC']], limit: 50 }),
  ]);
  res.json({ events, fundraisers, incomeCategories: LedgerEntry.INCOME_CATEGORIES, expenseCategories: LedgerEntry.EXPENSE_CATEGORIES });
}

module.exports = { summary, transactions, transactionsCsv, addEntry, removeEntry, submitClaim, myClaims, adminClaims, reviewClaim, payClaim, linkOptions };
