const { Op } = require('sequelize');
const { sequelize, Fundraiser, Task, LedgerEntry, User } = require('../models');

const today = () => new Date().toISOString().slice(0, 10);

// "Is the fundraiser on track?" in one place:
// BEHIND   — a task is past its due date
// AT_RISK  — the day is close and too little is done (≤7 days & <50%, or ≤3 days & <75%)
// ON_TRACK — otherwise
function health(f, stats) {
  if (f.status === 'COMPLETED') return 'COMPLETED';
  if (f.status === 'CANCELLED') return 'CANCELLED';
  if (stats.overdue > 0) return 'BEHIND';
  if (f.eventDate && stats.total > 0) {
    const daysLeft = Math.ceil((new Date(`${f.eventDate}T23:59:59`) - Date.now()) / 86400000);
    if ((daysLeft <= 3 && stats.percentDone < 75) || (daysLeft <= 7 && stats.percentDone < 50)) return 'AT_RISK';
  }
  return 'ON_TRACK';
}

function taskStats(tasks) {
  const t = today();
  const total = tasks.length;
  const done = tasks.filter((x) => x.status === 'DONE').length;
  const inProgress = tasks.filter((x) => x.status === 'IN_PROGRESS').length;
  const overdue = tasks.filter((x) => x.status !== 'DONE' && x.dueDate && x.dueDate < t).length;
  const unassigned = tasks.filter((x) => x.status !== 'DONE' && !x.assigneeId).length;
  return { total, done, inProgress, todo: total - done - inProgress, overdue, unassigned, percentDone: total ? Math.round((done / total) * 100) : 0 };
}

// Money raised and spent per fundraiser, from the ledger
async function moneyFor(ids) {
  if (!ids.length) return {};
  const rows = await LedgerEntry.findAll({
    attributes: ['fundraiserId', 'type', [sequelize.fn('SUM', sequelize.col('amount')), 'total']],
    where: { fundraiserId: { [Op.in]: ids } },
    group: ['fundraiserId', 'type'],
    raw: true,
  });
  const out = {};
  for (const r of rows) {
    out[r.fundraiserId] ||= { raised: 0, spent: 0 };
    out[r.fundraiserId][r.type === 'INCOME' ? 'raised' : 'spent'] = Number(r.total);
  }
  return out;
}

function withProgress(f, tasks, money = { raised: 0, spent: 0 }) {
  const stats = taskStats(tasks);
  return {
    ...f.toJSON(),
    tasks: stats,
    raised: money.raised,
    spent: money.spent,
    net: Math.round((money.raised - money.spent) * 100) / 100,
    percentRaised: f.goalAmount > 0 ? Math.min(100, Math.round((money.raised / f.goalAmount) * 100)) : null,
    health: health(f, stats),
  };
}

// Fundraisers of one club (or several, for a College Head's report)
async function list(clubIds) {
  const fundraisers = await Fundraiser.findAll({
    where: { clubId: [].concat(clubIds) },
    order: [[sequelize.literal("FIELD(status, 'ACTIVE', 'PLANNING', 'COMPLETED', 'CANCELLED')"), 'ASC'], ['eventDate', 'ASC']],
    include: [{ model: User, as: 'lead', attributes: ['id', 'name'] }],
  });
  const ids = fundraisers.map((f) => f.id);
  const [tasks, money] = await Promise.all([
    Task.findAll({ where: { fundraiserId: { [Op.in]: ids } }, attributes: ['id', 'fundraiserId', 'status', 'dueDate', 'assigneeId'] }),
    moneyFor(ids),
  ]);
  return fundraisers.map((f) => withProgress(f, tasks.filter((t) => t.fundraiserId === f.id), money[f.id]));
}

async function detail(id, clubId) {
  const f = await Fundraiser.findOne({ where: { id, clubId }, include: [{ model: User, as: 'lead', attributes: ['id', 'name'] }] });
  if (!f) return null;
  const [tasks, money, entries] = await Promise.all([
    Task.findAll({
      where: { fundraiserId: f.id },
      include: [{ model: User, as: 'assignee', attributes: ['id', 'name'] }],
      order: [[sequelize.literal("FIELD(priority, 'HIGH', 'MEDIUM', 'LOW')"), 'ASC'], ['dueDate', 'ASC'], ['id', 'ASC']],
    }),
    moneyFor([f.id]),
    LedgerEntry.findAll({ where: { fundraiserId: f.id }, order: [['date', 'DESC']], include: [{ model: User, as: 'recordedBy', attributes: ['id', 'name'] }] }),
  ]);
  return { fundraiser: withProgress(f, tasks, money[f.id]), taskList: tasks, entries };
}

module.exports = { health, taskStats, list, detail };
