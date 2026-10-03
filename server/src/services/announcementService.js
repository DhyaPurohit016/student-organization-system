// Announcements for clubs and colleges, and club mailing lists.
//
// Club post audiences:    PUBLIC  — club's public page; sent to club members + the club's mailing list
//                         COLLEGE — verified students of the club's college
//                         MEMBERS — the club's members (and staff)
//                         STAFF   — the club's manager, treasurer and volunteers
// College posts (no club): PUBLIC or COLLEGE, sent to the college's verified students
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Announcement, User, Subscriber, ClubMember, CollegeAdmin, Club } = require('../models');
const { notify } = require('./notificationService');
const { sendEmail, devMode } = require('../utils/email');
const AppError = require('../utils/AppError');
const { CLUB_CAN } = require('../config/roles');

const appUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';
const USER_FIELDS = ['id', 'name', 'email', 'emailOptIn'];

// Conditions for the announcements a logged-in user may read
async function visibilityWhere(user) {
  const or = [{ audience: 'PUBLIC' }];
  if (!user) return { [Op.or]: or };

  const [roles, headOf] = await Promise.all([
    ClubMember.findAll({ where: { userId: user.id, status: 'ACTIVE' }, attributes: ['clubId', 'role'] }),
    CollegeAdmin.findAll({ where: { userId: user.id }, attributes: ['collegeId'] }),
  ]);
  const memberClubs = roles.map((r) => r.clubId);
  const staffClubs = roles.filter((r) => CLUB_CAN.staff.includes(r.role)).map((r) => r.clubId);
  const headColleges = headOf.map((h) => h.collegeId);
  const myCollege = user.collegeStatus === 'VERIFIED' ? user.collegeId : null;

  if (user.role === 'PLATFORM_ADMIN') return {};
  const colleges = [...new Set([myCollege, ...headColleges].filter(Boolean))];
  if (colleges.length) or.push({ audience: 'COLLEGE', collegeId: colleges });
  if (memberClubs.length) or.push({ audience: 'MEMBERS', clubId: memberClubs });
  if (staffClubs.length) or.push({ audience: 'STAFF', clubId: staffClubs });
  if (headColleges.length) or.push({ collegeId: headColleges }); // College Heads see everything in their college
  return { [Op.or]: or };
}

async function activeClubUsers(clubId, roles) {
  const rows = await ClubMember.findAll({
    where: { clubId, status: 'ACTIVE', ...(roles ? { role: roles } : {}) },
    include: [{ model: User, as: 'user', attributes: USER_FIELDS, where: { isActive: true } }],
  });
  return rows.map((r) => r.user);
}

async function collegeStudents(collegeId) {
  return User.findAll({ where: { collegeId, collegeStatus: 'VERIFIED', isActive: true }, attributes: USER_FIELDS });
}

// Registered users who get this announcement
async function recipientUsers(a) {
  if (!a.clubId) return collegeStudents(a.collegeId); // college-wide post
  if (a.audience === 'STAFF') return activeClubUsers(a.clubId, CLUB_CAN.staff);
  if (a.audience === 'MEMBERS' || a.audience === 'PUBLIC') return activeClubUsers(a.clubId);
  if (a.audience === 'COLLEGE') {
    const [students, members] = await Promise.all([collegeStudents(a.collegeId), activeClubUsers(a.clubId)]);
    const byId = new Map([...students, ...members].map((u) => [u.id, u]));
    return [...byId.values()];
  }
  return [];
}

// Publishes and (optionally) emails. Delivery runs after the response so the author isn't kept waiting.
async function publish(announcement, { sendEmail: wantEmail }) {
  if (announcement.status === 'PUBLISHED') throw new AppError('Already published', 409);
  await announcement.update({ status: 'PUBLISHED', publishedAt: new Date(), emailRequested: Boolean(wantEmail) });
  setImmediate(() => deliver(announcement.id, Boolean(wantEmail)).catch((err) => console.error('Announcement delivery failed:', err.message)));
  return announcement;
}

async function deliver(id, withEmail) {
  const a = await Announcement.findByPk(id, { include: [{ model: Club, as: 'club', attributes: ['id', 'name'] }] });
  const users = await recipientUsers(a);
  const from = a.club?.name || 'Your college';
  const link = a.clubId ? `/clubs/${a.clubId}#news` : '/announcements';

  await notify(users.map((u) => u.id), { title: `${from}: ${a.title}`, body: a.body.slice(0, 180), link });
  if (!withEmail) return { notified: users.length, emailed: 0 };

  const list = new Map();
  for (const u of users) if (u.emailOptIn) list.set(u.email, { name: u.name, unsubscribe: `${appUrl()}/profile` });
  if (a.clubId && a.audience === 'PUBLIC') {
    const subs = await Subscriber.findAll({ where: { clubId: a.clubId, isSubscribed: true } });
    for (const s of subs) if (!list.has(s.email)) list.set(s.email, { name: s.name, unsubscribe: `${appUrl()}/unsubscribe/${s.unsubscribeToken}` });
  }

  let sent = 0;
  for (const [email, info] of list) {
    try {
      await sendEmail({
        to: email,
        subject: `[${from}] ${a.title}`,
        text: `Hi${info.name ? ` ${info.name}` : ''},\n\n${a.body}\n\n—\n${from}\nStop these emails: ${info.unsubscribe}`,
        log: false,
      });
      sent++;
    } catch (err) {
      console.error(`Announcement email to ${email} failed:`, err.message);
    }
  }
  await a.update({ emailedAt: new Date(), emailedCount: sent });
  if (devMode()) console.log(`[email:dev] announcement "${a.title}" sent to ${sent} recipients`);
  return { notified: users.length, emailed: sent };
}

// ---------- Club mailing lists ----------

async function subscribe(club, { email, name }) {
  if (!email) throw new AppError('Email is required');
  const existing = await Subscriber.findOne({ where: { clubId: club.id, email: String(email).trim().toLowerCase() } });
  if (existing) {
    if (!existing.isSubscribed) await existing.update({ isSubscribed: true, name: name || existing.name });
    return existing;
  }
  return Subscriber.create({ clubId: club.id, email, name, unsubscribeToken: crypto.randomBytes(24).toString('hex') });
}

async function unsubscribe(token) {
  const sub = await Subscriber.findOne({ where: { unsubscribeToken: String(token || '') }, include: [{ model: Club, as: 'club', attributes: ['name'] }] });
  if (!sub) throw new AppError('This unsubscribe link is not valid', 404);
  await sub.update({ isSubscribed: false });
  return sub;
}

module.exports = { visibilityWhere, recipientUsers, publish, deliver, subscribe, unsubscribe };
