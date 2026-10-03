// Club membership DUES (paid plans). Only used by clubs that switch on "requires dues", or that
// sell plans with perks. You must already be an approved member of the club to pay.
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize, Membership, MembershipPlan, User, Club, ClubMember, College, Counter } = require('../models');
const AppError = require('../utils/AppError');
const { sendEmail } = require('../utils/email');
const { notify } = require('./notificationService');

const REMINDER_DAYS = [30, 7, 1];

const inTransaction = (transaction, fn) => (transaction ? fn(transaction) : sequelize.transaction(fn));

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Validity window for a plan bought now. If the member still has time left (or an already-paid
// renewal), the new period starts when that ends.
async function computePeriod(userId, clubId, plan, transaction) {
  const latest = await Membership.findOne({
    where: { userId, clubId, status: 'ACTIVE', endDate: { [Op.gt]: new Date() } },
    order: [['endDate', 'DESC']],
    transaction,
  });
  const start = latest ? new Date(latest.endDate) : new Date();
  let end;
  if (plan.durationType === 'YEAR_END') {
    end = new Date(start.getFullYear(), 11, 31, 23, 59, 59, 999);
    if (end - start < 31 * 86400000) end = new Date(start.getFullYear() + 1, 11, 31, 23, 59, 59, 999);
  } else {
    end = addMonths(start, plan.durationMonths);
  }
  return { startDate: start, endDate: end };
}

async function getCurrentMembership(userId, clubId, transaction) {
  const now = new Date();
  return Membership.findOne({
    where: { userId, clubId, status: 'ACTIVE', startDate: { [Op.lte]: now }, endDate: { [Op.gt]: now } },
    order: [['endDate', 'DESC']],
    transaction,
  });
}

// Discounts from the member's current paid plan in this club (none if no plan)
async function getBenefits(userId, clubId, transaction) {
  const m = await getCurrentMembership(userId, clubId, transaction);
  return m ? m.planSnapshot.benefits : null;
}

// Creates a PENDING membership for a plan; it becomes ACTIVE once paid
async function createPending(userId, planId, transaction) {
  const plan = await MembershipPlan.findByPk(planId, { transaction });
  if (!plan || !plan.isActive) throw new AppError('This membership plan is not available', 404);
  const user = await User.findByPk(userId, { transaction });
  if (!user || !user.isActive) throw new AppError('User not found or disabled', 404);
  const cm = await ClubMember.findOne({ where: { clubId: plan.clubId, userId }, transaction });
  if (cm?.status !== 'ACTIVE') throw new AppError('Join the club first: membership plans are for approved members', 403);

  await Membership.update({ status: 'CANCELLED' }, { where: { userId, clubId: plan.clubId, status: 'PENDING' }, transaction });
  return Membership.create(
    {
      clubId: plan.clubId,
      userId,
      planId: plan.id,
      planName: plan.name,
      planPrice: plan.price,
      ticketDiscountPercent: plan.ticketDiscountPercent,
      merchDiscountPercent: plan.merchDiscountPercent,
      perks: plan.perks,
      remindersSent: [],
      status: 'PENDING',
    },
    { transaction }
  );
}

// Called once payment succeeds. Safe to call twice.
async function activate(membershipId, paymentId, transaction) {
  return inTransaction(transaction, async (t) => {
    const membership = await Membership.findByPk(membershipId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!membership) throw new AppError('Membership not found', 404);
    if (membership.status === 'ACTIVE') return membership;
    if (membership.status !== 'PENDING') throw new AppError(`Membership is ${membership.status.toLowerCase()}`, 409);

    const plan = await MembershipPlan.findByPk(membership.planId, { transaction: t });
    const club = await Club.findByPk(membership.clubId, { transaction: t });
    const college = await College.findByPk(club.collegeId, { transaction: t });
    const { startDate, endDate } = await computePeriod(membership.userId, membership.clubId, plan, t);
    const year = startDate.getFullYear();
    const seq = await Counter.next(`dues-${club.id}-${year}`, t);

    await membership.update(
      {
        status: 'ACTIVE',
        startDate,
        endDate,
        paymentId,
        membershipNumber: `${college.code}-${club.code}-${year}-${String(seq).padStart(4, '0')}`,
        qrToken: crypto.randomBytes(16).toString('hex'),
        remindersSent: [],
      },
      { transaction: t }
    );

    await notify(
      membership.userId,
      { title: `${club.name}: membership active`, body: `${membership.planName}, valid until ${endDate.toDateString()}.`, link: `/clubs/${club.id}` },
      t
    );
    const user = await User.findByPk(membership.userId, { transaction: t });
    t.afterCommit(() =>
      sendEmail({
        to: user.email,
        subject: `${club.name}: your membership is active`,
        text: `Hi ${user.name},\n\nYour ${membership.planName} membership of ${club.name} is active until ${endDate.toDateString()}.`,
      }).catch((err) => console.error('Membership email failed:', err.message))
    );
    return membership;
  });
}

async function expireOld() {
  const [count] = await Membership.update({ status: 'EXPIRED' }, { where: { status: 'ACTIVE', endDate: { [Op.lte]: new Date() } } });
  return count;
}

// Emails members whose dues end in 30, 7 or 1 days (once per threshold; skipped if already renewed)
async function sendRenewalReminders() {
  const now = new Date();
  const horizon = new Date(now.getTime() + REMINDER_DAYS[0] * 86400000);
  const expiring = await Membership.findAll({
    where: { status: 'ACTIVE', endDate: { [Op.gt]: now, [Op.lte]: horizon } },
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'isActive'] },
      { model: Club, as: 'club', attributes: ['id', 'name'] },
    ],
  });

  let sent = 0;
  for (const m of expiring) {
    if (!m.user?.isActive) continue;
    const renewed = await Membership.count({ where: { userId: m.userId, clubId: m.clubId, status: 'ACTIVE', startDate: { [Op.gte]: m.endDate } } });
    if (renewed) continue;
    const daysLeft = Math.ceil((m.endDate - now) / 86400000);
    const already = m.remindersSent;
    const due = REMINDER_DAYS.filter((d) => daysLeft <= d && !already.includes(d));
    if (!due.length) continue;

    await sendEmail({
      to: m.user.email,
      subject: `${m.club.name}: membership expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
      text: `Hi ${m.user.name},\n\nYour ${m.planName} membership of ${m.club.name} ends on ${m.endDate.toDateString()}. Renew to keep your member benefits.`,
    });
    await notify(m.userId, { title: `${m.club.name}: membership expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, body: 'Renew to keep your member benefits.', link: `/clubs/${m.clubId}` });
    await m.update({ remindersSent: [...already, ...due] });
    sent++;
  }
  return sent;
}

module.exports = { REMINDER_DAYS, inTransaction, computePeriod, getCurrentMembership, getBenefits, createPending, activate, expireOld, sendRenewalReminders };
