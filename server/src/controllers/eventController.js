const { Op, QueryTypes } = require('sequelize');
const { sequelize, Event, Ticket, User, Club, College, ClubMember, EventVolunteer, CollegeAdmin } = require('../models');
const ticketService = require('../services/ticketService');
const access = require('../services/access');
const { notify } = require('../services/notificationService');
const AppError = require('../utils/AppError');
const { utc } = require('../models/helpers');
const { CLUB_CAN } = require('../config/roles');
const { VISIBILITY } = require('../models/Event');

const EDITABLE = ['title', 'description', 'venue', 'startsAt', 'endsAt', 'capacity', 'guestPrice', 'collegePrice', 'memberPrice', 'maxPerOrder', 'imageUrl', 'visibility', 'registrationDeadline', 'volunteersNeeded'];
const NULLABLE = ['endsAt', 'memberPrice', 'collegePrice', 'imageUrl', 'description', 'registrationDeadline'];
function pick(body) {
  const out = {};
  for (const k of EDITABLE) {
    if (body[k] === undefined) continue;
    out[k] = body[k] === '' && NULLABLE.includes(k) ? null : body[k];
  }
  if (out.visibility && !VISIBILITY.includes(out.visibility)) throw new AppError('Visibility must be PUBLIC, COLLEGE or CLUB');
  return out;
}

// Seats sold + currently held, for many events at once
async function takenCounts(ids) {
  if (!ids.length) return {};
  const rows = await sequelize.query(
    `SELECT eventId, COUNT(*) AS n FROM tickets
     WHERE eventId IN (:ids) AND (status = 'VALID' OR (status = 'PENDING' AND createdAt > :cutoff))
     GROUP BY eventId`,
    { replacements: { ids, cutoff: utc(ticketService.holdCutoff()) }, type: QueryTypes.SELECT }
  );
  return Object.fromEntries(rows.map((r) => [r.eventId, Number(r.n)]));
}

const CLUB_INCLUDE = { model: Club, as: 'club', attributes: ['id', 'name', 'code', 'collegeId', 'status', 'requiresDues'], include: [{ model: College, as: 'college', attributes: ['id', 'name', 'code'] }] };

function publicShape(event, taken) {
  return { ...event.toJSON(), seatsLeft: Math.max(0, event.capacity - (taken || 0)), salesOpen: ticketService.salesOpen(event) };
}

// Which private events this viewer may see: their verified college's COLLEGE events, their clubs'
// CLUB events, and everything in clubs they run / colleges they head
async function privateScope(user) {
  if (!user) return [];
  const [roles, heads] = await Promise.all([
    ClubMember.findAll({ where: { userId: user.id, status: 'ACTIVE' }, attributes: ['clubId', 'role'] }),
    CollegeAdmin.findAll({ where: { userId: user.id }, attributes: ['collegeId'] }),
  ]);
  const or = [];
  // Verified students (and those waiting for approval, who'll be told why they can't register yet)
  if (['VERIFIED', 'PENDING'].includes(user.collegeStatus) && user.collegeId) or.push({ visibility: 'COLLEGE', collegeId: user.collegeId });
  const clubs = roles.map((r) => r.clubId);
  if (clubs.length) or.push({ visibility: { [Op.ne]: 'PUBLIC' }, clubId: clubs }); // members see CLUB + their club's COLLEGE events
  if (heads.length) or.push({ collegeId: heads.map((h) => h.collegeId) });
  return or;
}

// ---------- Public ----------

// GET /api/events?when=upcoming|past&collegeId=&clubId= — public events, plus private ones this viewer may attend
async function listPublic(req, res) {
  const now = new Date();
  const past = req.query.when === 'past';
  const where = {
    status: { [Op.in]: ['PUBLISHED', 'CANCELLED'] },
    startsAt: past ? { [Op.lt]: now } : { [Op.gte]: new Date(now.getTime() - 6 * 3600000) },
    [Op.or]: [{ visibility: 'PUBLIC' }, ...(await privateScope(req.user))],
    collegeId: { [Op.notIn]: [0, ...(await access.inactiveCollegeIds())] },
  };
  // Narrowing to one college keeps the deactivated-college filter
  if (req.query.collegeId) where.collegeId = { ...where.collegeId, [Op.eq]: req.query.collegeId };
  if (req.query.clubId) where.clubId = req.query.clubId;
  const events = await Event.findAll({
    where,
    include: [{ ...CLUB_INCLUDE, where: { status: 'ACTIVE' } }],
    order: [['startsAt', past ? 'DESC' : 'ASC']],
    limit: Math.min(100, parseInt(req.query.limit, 10) || 60),
  });
  const taken = await takenCounts(events.map((e) => e.id));
  res.json({ events: events.map((e) => publicShape(e, taken[e.id])) });
}

// GET /api/events/:id — private events look "not found" to people who can't attend
async function getPublic(req, res) {
  const event = await Event.findOne({ where: { id: req.params.id, status: { [Op.in]: ['PUBLISHED', 'CANCELLED'] } }, include: [CLUB_INCLUDE] });
  if (!event || !(await access.isClubOpen(event.club)) || !(await access.canSeeEvent(req.user, event, event.club))) throw new AppError('Event not found', 404);
  const taken = await takenCounts([event.id]);
  res.json({ event: publicShape(event, taken[event.id]) });
}

// GET /api/events/:id/quote — can I register, and at which price?
async function getQuote(req, res) {
  const event = await Event.findOne({ where: { id: req.params.id, status: 'PUBLISHED' }, include: [CLUB_INCLUDE] });
  if (!event || !(await access.isClubOpen(event.club)) || !(await access.canSeeEvent(req.user, event, event.club))) throw new AppError('Event not found', 404);
  res.json({ quote: await ticketService.quote(event, req.user, undefined, event.club) });
}

// POST /api/events/:id/checkout { quantity, holderNames }
async function checkout(req, res) {
  const event = await Event.findByPk(req.params.id, { include: [CLUB_INCLUDE] });
  if (!event || !(await access.isClubOpen(event.club))) throw new AppError('Event not found', 404);
  res.status(201).json(await ticketService.checkout(req.params.id, req.user, req.body));
}

// GET /api/me/tickets
async function myTickets(req, res) {
  const tickets = await Ticket.findAll({
    where: { userId: req.user.id, status: { [Op.in]: ['VALID', 'REFUNDED'] } },
    include: [{ model: Event, as: 'event', attributes: ['id', 'title', 'venue', 'startsAt', 'endsAt', 'status', 'visibility', 'clubId'], include: [{ model: Club, as: 'club', attributes: ['id', 'name'] }] }],
    order: [[{ model: Event, as: 'event' }, 'startsAt', 'DESC'], ['id', 'ASC']],
  });
  const now = Date.now();
  res.json({
    tickets: await Promise.all(
      tickets.map(async (t) => {
        const end = t.event.endsAt || new Date(new Date(t.event.startsAt).getTime() + 6 * 3600000);
        const usable = t.status === 'VALID' && !t.checkedInAt && t.event.status !== 'CANCELLED' && new Date(end).getTime() > now;
        const json = t.toJSON();
        delete json.qrToken;
        return { ...json, upcoming: usable, qr: usable ? await ticketService.qrFor(t) : null };
      })
    ),
  });
}

// ---------- Door check-in ----------

// GET /api/checkin/events — events (past day → next week) this person may check people in for
async function checkinEvents(req, res) {
  const now = new Date();
  const events = await Event.findAll({
    where: { status: 'PUBLISHED', collegeId: { [Op.notIn]: [0, ...(await access.inactiveCollegeIds())] }, startsAt: { [Op.between]: [new Date(now.getTime() - 24 * 3600000), new Date(now.getTime() + 30 * 86400000)] } },
    include: [CLUB_INCLUDE],
    order: [['startsAt', 'ASC']],
  });
  const allowed = [];
  for (const e of events) if (await access.canCheckIn(req.user, e, e.club)) allowed.push({ id: e.id, title: e.title, startsAt: e.startsAt, venue: e.venue, capacity: e.capacity, club: { id: e.club.id, name: e.club.name } });
  res.json({ events: allowed });
}

async function loadCheckinEvent(req) {
  const event = await Event.findByPk(req.params.id || req.body.eventId, { include: [CLUB_INCLUDE] });
  if (!event) throw new AppError('Choose the event you are checking people in for', 400);
  if (!(await access.isClubOpen(event.club))) throw new AppError("This event's college has been deactivated", 410);
  if (!(await access.canCheckIn(req.user, event, event.club))) throw new AppError("You aren't on the check-in team for this event", 403);
  return event;
}

// POST /api/checkin { eventId, code }
async function checkIn(req, res) {
  const event = await loadCheckinEvent(req);
  res.json(await ticketService.checkIn(req.body.code, { eventId: event.id, staffId: req.user.id }));
}

// GET /api/checkin/events/:id/stats
async function checkinStats(req, res) {
  const event = await loadCheckinEvent(req);
  const [row] = await sequelize.query(`SELECT SUM(status = 'VALID') AS sold, SUM(status = 'VALID' AND checkedInAt IS NOT NULL) AS checkedIn FROM tickets WHERE eventId = :id`, {
    replacements: { id: event.id },
    type: QueryTypes.SELECT,
  });
  res.json({ sold: Number(row.sold || 0), checkedIn: Number(row.checkedIn || 0) });
}

// GET /api/me/volunteering — "My Events": events I'm approved to help at
async function myVolunteering(req, res) {
  const rows = await EventVolunteer.findAll({
    where: { userId: req.user.id, status: 'APPROVED' },
    include: [{ model: Event, as: 'event', where: { status: { [Op.ne]: 'DRAFT' } }, include: [{ model: Club, as: 'club', attributes: ['id', 'name'] }] }],
    order: [[{ model: Event, as: 'event' }, 'startsAt', 'DESC']],
  });
  res.json({ assignments: rows });
}

// ---------- Helping Out: volunteers offer to help at events ----------

// GET /api/helping-out — upcoming events in clubs where I volunteer, with how many helpers are
// needed and whether I've already offered
async function helpingOut(req, res) {
  const clubIds = await access.myClubIds(req.user, 'staff');
  if (!clubIds.length) return res.json({ events: [] });
  const events = await Event.findAll({
    where: { clubId: clubIds, status: 'PUBLISHED', collegeId: { [Op.notIn]: [0, ...(await access.inactiveCollegeIds())] }, startsAt: { [Op.gte]: new Date() } },
    include: [{ model: Club, as: 'club', attributes: ['id', 'name'] }],
    order: [['startsAt', 'ASC']],
    limit: 100,
  });
  const ids = events.map((e) => e.id);
  const rows = ids.length ? await EventVolunteer.findAll({ where: { eventId: ids }, attributes: ['eventId', 'userId', 'status', 'duty'] }) : [];
  res.json({
    events: events.map((e) => {
      const helpers = rows.filter((r) => r.eventId === e.id);
      const mine = helpers.find((r) => r.userId === req.user.id);
      return {
        ...e.toJSON(),
        volunteersApproved: helpers.filter((r) => r.status === 'APPROVED').length,
        myStatus: mine?.status || null,
        myDuty: mine?.duty || null,
      };
    }),
  });
}

// POST /api/events/:id/volunteer { duty, message } — offer to help; the club manager approves
async function offerToHelp(req, res) {
  const event = await Event.findByPk(req.params.id, { include: [CLUB_INCLUDE] });
  if (!event || event.status !== 'PUBLISHED' || !(await access.isClubOpen(event.club))) throw new AppError('Event not found', 404);
  if (!(await access.clubAccess(req.user, event.club)).can.staff) throw new AppError("Only this club's volunteers can offer to help at its events", 403);
  if (new Date(event.startsAt) < new Date()) throw new AppError('This event has already started');
  const existing = await EventVolunteer.findOne({ where: { eventId: event.id, userId: req.user.id } });
  if (existing) throw new AppError(existing.status === 'APPROVED' ? "You're already helping at this event" : 'You have already offered to help. Waiting for the manager.', 409);
  const row = await EventVolunteer.create({
    eventId: event.id,
    userId: req.user.id,
    duty: String(req.body.duty || 'General').trim().slice(0, 60) || 'General',
    message: req.body.message ? String(req.body.message).slice(0, 300) : null,
    status: 'PENDING',
  });
  const managers = await ClubMember.findAll({ where: { clubId: event.clubId, status: 'ACTIVE', role: 'MANAGER' }, attributes: ['userId'] });
  await notify(managers.map((m) => m.userId), { title: `Volunteer offer: ${event.title}`, body: `${req.user.name} wants to help (${row.duty})`, link: `/c/${event.clubId}/events/${event.id}` });
  res.status(201).json({ volunteer: row });
}

// DELETE /api/events/:id/volunteer — withdraw an offer that hasn't been approved yet
async function withdrawOffer(req, res) {
  const deleted = await EventVolunteer.destroy({ where: { eventId: req.params.id, userId: req.user.id, status: 'PENDING' } });
  if (!deleted) throw new AppError('No pending offer to withdraw. Ask the club manager if you can no longer help.', 404);
  res.json({ message: 'Offer withdrawn' });
}

// Participant list for one event: who registered, as what, and whether they've arrived
async function participantRows(eventId) {
  const tickets = await Ticket.findAll({
    where: { eventId, status: 'VALID' },
    include: [{ model: User, as: 'buyer', attributes: ['id', 'name', 'email', 'phone'], include: [{ model: College, as: 'college', attributes: ['code'] }] }],
    order: [['id', 'ASC']],
  });
  return tickets.map((t) => ({
    id: t.id,
    code: t.ticketCode,
    name: t.holderName || t.buyer?.name,
    boughtBy: t.buyer && { name: t.buyer.name, email: t.buyer.email, phone: t.buyer.phone, college: t.buyer.college?.code || null },
    registrationType: t.registrationType,
    checkedInAt: t.checkedInAt,
  }));
}

// GET /api/me/volunteering/:id/participants — for volunteers approved on this event
async function volunteerParticipants(req, res) {
  const event = await Event.findByPk(req.params.id, { include: [CLUB_INCLUDE] });
  if (!event) throw new AppError('Event not found', 404);
  const helping = await EventVolunteer.count({ where: { eventId: event.id, userId: req.user.id, status: 'APPROVED' } });
  if (!helping && !(await access.clubAccess(req.user, event.club)).can.oversee) throw new AppError("You can only see participants of events you're helping at", 403);
  const rows = await participantRows(event.id);
  // Volunteers see names and arrival, not buyers' contact details
  res.json({
    event: { id: event.id, title: event.title, startsAt: event.startsAt, capacity: event.capacity, club: { id: event.club.id, name: event.club.name } },
    participants: rows.map(({ boughtBy, ...r }) => ({ ...r, college: boughtBy?.college || null })),
  });
}

// ---------- Club manager (scoped by clubGuard: req.club) ----------

const clubEvent = async (req) => {
  const event = await Event.findOne({ where: { id: req.params.eventId, clubId: req.club.id } });
  if (!event) throw new AppError('Event not found', 404);
  return event;
};

// GET /api/clubs/:clubId/manage/events
async function adminList(req, res) {
  const events = await Event.findAll({ where: { clubId: req.club.id }, order: [['startsAt', 'DESC']] });
  const ids = events.map((e) => e.id);
  const counts = ids.length
    ? await sequelize.query(
        `SELECT eventId, SUM(status = 'VALID') AS sold, SUM(status = 'VALID' AND checkedInAt IS NOT NULL) AS checkedIn,
                COALESCE(SUM(CASE WHEN status = 'VALID' THEN price END), 0) AS revenue
         FROM tickets WHERE eventId IN (:ids) GROUP BY eventId`,
        { replacements: { ids }, type: QueryTypes.SELECT }
      )
    : [];
  const byId = Object.fromEntries(counts.map((c) => [c.eventId, c]));
  res.json({ events: events.map((e) => ({ ...e.toJSON(), sold: Number(byId[e.id]?.sold || 0), checkedIn: Number(byId[e.id]?.checkedIn || 0), revenue: Number(byId[e.id]?.revenue || 0) })) });
}

// POST /api/clubs/:clubId/manage/events
async function create(req, res) {
  const event = await Event.create({ ...pick(req.body), clubId: req.club.id, collegeId: req.club.collegeId, status: req.body.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT', createdById: req.user.id });
  res.status(201).json({ event });
}

// PATCH /api/clubs/:clubId/manage/events/:eventId
async function update(req, res) {
  const event = await clubEvent(req);
  if (event.status === 'CANCELLED') throw new AppError('Cancelled events cannot be edited', 409);
  const changes = pick(req.body);
  const sold = await Ticket.count({ where: { eventId: event.id, status: 'VALID' } });
  if (changes.capacity !== undefined && Number(changes.capacity) < sold) throw new AppError(`Capacity can't be lower than the ${sold} tickets already sold`);
  // Making an event more private after people registered would strand them
  if (changes.visibility && changes.visibility !== event.visibility && sold && changes.visibility !== 'PUBLIC') {
    throw new AppError('People have already registered: you can open this event up to more people, but not restrict it');
  }
  if (req.body.status && ['DRAFT', 'PUBLISHED'].includes(req.body.status)) {
    if (req.body.status === 'DRAFT' && (await Ticket.count({ where: { eventId: event.id, status: { [Op.in]: ['VALID', 'PENDING'] } } }))) {
      throw new AppError('This event already has registrations; cancel it instead of unpublishing');
    }
    changes.status = req.body.status;
  }
  await event.update(changes);
  res.json({ event });
}

// DELETE /api/clubs/:clubId/manage/events/:eventId — drafts without tickets only
async function remove(req, res) {
  const event = await clubEvent(req);
  if (event.status !== 'DRAFT' || (await Ticket.count({ where: { eventId: event.id } }))) throw new AppError('Only draft events without tickets can be deleted. Cancel it instead.', 409);
  await event.destroy();
  res.json({ message: 'Event deleted' });
}

async function report(req, res) {
  await clubEvent(req);
  res.json(await ticketService.report(req.params.eventId));
}

// GET /api/clubs/:clubId/manage/events/:eventId/tickets?search=&status=&type=
async function tickets(req, res) {
  await clubEvent(req);
  const where = { eventId: req.params.eventId, status: { [Op.in]: ['VALID', 'REFUNDED'] } };
  if (req.query.status === 'checked-in') where.checkedInAt = { [Op.ne]: null };
  if (req.query.status === 'not-arrived') Object.assign(where, { checkedInAt: null, status: 'VALID' });
  if (req.query.type) where.registrationType = req.query.type;
  if (req.query.search) {
    const q = `%${String(req.query.search).trim()}%`;
    where[Op.or] = [{ holderName: { [Op.like]: q } }, { ticketCode: { [Op.like]: q } }, { '$buyer.email$': { [Op.like]: q } }];
  }
  const list = await Ticket.findAll({
    where,
    attributes: { exclude: ['qrToken'] },
    include: [
      { model: User, as: 'buyer', attributes: ['id', 'name', 'email', 'phone', 'collegeId'], include: [{ model: College, as: 'college', attributes: ['id', 'name', 'code'] }] },
      { model: User, as: 'checkedInBy', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
    limit: 1000,
  });
  res.json({ tickets: list });
}

async function cancel(req, res) {
  await clubEvent(req);
  res.json(await ticketService.cancelEvent(req.params.eventId, req.user.id));
}

// POST /api/clubs/:clubId/manage/tickets/:ticketId/refund
async function refundTicket(req, res) {
  const ticket = await Ticket.findByPk(req.params.ticketId, { include: [{ model: Event, as: 'event', attributes: ['clubId'] }] });
  if (!ticket || ticket.event.clubId !== req.club.id) throw new AppError('Ticket not found', 404);
  res.json({ ticket: await ticketService.refundTicket(ticket.id, req.user.id) });
}

// ---------- Event volunteers ----------

// GET /api/clubs/:clubId/manage/events/:eventId/volunteers — approved helpers and pending offers
async function listVolunteers(req, res) {
  await clubEvent(req);
  const volunteers = await EventVolunteer.findAll({ where: { eventId: req.params.eventId }, include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }], order: [['status', 'DESC'], ['duty', 'ASC']] });
  res.json({ volunteers });
}

// POST /api/clubs/:clubId/manage/events/:eventId/volunteers/:userId/decision { decision: APPROVED|REJECTED, canCheckIn }
async function decideVolunteer(req, res) {
  const event = await clubEvent(req);
  const row = await EventVolunteer.findOne({ where: { eventId: event.id, userId: req.params.userId, status: 'PENDING' } });
  if (!row) throw new AppError('No pending offer from this person', 404);
  if (req.body.decision === 'APPROVED') {
    await row.update({ status: 'APPROVED', canCheckIn: Boolean(req.body.canCheckIn), assignedById: req.user.id });
    await notify(row.userId, { title: `You're helping at ${event.title}`, body: `Duty: ${row.duty}${row.canCheckIn ? ' · you can check people in' : ''}`, link: '/volunteering' });
  } else if (req.body.decision === 'REJECTED') {
    await row.destroy();
    await notify(row.userId, { title: `${event.title}: no extra helpers needed`, body: 'Thanks for offering! The manager has enough volunteers for this one.', link: '/helping-out' });
  } else throw new AppError('Decision must be APPROVED or REJECTED');
  res.json({ volunteer: row });
}

// GET /api/clubs/:clubId/manage/volunteers — the club's volunteers (with what they're helping at) and
// offers to help that are waiting for approval
async function clubVolunteers(req, res) {
  const now = new Date();
  const [staff, rows] = await Promise.all([
    ClubMember.findAll({
      where: { clubId: req.club.id, status: 'ACTIVE', role: CLUB_CAN.staff },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }],
      order: [['role', 'ASC']],
    }),
    EventVolunteer.findAll({
      include: [
        { model: Event, as: 'event', attributes: ['id', 'title', 'startsAt', 'volunteersNeeded'], where: { clubId: req.club.id, status: 'PUBLISHED', startsAt: { [Op.gte]: now } } },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
      ],
      order: [[{ model: Event, as: 'event' }, 'startsAt', 'ASC']],
    }),
  ]);
  res.json({
    volunteers: staff.map((m) => ({
      memberId: m.id,
      role: m.role,
      user: m.user,
      events: rows.filter((r) => r.userId === m.userId && r.status === 'APPROVED').map((r) => ({ id: r.event.id, title: r.event.title, startsAt: r.event.startsAt, duty: r.duty })),
    })),
    offers: rows.filter((r) => r.status === 'PENDING'),
  });
}

// GET /api/clubs/:clubId/manage/participants?eventId= — everyone registered for one of the club's events
async function participants(req, res) {
  const events = await Event.findAll({ where: { clubId: req.club.id, status: { [Op.ne]: 'DRAFT' } }, attributes: ['id', 'title', 'startsAt', 'capacity', 'status'], order: [['startsAt', 'DESC']] });
  const soon = events.filter((e) => new Date(e.startsAt) >= new Date(Date.now() - 86400000));
  const eventId = Number(req.query.eventId) || soon[soon.length - 1]?.id || events[0]?.id;
  const event = events.find((e) => e.id === eventId);
  res.json({ events, event: event || null, participants: event ? await participantRows(event.id) : [] });
}

// POST /api/clubs/:clubId/manage/events/:eventId/volunteers { userId, duty, canCheckIn }
// Volunteers must be club staff (volunteer/treasurer/manager) of this club.
async function addVolunteer(req, res) {
  const event = await clubEvent(req);
  const cm = await ClubMember.findOne({ where: { clubId: req.club.id, userId: req.body.userId, status: 'ACTIVE' } });
  if (!cm || !CLUB_CAN.staff.includes(cm.role)) throw new AppError('Only club volunteers, the treasurer or managers can be event volunteers. Make them a club volunteer first.', 400);
  const [row, created] = await EventVolunteer.findOrCreate({
    where: { eventId: event.id, userId: cm.userId },
    defaults: { duty: req.body.duty || 'General', canCheckIn: Boolean(req.body.canCheckIn), assignedById: req.user.id },
  });
  if (!created) await row.update({ status: 'APPROVED', duty: req.body.duty || row.duty, canCheckIn: req.body.canCheckIn !== undefined ? Boolean(req.body.canCheckIn) : row.canCheckIn });
  await notify(cm.userId, { title: `You're volunteering at ${event.title}`, body: `Duty: ${row.duty}${row.canCheckIn ? ' · you can check people in' : ''}`, link: '/volunteering' });
  res.status(created ? 201 : 200).json({ volunteer: row });
}

// DELETE /api/clubs/:clubId/manage/events/:eventId/volunteers/:userId
async function removeVolunteer(req, res) {
  await clubEvent(req);
  const deleted = await EventVolunteer.destroy({ where: { eventId: req.params.eventId, userId: req.params.userId } });
  if (!deleted) throw new AppError('Not a volunteer on this event', 404);
  res.json({ message: 'Removed' });
}

module.exports = {
  listPublic,
  getPublic,
  getQuote,
  checkout,
  myTickets,
  checkinEvents,
  checkIn,
  checkinStats,
  myVolunteering,
  helpingOut,
  offerToHelp,
  withdrawOffer,
  volunteerParticipants,
  adminList,
  create,
  update,
  remove,
  report,
  tickets,
  cancel,
  refundTicket,
  listVolunteers,
  addVolunteer,
  removeVolunteer,
  decideVolunteer,
  clubVolunteers,
  participants,
};
