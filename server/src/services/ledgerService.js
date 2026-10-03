const { Op, QueryTypes } = require('sequelize');
const { sequelize, LedgerEntry, Payment, User } = require('../models');
const { utc } = require('../models/helpers');

const CATEGORY_BY_PURPOSE = {
  MEMBERSHIP: 'MEMBERSHIP_DUES',
  TICKET: 'TICKET_SALES',
  MERCH: 'MERCHANDISE',
  FUNDRAISER: 'FUNDRAISER',
  OTHER: 'OTHER_INCOME',
};
const PURPOSE_LABEL = { MEMBERSHIP: 'Membership dues', TICKET: 'Event tickets', MERCH: 'Merchandise order', FUNDRAISER: 'Fundraiser', OTHER: 'Payment' };

// ---------- Automatic entries (idempotent via sourceKey) ----------

// Money received: called whenever a payment becomes PAID
async function recordPayment(payment, transaction) {
  const user = await User.findByPk(payment.userId, { attributes: ['name'], transaction });
  const [entry] = await LedgerEntry.findOrCreate({
    where: { sourceKey: `payment:${payment.id}` },
    defaults: {
      clubId: payment.clubId,
      type: 'INCOME',
      category: CATEGORY_BY_PURPOSE[payment.purpose] || 'OTHER_INCOME',
      amount: payment.amount,
      date: payment.paidAt || new Date(),
      description: `${PURPOSE_LABEL[payment.purpose] || 'Payment'} from ${user?.name || 'unknown'} (${payment.receiptNumber})`,
      source: 'PAYMENT',
      paymentId: payment.id,
      eventId: payment.purpose === 'TICKET' ? payment.referenceId : null,
      method: payment.method,
    },
    transaction,
  });
  return entry;
}

// Money given back (cancelled ticket, refunded order...)
async function recordRefund({ clubId, key, amount, description, paymentId, eventId, method, recordedById }, transaction) {
  if (!(amount > 0)) return null;
  const [entry] = await LedgerEntry.findOrCreate({
    where: { sourceKey: `refund:${key}` },
    defaults: { clubId, type: 'EXPENSE', category: 'REFUND', amount, date: new Date(), description, source: 'REFUND', paymentId, eventId, method, recordedById },
    transaction,
  });
  return entry;
}

// A volunteer paid back for an approved expense claim
async function recordClaimPayment(claim, claimantName, recordedById, transaction) {
  const [entry] = await LedgerEntry.findOrCreate({
    where: { sourceKey: `claim:${claim.id}` },
    defaults: {
      clubId: claim.clubId,
      type: 'EXPENSE',
      category: 'REIMBURSEMENT',
      amount: claim.amount,
      date: claim.paidAt || new Date(),
      description: `Reimbursed ${claimantName}: ${claim.title}`,
      source: 'CLAIM',
      claimId: claim.id,
      eventId: claim.eventId,
      fundraiserId: claim.fundraiserId,
      method: claim.paidMethod,
      receiptUrl: claim.receiptUrl,
      recordedById,
    },
    transaction,
  });
  return entry;
}

// Adds ledger rows for any paid payments that don't have one yet. Safe to run on every start.
async function backfill() {
  const missing = await Payment.findAll({
    where: {
      status: { [Op.in]: ['PAID', 'REFUNDED'] },
      id: { [Op.notIn]: sequelize.literal("(SELECT paymentId FROM ledger_entries WHERE source = 'PAYMENT' AND paymentId IS NOT NULL)") },
    },
  });
  for (const p of missing) await recordPayment(p);
  return missing.length;
}

// ---------- Reporting ----------

function dateRange(from, to) {
  const where = {};
  if (from) where[Op.gte] = new Date(from);
  if (to) {
    const end = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) end.setHours(23, 59, 59, 999); // a plain date includes the whole day
    where[Op.lte] = end;
  }
  return Object.getOwnPropertySymbols(where).length ? where : null;
}

function rangeReplacements(range) {
  return { from: utc((range && range[Op.gte]) || new Date(0)), to: utc((range && range[Op.lte]) || new Date('2999-12-31')) };
}

const idsOf = (clubIds) => {
  const ids = [].concat(clubIds).filter(Boolean);
  return ids.length ? ids : [0]; // [0] matches nothing: a college with no clubs yet
};

// Totals for a period plus the all-time balance ("how much is left").
// clubIds: one club, or every club of a college for the College Head's overview.
async function summary({ clubIds, from, to } = {}) {
  const ids = idsOf(clubIds);
  const range = dateRange(from, to);
  const where = { clubId: ids, ...(range ? { date: range } : {}) };

  const [byCategory, allTime, monthly] = await Promise.all([
    LedgerEntry.findAll({
      attributes: ['type', 'category', [sequelize.fn('SUM', sequelize.col('amount')), 'total'], [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where,
      group: ['type', 'category'],
      raw: true,
    }),
    LedgerEntry.findAll({
      attributes: ['type', [sequelize.fn('SUM', sequelize.col('amount')), 'total']],
      where: { clubId: ids },
      group: ['type'],
      raw: true,
    }),
    sequelize.query(
      `SELECT DATE_FORMAT(date, '%Y-%m') AS month,
              SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) AS income,
              SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) AS expense
       FROM ledger_entries
       WHERE clubId IN (:ids) AND date BETWEEN :from AND :to
       GROUP BY month ORDER BY month`,
      { replacements: { ids, ...rangeReplacements(range) }, type: QueryTypes.SELECT }
    ),
  ]);

  const income = byCategory.filter((r) => r.type === 'INCOME').map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.count) }));
  const expense = byCategory.filter((r) => r.type === 'EXPENSE').map((r) => ({ category: r.category, total: Number(r.total), count: Number(r.count) }));
  const sum = (rows) => Math.round(rows.reduce((a, r) => a + r.total, 0) * 100) / 100;
  const allIn = Number(allTime.find((r) => r.type === 'INCOME')?.total || 0);
  const allOut = Number(allTime.find((r) => r.type === 'EXPENSE')?.total || 0);

  return {
    period: { from: from || null, to: to || null },
    totalIncome: sum(income),
    totalExpense: sum(expense),
    net: Math.round((sum(income) - sum(expense)) * 100) / 100,
    balance: Math.round((allIn - allOut) * 100) / 100, // all time: money the club(s) have now
    income: income.sort((a, b) => b.total - a.total),
    expense: expense.sort((a, b) => b.total - a.total),
    monthly: monthly.map((m) => ({ month: m.month, income: Number(m.income), expense: Number(m.expense) })),
  };
}

// Income, costs and profit per event
async function eventProfitAndLoss({ clubIds, from, to } = {}) {
  const ids = idsOf(clubIds);
  const range = dateRange(from, to);
  const rows = await sequelize.query(
    `SELECT e.id, e.clubId, e.title, e.startsAt, e.status, e.capacity, e.visibility,
            COALESCE(SUM(CASE WHEN l.type = 'INCOME' THEN l.amount END), 0) AS income,
            COALESCE(SUM(CASE WHEN l.type = 'EXPENSE' THEN l.amount END), 0) AS expense,
            (SELECT COUNT(*) FROM tickets t WHERE t.eventId = e.id AND t.status = 'VALID') AS ticketsSold,
            (SELECT COUNT(*) FROM tickets t WHERE t.eventId = e.id AND t.status = 'VALID' AND t.checkedInAt IS NOT NULL) AS checkedIn
     FROM events e
     LEFT JOIN ledger_entries l ON l.eventId = e.id
     WHERE e.clubId IN (:ids) AND e.status <> 'DRAFT' ${range ? 'AND e.startsAt BETWEEN :from AND :to' : ''}
     GROUP BY e.id ORDER BY e.startsAt DESC`,
    { replacements: { ids, ...rangeReplacements(range) }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => ({
    ...r,
    income: Number(r.income),
    expense: Number(r.expense),
    profit: Math.round((Number(r.income) - Number(r.expense)) * 100) / 100,
    ticketsSold: Number(r.ticketsSold),
    checkedIn: Number(r.checkedIn),
  }));
}

module.exports = { CATEGORY_BY_PURPOSE, recordPayment, recordRefund, recordClaimPayment, backfill, summary, eventProfitAndLoss, dateRange };
