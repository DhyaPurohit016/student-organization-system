// College Head: runs one college — its clubs, club managers, students, and an overview of everything
const { Op, QueryTypes } = require('sequelize');
const { sequelize, College, CollegeAdmin, Club, ClubMember, User, Event, Ticket, Announcement, ExpenseClaim, EventVolunteer, SupportRequest } = require('../models');
const clubMemberService = require('../services/clubMemberService');
const ledgerService = require('../services/ledgerService');
const announcementService = require('../services/announcementService');
const { notify } = require('../services/notificationService');
const AppError = require('../utils/AppError');

const clubIdsOf = async (collegeId) => (await Club.findAll({ where: { collegeId }, attributes: ['id'] })).map((c) => c.id);

// GET /api/colleges/:collegeId/manage — dashboard
async function overview(req, res) {
  const college = req.college;
  const clubIds = await clubIdsOf(college.id);
  const now = new Date();
  const [clubs, students, pendingStudents, upcomingEvents, tickets, heads, finance, managers, pendingExpenses, openSupport] = await Promise.all([
    Club.count({ where: { collegeId: college.id, status: 'ACTIVE' } }),
    User.count({ where: { collegeId: college.id, collegeStatus: 'VERIFIED' } }),
    User.count({ where: { collegeId: college.id, collegeStatus: 'PENDING' } }),
    Event.count({ where: { collegeId: college.id, status: 'PUBLISHED', startsAt: { [Op.gte]: now } } }),
    clubIds.length
      ? sequelize.query(`SELECT COUNT(*) AS n FROM tickets t JOIN events e ON e.id = t.eventId WHERE e.collegeId = :id AND t.status = 'VALID'`, { replacements: { id: college.id }, type: QueryTypes.SELECT })
      : [{ n: 0 }],
    CollegeAdmin.findAll({ where: { collegeId: college.id }, include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }] }),
    ledgerService.summary({ clubIds }),
    clubIds.length ? ClubMember.count({ where: { clubId: clubIds, status: 'ACTIVE', role: 'MANAGER' }, distinct: true, col: 'userId' }) : 0,
    clubIds.length ? ExpenseClaim.count({ where: { clubId: clubIds, status: ['SUBMITTED', 'APPROVED'] } }) : 0,
    SupportRequest.count({ where: { collegeId: college.id, status: 'OPEN' } }),
  ]);
  res.json({
    college,
    heads: heads.map((h) => h.user),
    counts: { clubs, students, pendingStudents, upcomingEvents, ticketsSold: Number(tickets[0].n), managers, pendingExpenses, openSupport },
    finance: { totalIncome: finance.totalIncome, totalExpense: finance.totalExpense, balance: finance.balance, monthly: finance.monthly.slice(-6) },
  });
}

// PATCH /api/colleges/:collegeId/manage — details and the "approve students" setting
async function updateCollege(req, res) {
  const allowed = ['name', 'city', 'address', 'email', 'phone', 'approveStudents'];
  const changes = Object.fromEntries(allowed.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k] === '' ? null : req.body[k]]));
  await req.college.update(changes);
  res.json({ college: req.college });
}

// GET /api/colleges/:collegeId/manage/clubs — every club with its managers and numbers
async function listClubs(req, res) {
  const clubs = await Club.findAll({ where: { collegeId: req.college.id }, order: [['status', 'ASC'], ['name', 'ASC']] });
  const ids = clubs.map((c) => c.id);
  const [managers, memberCounts, pendingCounts, eventCounts] = await Promise.all([
    ClubMember.findAll({ where: { clubId: ids, status: 'ACTIVE', role: 'MANAGER' }, include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }] }),
    ClubMember.findAll({ attributes: ['clubId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { clubId: ids, status: 'ACTIVE' }, group: ['clubId'], raw: true }),
    ClubMember.findAll({ attributes: ['clubId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { clubId: ids, status: 'PENDING' }, group: ['clubId'], raw: true }),
    Event.findAll({ attributes: ['clubId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { clubId: ids, status: 'PUBLISHED', startsAt: { [Op.gte]: new Date() } }, group: ['clubId'], raw: true }),
  ]);
  const by = (rows) => Object.fromEntries(rows.map((r) => [r.clubId, Number(r.n)]));
  const [members, pending, events] = [by(memberCounts), by(pendingCounts), by(eventCounts)];
  res.json({
    clubs: clubs.map((c) => ({
      ...c.toJSON(),
      managers: managers.filter((m) => m.clubId === c.id).map((m) => ({ ...m.user.toJSON(), memberId: m.id })),
      members: members[c.id] || 0,
      pendingRequests: pending[c.id] || 0,
      upcomingEvents: events[c.id] || 0,
    })),
  });
}

const pickClub = (b) => Object.fromEntries(['name', 'code', 'description', 'logoUrl', 'requiresDues', 'status'].filter((k) => b[k] !== undefined).map((k) => [k, b[k] === '' ? null : b[k]]));

// POST /api/colleges/:collegeId/manage/clubs { name, code, description, managerEmail? }
async function createClub(req, res) {
  const club = await Club.create({ ...pickClub(req.body), status: 'ACTIVE', collegeId: req.college.id, createdById: req.user.id });
  if (req.body.managerEmail) {
    try {
      await clubMemberService.addByEmail(club, req.body.managerEmail, 'MANAGER', req.user);
    } catch (err) {
      await club.destroy(); // don't leave a club without the manager that was asked for
      throw err;
    }
  }
  res.status(201).json({ club });
}

// PATCH /api/colleges/:collegeId/manage/clubs/:clubId — rename, archive/restore...
async function updateClub(req, res) {
  const club = await Club.findOne({ where: { id: req.params.clubId, collegeId: req.college.id } });
  if (!club) throw new AppError('Club not found', 404);
  await club.update(pickClub(req.body));
  res.json({ club });
}

// POST /api/colleges/:collegeId/manage/clubs/:clubId/managers { email } — appoint a manager
async function addManager(req, res) {
  const club = await Club.findOne({ where: { id: req.params.clubId, collegeId: req.college.id } });
  if (!club) throw new AppError('Club not found', 404);
  const cm = await clubMemberService.addByEmail(club, req.body.email, 'MANAGER', req.user);
  res.status(201).json({ member: cm });
}

// DELETE /api/colleges/:collegeId/manage/clubs/:clubId/managers/:userId — the manager becomes a plain member
async function removeManager(req, res) {
  const club = await Club.findOne({ where: { id: req.params.clubId, collegeId: req.college.id } });
  if (!club) throw new AppError('Club not found', 404);
  const cm = await ClubMember.findOne({ where: { clubId: club.id, userId: req.params.userId, status: 'ACTIVE', role: 'MANAGER' } });
  if (!cm) throw new AppError('Not a manager of this club', 404);
  await clubMemberService.changeRole(club, cm.id, 'MEMBER', req.user, { overseer: true });
  res.json({ message: 'Manager removed' });
}

// GET /api/colleges/:collegeId/manage/people?role=MANAGER|STAFF — club managers, or all club staff
// (managers, treasurers, volunteers) across the college's clubs
async function people(req, res) {
  const clubs = await Club.findAll({ where: { collegeId: req.college.id }, attributes: ['id', 'name', 'status'] });
  const roles = req.query.role === 'MANAGER' ? ['MANAGER'] : ['MANAGER', 'TREASURER', 'VOLUNTEER'];
  const rows = clubs.length
    ? await ClubMember.findAll({
        where: { clubId: clubs.map((c) => c.id), status: 'ACTIVE', role: roles },
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }],
        order: [['role', 'ASC']],
      })
    : [];
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const helping = userIds.length
    ? Object.fromEntries(
        (
          await EventVolunteer.findAll({
            attributes: ['userId', [sequelize.fn('COUNT', sequelize.col('EventVolunteer.id')), 'n']],
            where: { userId: userIds, status: 'APPROVED' },
            include: [{ model: Event, as: 'event', attributes: [], where: { collegeId: req.college.id, startsAt: { [Op.gte]: new Date() } } }],
            group: ['userId'],
            raw: true,
          })
        ).map((r) => [r.userId, Number(r.n)])
      )
    : {};
  const clubName = Object.fromEntries(clubs.map((c) => [c.id, c.name]));
  res.json({
    people: rows
      .map((r) => ({ id: r.id, role: r.role, club: { id: r.clubId, name: clubName[r.clubId] }, user: r.user, upcomingEvents: helping[r.userId] || 0 }))
      .sort((a, b) => a.club.name.localeCompare(b.club.name) || a.user.name.localeCompare(b.user.name)),
  });
}

// GET /api/colleges/:collegeId/manage/expenses?status= — Expense Management across every club
async function expenses(req, res) {
  const clubIds = await clubIdsOf(req.college.id);
  const where = { clubId: clubIds };
  if (req.query.status) where.status = req.query.status;
  const claims = clubIds.length
    ? await ExpenseClaim.findAll({
        where,
        include: [
          { model: User, as: 'claimant', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'reviewedBy', attributes: ['id', 'name'] },
          { model: Event, as: 'event', attributes: ['id', 'title'] },
          { model: Club, as: 'club', attributes: ['id', 'name'] },
        ],
        order: [[sequelize.literal("FIELD(ExpenseClaim.status, 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED')"), 'ASC'], ['createdAt', 'DESC']],
        limit: 500,
      })
    : [];
  const counts = clubIds.length
    ? await ExpenseClaim.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { clubId: clubIds }, group: ['status'], raw: true })
    : [];
  res.json({ claims, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) });
}

// GET /api/colleges/:collegeId/manage/students?status=PENDING&search=
async function listStudents(req, res) {
  const where = { collegeId: req.college.id };
  if (req.query.status) where.collegeStatus = req.query.status;
  if (req.query.search) {
    const q = `%${String(req.query.search).trim()}%`;
    where[Op.or] = [{ name: { [Op.like]: q } }, { email: { [Op.like]: q } }, { studentId: { [Op.like]: q } }];
  }
  const students = await User.findAll({ where, order: [['createdAt', 'DESC']], limit: 300 });
  const counts = await User.findAll({ attributes: ['collegeStatus', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { collegeId: req.college.id }, group: ['collegeStatus'], raw: true });
  res.json({ students, counts: Object.fromEntries(counts.map((c) => [c.collegeStatus, Number(c.n)])) });
}

// POST /api/colleges/:collegeId/manage/students/:userId/decision { decision: VERIFIED|REJECTED }
async function decideStudent(req, res) {
  const { decision } = req.body;
  if (!['VERIFIED', 'REJECTED'].includes(decision)) throw new AppError('Decision must be VERIFIED or REJECTED');
  const user = await User.findOne({ where: { id: req.params.userId, collegeId: req.college.id } });
  if (!user) throw new AppError('Student not found', 404);
  await user.update({ collegeStatus: decision });
  await notify(user.id, {
    title: decision === 'VERIFIED' ? `You're verified as a student of ${req.college.name}` : `${req.college.name} could not verify you`,
    body: decision === 'VERIFIED' ? 'You can now register for college-only events.' : 'You can still join public events. Contact the college if this is a mistake.',
    link: '/profile',
  });
  res.json({ user });
}

// GET /api/colleges/:collegeId/manage/events — every club's events
async function listEvents(req, res) {
  const events = await Event.findAll({ where: { collegeId: req.college.id }, include: [{ model: Club, as: 'club', attributes: ['id', 'name'] }], order: [['startsAt', 'DESC']], limit: 300 });
  const ids = events.map((e) => e.id);
  const sold = ids.length
    ? Object.fromEntries(
        (await Ticket.findAll({ attributes: ['eventId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { eventId: ids, status: 'VALID' }, group: ['eventId'], raw: true })).map((r) => [r.eventId, Number(r.n)])
      )
    : {};
  res.json({ events: events.map((e) => ({ ...e.toJSON(), sold: sold[e.id] || 0 })) });
}

// GET /api/colleges/:collegeId/manage/finance?from&to — money per club and in total
async function finance(req, res) {
  const clubs = await Club.findAll({ where: { collegeId: req.college.id }, attributes: ['id', 'name', 'status'], order: [['name', 'ASC']] });
  const perClub = await Promise.all(
    clubs.map(async (c) => {
      const s = await ledgerService.summary({ clubIds: [c.id], from: req.query.from, to: req.query.to });
      const [members, events, [t]] = await Promise.all([
        ClubMember.count({ where: { clubId: c.id, status: 'ACTIVE' } }),
        Event.count({ where: { clubId: c.id, status: 'PUBLISHED' } }),
        sequelize.query(
          `SELECT SUM(t.status = 'VALID') AS sold, SUM(t.status = 'VALID' AND t.checkedInAt IS NOT NULL) AS checkedIn
           FROM tickets t JOIN events e ON e.id = t.eventId WHERE e.clubId = :id`,
          { replacements: { id: c.id }, type: QueryTypes.SELECT }
        ),
      ]);
      return {
        clubId: c.id,
        name: c.name,
        status: c.status,
        members,
        events,
        ticketsSold: Number(t.sold || 0),
        checkedIn: Number(t.checkedIn || 0),
        totalIncome: s.totalIncome,
        totalExpense: s.totalExpense,
        net: s.net,
        balance: s.balance,
      };
    })
  );
  const total = await ledgerService.summary({ clubIds: clubs.map((c) => c.id), from: req.query.from, to: req.query.to });
  res.json({ total, clubs: perClub });
}

// ---------- College-wide announcements ----------

async function listAnnouncements(req, res) {
  const announcements = await Announcement.findAll({
    where: { collegeId: req.college.id },
    include: [
      { model: Club, as: 'club', attributes: ['id', 'name'] },
      { model: User, as: 'author', attributes: ['id', 'name'] },
    ],
    order: [['status', 'ASC'], ['publishedAt', 'DESC'], ['updatedAt', 'DESC']],
    limit: 200,
  });
  res.json({ announcements });
}

async function createAnnouncement(req, res) {
  const { title, body, audience = 'COLLEGE', pinned, publish, sendEmail } = req.body;
  if (!['PUBLIC', 'COLLEGE'].includes(audience)) throw new AppError('College announcements go to Everyone or the college');
  const a = await Announcement.create({ collegeId: req.college.id, clubId: null, title, body, audience, pinned: Boolean(pinned), authorId: req.user.id });
  if (publish) await announcementService.publish(a, { sendEmail });
  res.status(201).json({ announcement: await a.reload() });
}

async function publishAnnouncement(req, res) {
  const a = await Announcement.findOne({ where: { id: req.params.id, collegeId: req.college.id, clubId: null } });
  if (!a) throw new AppError('Announcement not found', 404);
  res.json({ announcement: await announcementService.publish(a, { sendEmail: req.body.sendEmail }) });
}

async function deleteAnnouncement(req, res) {
  const deleted = await Announcement.destroy({ where: { id: req.params.id, collegeId: req.college.id, clubId: null } });
  if (!deleted) throw new AppError('Announcement not found', 404);
  res.json({ message: 'Deleted' });
}

module.exports = {
  removeManager,
  people,
  expenses,
  overview,
  updateCollege,
  listClubs,
  createClub,
  updateClub,
  addManager,
  listStudents,
  decideStudent,
  listEvents,
  finance,
  listAnnouncements,
  createAnnouncement,
  publishAnnouncement,
  deleteAnnouncement,
};
