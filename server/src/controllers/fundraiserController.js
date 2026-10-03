const { Op } = require('sequelize');
const { Fundraiser, Task, LedgerEntry, Event, Club, ClubMember, User } = require('../models');
const service = require('../services/fundraiserService');
const access = require('../services/access');
const { notify } = require('../services/notificationService');
const AppError = require('../utils/AppError');
const { CLUB_CAN } = require('../config/roles');

// GET /api/clubs/:clubId/fundraisers (club staff)
async function list(req, res) {
  res.json({ fundraisers: await service.list(req.club.id) });
}

// GET /api/clubs/:clubId/fundraisers/:fundraiserId — tasks, money raised and on-track status
async function detail(req, res) {
  const data = await service.detail(req.params.fundraiserId, req.club.id);
  if (!data) throw new AppError('Fundraiser not found', 404);
  res.json(data);
}

// GET /api/me/tasks — my tasks in every club, and unassigned ones I could pick up in clubs I help run
async function myTasks(req, res) {
  const include = [
    { model: Fundraiser, as: 'fundraiser', attributes: ['id', 'title', 'eventDate', 'status'] },
    { model: Event, as: 'event', attributes: ['id', 'title', 'startsAt'] },
    { model: Club, as: 'club', attributes: ['id', 'name'] },
    { model: User, as: 'createdBy', attributes: ['id', 'name'] },
  ];
  const staffClubs = await access.myClubIds(req.user, 'staff');
  const [mine, open] = await Promise.all([
    Task.findAll({ where: { assigneeId: req.user.id }, include, order: [['status', 'ASC'], ['dueDate', 'ASC']] }),
    staffClubs.length
      ? Task.findAll({
          where: { clubId: staffClubs, assigneeId: null, status: { [Op.ne]: 'DONE' } },
          include: [{ ...include[0], required: false }, include[1], include[2], include[3]],
          order: [['dueDate', 'ASC']],
          limit: 50,
        })
      : [],
  ]);
  res.json({ tasks: mine, openTasks: open.filter((t) => !t.fundraiser || ['PLANNING', 'ACTIVE'].includes(t.fundraiser.status)) });
}

async function taskWithAccess(req) {
  const task = await Task.findByPk(req.params.taskId);
  if (!task) throw new AppError('Task not found', 404);
  const club = await Club.findByPk(task.clubId);
  return { task, club, a: await access.clubAccess(req.user, club) };
}

// PATCH /api/tasks/:taskId/status { status } — the assignee or the club manager
async function setStatus(req, res) {
  const { task, a } = await taskWithAccess(req);
  if (!a.can.manage && task.assigneeId !== req.user.id) throw new AppError('Only the person doing this task can update it', 403);
  if (!Task.STATUSES.includes(req.body.status)) throw new AppError('Invalid status');
  await task.update({ status: req.body.status, completedAt: req.body.status === 'DONE' ? new Date() : null });
  res.json({ task });
}

// POST /api/tasks/:taskId/claim — club staff pick up an unassigned task
async function claim(req, res) {
  const { task, a } = await taskWithAccess(req);
  if (!a.can.staff) throw new AppError("Only this club's volunteers can pick up its tasks", 403);
  const [updated] = await Task.update({ assigneeId: req.user.id }, { where: { id: task.id, assigneeId: null } });
  if (!updated) throw new AppError('Someone has already taken this task', 409);
  res.json({ task: await Task.findByPk(task.id) });
}

// ---------- Club manager (req.club) ----------

const pickF = (b) =>
  Object.fromEntries(
    ['title', 'description', 'eventDate', 'goalAmount', 'status', 'leadId'].filter((k) => b[k] !== undefined).map((k) => [k, b[k] === '' && ['eventDate', 'leadId', 'description'].includes(k) ? null : b[k]])
  );

async function assertClubStaff(clubId, userId) {
  if (!userId) return;
  const cm = await ClubMember.findOne({ where: { clubId, userId, status: 'ACTIVE' } });
  if (!cm || !CLUB_CAN.staff.includes(cm.role)) throw new AppError('Tasks can only be given to club volunteers, the treasurer or managers');
}

const clubFundraiser = async (req) => {
  const f = await Fundraiser.findOne({ where: { id: req.params.fundraiserId, clubId: req.club.id } });
  if (!f) throw new AppError('Fundraiser not found', 404);
  return f;
};

async function create(req, res) {
  const fields = pickF(req.body);
  await assertClubStaff(req.club.id, fields.leadId);
  res.status(201).json({ fundraiser: await Fundraiser.create({ ...fields, clubId: req.club.id, createdById: req.user.id }) });
}

async function update(req, res) {
  const f = await clubFundraiser(req);
  const fields = pickF(req.body);
  await assertClubStaff(req.club.id, fields.leadId);
  await f.update(fields);
  res.json({ fundraiser: f });
}

async function remove(req, res) {
  const f = await clubFundraiser(req);
  if (await LedgerEntry.count({ where: { fundraiserId: f.id } })) throw new AppError('This fundraiser has money recorded against it. Mark it cancelled instead.', 409);
  await f.destroy();
  res.json({ message: 'Fundraiser deleted' });
}

const pickT = (b) =>
  Object.fromEntries(
    ['title', 'description', 'assigneeId', 'dueDate', 'priority', 'status', 'eventId']
      .filter((k) => b[k] !== undefined)
      .map((k) => [k, b[k] === '' && ['assigneeId', 'dueDate', 'description', 'eventId'].includes(k) ? null : b[k]])
  );

function notifyAssigned(task, title) {
  if (task.assigneeId) {
    return notify(task.assigneeId, { title: 'New task for you', body: `${task.title}${title ? ` (${title})` : ''}${task.dueDate ? `, due ${task.dueDate}` : ''}`, link: '/tasks' });
  }
}

// POST /api/clubs/:clubId/manage/fundraisers/:fundraiserId/tasks
async function addTask(req, res) {
  const f = await clubFundraiser(req);
  const fields = pickT(req.body);
  await assertClubStaff(req.club.id, fields.assigneeId);
  const task = await Task.create({ ...fields, clubId: req.club.id, fundraiserId: f.id, createdById: req.user.id });
  await notifyAssigned(task, f.title);
  res.status(201).json({ task });
}

// GET /api/clubs/:clubId/manage/tasks?status=&eventId=&assigneeId= — Task Management
async function clubTasks(req, res) {
  const where = { clubId: req.club.id };
  if (req.query.status) where.status = req.query.status;
  if (req.query.eventId) where.eventId = req.query.eventId;
  if (req.query.assigneeId) where.assigneeId = req.query.assigneeId === 'none' ? null : req.query.assigneeId;
  const tasks = await Task.findAll({
    where,
    include: [
      { model: Fundraiser, as: 'fundraiser', attributes: ['id', 'title'] },
      { model: Event, as: 'event', attributes: ['id', 'title', 'startsAt'] },
      { model: User, as: 'assignee', attributes: ['id', 'name'] },
      { model: User, as: 'createdBy', attributes: ['id', 'name'] },
    ],
    order: [['status', 'ASC'], ['dueDate', 'ASC'], ['id', 'DESC']],
    limit: 500,
  });
  const counts = await Task.findAll({ attributes: ['status', [Task.sequelize.fn('COUNT', Task.sequelize.col('id')), 'n']], where: { clubId: req.club.id }, group: ['status'], raw: true });
  res.json({ tasks, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
}

// POST /api/clubs/:clubId/manage/tasks { title, description, eventId?, fundraiserId?, assigneeId?, dueDate, priority }
async function createTask(req, res) {
  const fields = pickT(req.body);
  let linkTitle = null;
  if (fields.eventId) {
    const event = await Event.findOne({ where: { id: fields.eventId, clubId: req.club.id } });
    if (!event) throw new AppError('Choose one of this club’s events');
    linkTitle = event.title;
  }
  let fundraiserId = null;
  if (req.body.fundraiserId) {
    const f = await Fundraiser.findOne({ where: { id: req.body.fundraiserId, clubId: req.club.id } });
    if (!f) throw new AppError('Choose one of this club’s fundraisers');
    fundraiserId = f.id;
    linkTitle = linkTitle || f.title;
  }
  await assertClubStaff(req.club.id, fields.assigneeId);
  const task = await Task.create({ ...fields, status: 'TODO', clubId: req.club.id, fundraiserId, createdById: req.user.id });
  await notifyAssigned(task, linkTitle);
  res.status(201).json({ task });
}

const clubTask = async (req) => {
  const task = await Task.findOne({ where: { id: req.params.taskId, clubId: req.club.id }, include: [{ model: Fundraiser, as: 'fundraiser', attributes: ['title'] }, { model: Event, as: 'event', attributes: ['title'] }] });
  if (!task) throw new AppError('Task not found', 404);
  return task;
};

// PATCH /api/clubs/:clubId/manage/tasks/:taskId
async function updateTask(req, res) {
  const task = await clubTask(req);
  const changes = pickT(req.body);
  await assertClubStaff(req.club.id, changes.assigneeId);
  const reassigned = changes.assigneeId !== undefined && changes.assigneeId !== task.assigneeId;
  if (changes.status) changes.completedAt = changes.status === 'DONE' ? new Date() : null;
  await task.update(changes);
  if (reassigned) await notifyAssigned(task, task.event?.title || task.fundraiser?.title);
  res.json({ task });
}

async function removeTask(req, res) {
  await (await clubTask(req)).destroy();
  res.json({ message: 'Task deleted' });
}

// POST /api/clubs/:clubId/manage/fundraisers/:fundraiserId/income { amount, description, date, method }
async function addIncome(req, res) {
  const f = await clubFundraiser(req);
  const entry = await LedgerEntry.create({
    clubId: req.club.id,
    type: 'INCOME',
    category: 'FUNDRAISER',
    amount: req.body.amount,
    date: req.body.date ? new Date(req.body.date) : new Date(),
    description: req.body.description || `${f.title} takings`,
    source: 'MANUAL',
    fundraiserId: f.id,
    method: req.body.method || 'CASH',
    recordedById: req.user.id,
  });
  res.status(201).json({ entry });
}

module.exports = { list, detail, myTasks, setStatus, claim, create, update, remove, addTask, clubTasks, createTask, updateTask, removeTask, addIncome };
