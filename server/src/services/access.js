// The one place that decides who may do what. Routes and services ask here instead of checking roles themselves.
const { Op } = require('sequelize');
const { Club, ClubMember, College, CollegeAdmin, Membership, EventVolunteer } = require('../models');
const AppError = require('../utils/AppError');
const { CLUB_CAN } = require('../config/roles');

const isPlatformAdmin = (user) => user?.role === 'PLATFORM_ADMIN';

// The Platform Admin runs the platform (colleges, heads, accounts), not colleges or clubs themselves
async function isCollegeHead(user, collegeId) {
  if (!user || !collegeId || isPlatformAdmin(user)) return false;
  return (await CollegeAdmin.count({ where: { collegeId, userId: user.id } })) > 0;
}

// A verified student of this college (chose it at sign-up and, if the college asks for it, was approved)
const isVerifiedStudentOf = (user, collegeId) => Boolean(user && collegeId && user.collegeId === collegeId && user.collegeStatus === 'VERIFIED');

async function currentDues(userId, clubId, transaction) {
  const now = new Date();
  return Membership.findOne({
    where: { userId, clubId, status: 'ACTIVE', startDate: { [Op.lte]: now }, endDate: { [Op.gt]: now } },
    order: [['endDate', 'DESC']],
    transaction,
  });
}

// Everything about one person's standing in one club
async function clubAccess(user, club, transaction) {
  const empty = { role: null, status: null, overseer: false, isMember: false, duesOk: false, can: { manage: false, money: false, staff: false, view: false, oversee: false, finance: false }, record: null };
  if (!user || !club) return empty;
  // A club loaded with only some columns would silently skip the dues rule: reload it
  if (club.requiresDues === undefined || club.collegeId === undefined) club = await Club.findByPk(club.id, { transaction });

  const overseer = await isCollegeHead(user, club.collegeId);
  const record = await ClubMember.findOne({ where: { clubId: club.id, userId: user.id }, transaction });
  const active = record?.status === 'ACTIVE';
  const role = active ? record.role : null;

  // Club staff never need to pay dues; regular members do when the club requires it
  const dues = active && club.requiresDues ? await currentDues(user.id, club.id, transaction) : null;
  const duesOk = active && (!club.requiresDues || role !== 'MEMBER' || Boolean(dues));

  const roleCan = (what) => Boolean(role && CLUB_CAN[what].includes(role));
  return {
    role,
    status: record?.status || null,
    overseer, // College Head of this club's college: sees everything, changes only money matters
    isMember: active && duesOk,
    duesOk,
    dues,
    record,
    can: {
      manage: roleCan('manage'), // change the club: members, events, shop, news, tasks
      money: roleCan('money'), // write to the books: entries, dues, takings
      staff: roleCan('staff'), // club volunteers: tasks, verify cards, claims
      view: overseer || roleCan('staff'), // open the club workspace
      oversee: overseer || roleCan('manage'), // read manager pages (members, events, tasks, participants)
      finance: overseer || roleCan('money'), // finance, reports and expense management
    },
  };
}

// Who may register for an event, and at which price.
//   PUBLIC  → anyone logged in
//   COLLEGE → verified students of the event's college (club members of the club too)
//   CLUB    → members of the club only
// Price tiers: club member → member price; same-college student → college price; otherwise → guest price
async function eventEligibility(user, event, club, transaction) {
  const access = await clubAccess(user, club, transaction);
  const sameCollege = isVerifiedStudentOf(user, event.collegeId);
  const registrationType = access.isMember ? 'CLUB_MEMBER' : sameCollege ? 'COLLEGE_STUDENT' : user?.collegeId && user.collegeStatus === 'VERIFIED' ? 'EXTERNAL_STUDENT' : 'GUEST';

  let allowed = true;
  let reason = null;
  if (event.visibility === 'COLLEGE' && !(sameCollege || access.isMember)) {
    allowed = false;
    reason =
      user?.collegeId === event.collegeId && user.collegeStatus === 'PENDING'
        ? 'This event is only for students of the college. Your college membership is waiting for approval.'
        : 'This event is only for students of the college.';
  }
  if (event.visibility === 'CLUB' && !access.isMember) {
    allowed = false;
    reason =
      access.status === 'ACTIVE' && !access.duesOk
        ? "This event is for club members. Pay your club membership to take part."
        : access.status === 'PENDING'
          ? 'This event is for club members. Your request to join is waiting for approval.'
          : 'This event is only for members of the club.';
  }
  return { allowed, reason, registrationType, access, sameCollege };
}

// May this person see the event at all? Private events are hidden from people who can't attend
// (club staff and overseers always see their club's events).
async function canSeeEvent(user, event, club) {
  if (event.visibility === 'PUBLIC') return true;
  const e = await eventEligibility(user, event, club);
  // Club members with lapsed dues, and students whose college approval is pending, still see the
  // event; trying to register explains what's missing
  const pendingStudent = event.visibility === 'COLLEGE' && user?.collegeId === event.collegeId && user.collegeStatus === 'PENDING';
  return e.allowed || e.access.can.view || e.access.status === 'ACTIVE' || pendingStudent;
}

// Door check-in: the club's manager, overseers, or a volunteer on this event allowed to check people in
async function canCheckIn(user, event, club) {
  const access = await clubAccess(user, club);
  if (access.can.manage) return true;
  return (await EventVolunteer.count({ where: { eventId: event.id, userId: user.id, canCheckIn: true, status: 'APPROVED' } })) > 0;
}

// Clubs (ids) where the user holds a role, optionally filtered by capability
async function myClubIds(user, capability) {
  const rows = await ClubMember.findAll({ where: { userId: user.id, status: 'ACTIVE' }, attributes: ['clubId', 'role'] });
  return rows.filter((r) => !capability || CLUB_CAN[capability].includes(r.role)).map((r) => r.clubId);
}

async function loadClub(clubId) {
  return Club.findByPk(clubId);
}

// ---------- Deactivated colleges ----------
// When the Platform Admin deactivates a college, everything in it is switched off.

// Ids of deactivated colleges (to hide their clubs, events and news from lists)
async function inactiveCollegeIds() {
  return (await College.findAll({ where: { status: 'INACTIVE' }, attributes: ['id'] })).map((c) => c.id);
}

// The deactivated college that stops this person using the platform, if any: the college they belong to,
// or one they are College Head of. Platform Admins are never blocked.
async function blockedByCollege(user) {
  if (!user || isPlatformAdmin(user)) return null;
  const heads = await CollegeAdmin.findAll({ where: { userId: user.id }, attributes: ['collegeId'] });
  const ids = [user.collegeId, ...heads.map((h) => h.collegeId)].filter(Boolean);
  if (!ids.length) return null;
  return College.findOne({ where: { id: ids, status: 'INACTIVE' }, attributes: ['id', 'name'] });
}

// Open = the club isn't archived and its college is active
async function isClubOpen(club) {
  if (!club || club.status !== 'ACTIVE') return false;
  const status = club.college?.status ?? (await College.findByPk(club.collegeId, { attributes: ['status'] }))?.status;
  return status === 'ACTIVE';
}

// Throws "not found" for clubs that are archived or whose college is deactivated
async function assertClubOpen(club, what = 'Club') {
  if (!(await isClubOpen(club))) throw new AppError(`${what} not found`, 404);
  return club;
}

module.exports = { inactiveCollegeIds, blockedByCollege, isClubOpen, assertClubOpen, isPlatformAdmin, isCollegeHead, isVerifiedStudentOf, currentDues, clubAccess, eventEligibility, canSeeEvent, canCheckIn, myClubIds, loadClub };
