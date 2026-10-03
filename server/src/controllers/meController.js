// "Me": everything about the logged-in person across colleges and clubs
const { Op } = require('sequelize');
const { College, CollegeAdmin, Club, ClubMember, EventVolunteer, Event } = require('../models');
const access = require('../services/access');
const clubMemberService = require('../services/clubMemberService');
const membershipService = require('../services/membershipService');
const { CLUB_CAN } = require('../config/roles');

// GET /api/me/context — what the app needs to build menus: platform role, college, colleges I head,
// and every club I'm in (or asked to join) with my role and what I can do there
async function context(req, res) {
  const user = req.user;
  const [college, heads, rows] = await Promise.all([
    user.collegeId ? College.findByPk(user.collegeId, { attributes: ['id', 'name', 'code', 'approveStudents'] }) : null,
    CollegeAdmin.findAll({ where: { userId: user.id }, include: [{ model: College, as: 'college', attributes: ['id', 'name', 'code'] }] }),
    ClubMember.findAll({
      where: { userId: user.id, status: ['ACTIVE', 'PENDING'] },
      include: [{ model: Club, as: 'club', attributes: ['id', 'name', 'code', 'collegeId', 'requiresDues', 'status'], include: [{ model: College, as: 'college', attributes: ['id', 'name', 'code'] }] }],
      order: [['createdAt', 'ASC']],
    }),
  ]);

  const clubs = [];
  for (const r of rows) {
    if (r.club.status !== 'ACTIVE') continue;
    const a = r.status === 'ACTIVE' ? await access.clubAccess(user, r.club) : null;
    clubs.push({
      id: r.club.id,
      name: r.club.name,
      code: r.club.code,
      college: r.club.college,
      status: r.status,
      role: r.status === 'ACTIVE' ? r.role : null,
      isMember: a?.isMember || false,
      duesRequired: Boolean(a && r.club.requiresDues && r.role === 'MEMBER' && !a.duesOk),
      can: {
        manage: r.status === 'ACTIVE' && CLUB_CAN.manage.includes(r.role),
        money: r.status === 'ACTIVE' && CLUB_CAN.money.includes(r.role),
        staff: r.status === 'ACTIVE' && CLUB_CAN.staff.includes(r.role),
      },
    });
  }

  // Door check-in: club managers, and volunteers with check-in rights at an upcoming event
  const canCheckIn =
    clubs.some((c) => c.can.manage) ||
    (await EventVolunteer.count({
      where: { userId: user.id, status: 'APPROVED', canCheckIn: true },
      include: [{ model: Event, as: 'event', attributes: [], where: { startsAt: { [Op.gte]: new Date(Date.now() - 86400000) } } }],
    })) > 0;

  res.json({
    user,
    canCheckIn,
    isPlatformAdmin: access.isPlatformAdmin(user),
    college,
    collegeStatus: user.collegeStatus,
    headOf: heads.map((h) => h.college),
    clubs,
  });
}

// GET /api/me/clubs/:clubId/card — my member card for a club
async function card(req, res) {
  const club = await Club.findByPk(req.params.clubId);
  const cm = club && (await ClubMember.findOne({ where: { clubId: club.id, userId: req.user.id, status: 'ACTIVE' } }));
  if (!cm) return res.status(404).json({ message: "You're not a member of this club" });
  const a = await access.clubAccess(req.user, club);
  res.json({
    club: { id: club.id, name: club.name, code: club.code },
    memberNumber: cm.memberNumber,
    role: cm.role,
    isMember: a.isMember,
    membership: await membershipService.getCurrentMembership(req.user.id, club.id),
    qr: await clubMemberService.cardQr(cm),
  });
}

module.exports = { context, card };
