// Joining clubs: request → manager approves → member (with a member card).
// Also role changes (member ↔ volunteer ↔ treasurer ↔ manager) and leaving/removal.
const crypto = require('crypto');
const QRCode = require('qrcode');
const { sequelize, Club, ClubMember, College, User, Counter } = require('../models');
const { notify } = require('./notificationService');
const access = require('./access');
const AppError = require('../utils/AppError');

const QR_PREFIX = 'CLUB-MEM:';

async function issueCard(cm, club, t) {
  if (cm.memberNumber) return;
  const college = await College.findByPk(club.collegeId, { transaction: t });
  const seq = await Counter.next(`club-member-${club.id}`, t);
  cm.memberNumber = `${college.code}-${club.code}-${String(seq).padStart(4, '0')}`;
  cm.qrToken = crypto.randomBytes(16).toString('hex');
}

// A student asks to join (or re-asks after leaving / being rejected)
async function requestToJoin(user, club, message) {
  if (user.role === 'PLATFORM_ADMIN') throw new AppError('Platform Admin accounts cannot join clubs. Use a personal account.', 403);
  if (club.status !== 'ACTIVE') throw new AppError('This club is not taking new members', 409);
  const existing = await ClubMember.findOne({ where: { clubId: club.id, userId: user.id } });
  if (existing?.status === 'ACTIVE') throw new AppError("You're already in this club", 409);
  if (existing?.status === 'PENDING') throw new AppError('Your request is already waiting for approval', 409);
  if (existing?.status === 'REMOVED') throw new AppError('You were removed from this club. Contact the club manager.', 403);

  const cm = existing
    ? await existing.update({ status: 'PENDING', role: 'MEMBER', message: message || null, decisionNote: null, decidedAt: null, decidedById: null })
    : await ClubMember.create({ clubId: club.id, userId: user.id, role: 'MEMBER', status: 'PENDING', message: message || null });

  const managers = await ClubMember.findAll({ where: { clubId: club.id, status: 'ACTIVE', role: 'MANAGER' }, attributes: ['userId'] });
  await notify(managers.map((m) => m.userId), { title: `Join request: ${club.name}`, body: `${user.name} wants to join${message ? `: “${message}”` : ''}`, link: `/c/${club.id}/members?status=PENDING` });
  return cm;
}

async function decide(club, memberId, decision, decidedBy, note) {
  return sequelize.transaction(async (t) => {
    const cm = await ClubMember.findOne({ where: { id: memberId, clubId: club.id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!cm) throw new AppError('Request not found', 404);
    if (cm.status !== 'PENDING') throw new AppError(`This request is already ${cm.status.toLowerCase()}`, 409);

    if (decision === 'APPROVE') {
      await issueCard(cm, club, t);
      await cm.update({ status: 'ACTIVE', decidedById: decidedBy.id, decidedAt: new Date(), joinedAt: cm.joinedAt || new Date(), memberNumber: cm.memberNumber, qrToken: cm.qrToken }, { transaction: t });
      await notify(
        cm.userId,
        {
          title: `Welcome to ${club.name}!`,
          body: club.requiresDues ? 'Your request was approved. Pay the club membership to activate your member benefits.' : `Your request was approved. Member no. ${cm.memberNumber}.`,
          link: `/clubs/${club.id}`,
        },
        t
      );
    } else {
      if (!note) throw new AppError('Please give a reason for rejecting');
      await cm.update({ status: 'REJECTED', decidedById: decidedBy.id, decidedAt: new Date(), decisionNote: note }, { transaction: t });
      await notify(cm.userId, { title: `${club.name}: request not approved`, body: note, link: `/clubs/${club.id}` }, t);
    }
    return cm;
  });
}

// Manager/College Head adds someone directly (by email), optionally with a role
async function addByEmail(club, email, role, addedBy) {
  const user = await User.findOne({ where: { email: String(email || '').trim().toLowerCase() } });
  if (!user) throw new AppError('No account with that email. Ask them to sign up first.', 404);
  if (!user.isActive) throw new AppError('That account is disabled', 409);
  if (user.role === 'PLATFORM_ADMIN') throw new AppError('That is a Platform Admin account. It cannot be added to clubs.', 409);
  if (!ClubMember.ROLES.includes(role)) throw new AppError('Invalid role');

  return sequelize.transaction(async (t) => {
    let cm = await ClubMember.findOne({ where: { clubId: club.id, userId: user.id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!cm) cm = ClubMember.build({ clubId: club.id, userId: user.id });
    await issueCard(cm, club, t);
    cm.set({ role, status: 'ACTIVE', decidedById: addedBy.id, decidedAt: new Date(), joinedAt: cm.joinedAt || new Date(), decisionNote: null });
    await cm.save({ transaction: t });
    await notify(user.id, { title: `You've been added to ${club.name}`, body: role === 'MEMBER' ? 'You are now a member.' : `Your role: ${role.toLowerCase()}.`, link: `/clubs/${club.id}` }, t);
    return cm;
  });
}

// Change someone's role in the club. Only an overseer (College Head / Platform Admin) can create or
// remove managers; a club must always keep at least one manager.
async function changeRole(club, memberId, role, actor, actorAccess) {
  if (!ClubMember.ROLES.includes(role)) throw new AppError('Invalid role');
  const cm = await ClubMember.findOne({ where: { id: memberId, clubId: club.id } });
  if (!cm || cm.status !== 'ACTIVE') throw new AppError('Member not found', 404);
  if ((role === 'MANAGER' || cm.role === 'MANAGER') && !actorAccess.overseer) {
    throw new AppError('Only the College Head can appoint or replace club managers', 403);
  }
  if (cm.role === 'MANAGER' && role !== 'MANAGER') await assertNotLastManager(club, cm);
  await cm.update({ role });
  await notify(cm.userId, { title: `${club.name}: your role changed`, body: `You are now ${role === 'MEMBER' ? 'a member' : `the club ${role.toLowerCase()}`}.`, link: `/clubs/${club.id}` });
  return cm;
}

async function assertNotLastManager(club, cm) {
  const managers = await ClubMember.count({ where: { clubId: club.id, status: 'ACTIVE', role: 'MANAGER' } });
  if (managers <= 1) throw new AppError('A club needs at least one manager. Appoint another manager first.', 409);
}

async function remove(club, memberId, actorAccess) {
  const cm = await ClubMember.findOne({ where: { id: memberId, clubId: club.id } });
  if (!cm || cm.status !== 'ACTIVE') throw new AppError('Member not found', 404);
  if (cm.role === 'MANAGER') {
    if (!actorAccess.overseer) throw new AppError('Only the College Head can remove a club manager', 403);
    await assertNotLastManager(club, cm);
  }
  await cm.update({ status: 'REMOVED', role: 'MEMBER' });
  await notify(cm.userId, { title: `Removed from ${club.name}`, body: 'Contact the club manager if you think this is a mistake.', link: `/clubs/${club.id}` });
  return cm;
}

async function leave(user, club) {
  const cm = await ClubMember.findOne({ where: { clubId: club.id, userId: user.id } });
  if (!cm || !['ACTIVE', 'PENDING'].includes(cm.status)) throw new AppError("You're not in this club", 404);
  if (cm.status === 'ACTIVE' && cm.role === 'MANAGER') await assertNotLastManager(club, cm);
  await cm.update({ status: 'LEFT', role: 'MEMBER' });
  return cm;
}

async function cardQr(cm) {
  return cm?.qrToken ? QRCode.toDataURL(QR_PREFIX + cm.qrToken, { margin: 1, width: 280 }) : null;
}

// Door/table check: is the person holding this card a member of THIS club right now?
async function verifyCard(code, club) {
  const value = String(code || '').trim();
  if (!value) throw new AppError('Enter a member number or scan a member card');
  const where = value.startsWith(QR_PREFIX) ? { qrToken: value.slice(QR_PREFIX.length) } : { memberNumber: value.toUpperCase() };
  const cm = await ClubMember.findOne({ where, include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'studentId', 'isActive', 'collegeId', 'collegeStatus'] }] });
  if (!cm) return { valid: false, reason: 'No member found for this code' };

  const summary = { name: cm.user.name, studentId: cm.user.studentId, memberNumber: cm.memberNumber, role: cm.role };
  if (club && cm.clubId !== club.id) {
    const other = await Club.findByPk(cm.clubId, { attributes: ['name'] });
    return { valid: false, reason: `This card is for ${other?.name || 'another club'}`, member: summary };
  }
  const theClub = club || (await Club.findByPk(cm.clubId));
  if (!cm.user.isActive) return { valid: false, reason: 'Account is disabled', member: summary };
  if (cm.status !== 'ACTIVE') return { valid: false, reason: cm.status === 'REMOVED' ? 'Removed from the club' : cm.status === 'LEFT' ? 'Left the club' : 'Not an active member', member: summary };

  const a = await access.clubAccess(cm.user, theClub);
  if (!a.isMember) return { valid: false, reason: 'Club membership not paid / expired', member: summary };
  return { valid: true, reason: null, member: { ...summary, validUntil: a.dues?.endDate || null } };
}

module.exports = { QR_PREFIX, requestToJoin, decide, addByEmail, changeRole, remove, leave, cardQr, verifyCard, issueCard };
