// Public club & college pages, joining clubs, paying club dues, mailing lists, member cards
const { Op } = require('sequelize');
const { sequelize, College, Club, ClubMember, MembershipPlan, Membership, Announcement, User, Product } = require('../models');
const access = require('../services/access');
const clubMemberService = require('../services/clubMemberService');
const membershipService = require('../services/membershipService');
const paymentService = require('../services/paymentService');
const announcementService = require('../services/announcementService');
const AppError = require('../utils/AppError');

// GET /api/colleges — active colleges (for sign-up and browsing)
async function listColleges(req, res) {
  const colleges = await College.findAll({ where: { status: 'ACTIVE' }, attributes: ['id', 'name', 'code', 'city', 'approveStudents'], order: [['name', 'ASC']] });
  res.json({ colleges });
}

// GET /api/colleges/:collegeId — public college page with its clubs
async function getCollege(req, res) {
  const college = await College.findOne({ where: { id: req.params.collegeId, status: 'ACTIVE' }, attributes: ['id', 'name', 'code', 'city', 'address', 'email', 'phone'] });
  if (!college) throw new AppError('College not found', 404);
  const clubs = await Club.findAll({ where: { collegeId: college.id, status: 'ACTIVE' }, attributes: ['id', 'name', 'code', 'description', 'logoUrl'], order: [['name', 'ASC']] });
  res.json({ college, clubs });
}

// GET /api/clubs?collegeId=&search= — club directory
async function listClubs(req, res) {
  const where = { status: 'ACTIVE' };
  if (req.query.collegeId) where.collegeId = req.query.collegeId;
  if (req.query.search) where.name = { [Op.like]: `%${String(req.query.search).trim()}%` };
  const clubs = await Club.findAll({
    where,
    attributes: ['id', 'name', 'code', 'description', 'logoUrl', 'collegeId'],
    include: [{ model: College, as: 'college', attributes: ['id', 'name', 'code', 'city'], where: { status: 'ACTIVE' } }],
    order: [['name', 'ASC']],
    limit: 200,
  });
  const counts = clubs.length
    ? Object.fromEntries(
        (await ClubMember.findAll({ attributes: ['clubId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], where: { clubId: clubs.map((c) => c.id), status: 'ACTIVE' }, group: ['clubId'], raw: true })).map((r) => [r.clubId, Number(r.n)])
      )
    : {};
  res.json({ clubs: clubs.map((c) => ({ ...c.toJSON(), members: counts[c.id] || 0 })) });
}

// GET /api/clubs/:clubId — public club page; logged-in visitors also get their standing (+ member card)
async function getClub(req, res) {
  const club = await Club.findByPk(req.params.clubId, { include: [{ model: College, as: 'college', attributes: ['id', 'name', 'code', 'city'] }] });
  if (!club || club.status !== 'ACTIVE') throw new AppError('Club not found', 404);

  const [members, managers, plans, news] = await Promise.all([
    ClubMember.count({ where: { clubId: club.id, status: 'ACTIVE' } }),
    ClubMember.findAll({ where: { clubId: club.id, status: 'ACTIVE', role: 'MANAGER' }, include: [{ model: User, as: 'user', attributes: ['name'] }] }),
    MembershipPlan.findAll({ where: { clubId: club.id, isActive: true }, order: [['price', 'ASC']] }),
    Announcement.findAll({ where: { clubId: club.id, status: 'PUBLISHED', audience: 'PUBLIC' }, order: [['pinned', 'DESC'], ['publishedAt', 'DESC']], limit: 5 }),
  ]);

  let me = null;
  if (req.user) {
    const a = await access.clubAccess(req.user, club);
    const membership = await membershipService.getCurrentMembership(req.user.id, club.id);
    const upcoming = await Membership.findOne({ where: { userId: req.user.id, clubId: club.id, status: 'ACTIVE', startDate: { [Op.gt]: new Date() } } });
    me = {
      status: a.status, // null | PENDING | ACTIVE | REJECTED | REMOVED | LEFT
      role: a.role,
      isMember: a.isMember,
      duesRequired: club.requiresDues && a.status === 'ACTIVE' && a.role === 'MEMBER',
      duesOk: a.duesOk,
      can: a.can,
      decisionNote: a.record?.status === 'REJECTED' ? a.record.decisionNote : null,
      memberNumber: a.status === 'ACTIVE' ? a.record.memberNumber : null,
      card: a.status === 'ACTIVE' ? await clubMemberService.cardQr(a.record) : null,
      membership,
      upcoming,
    };
  }
  res.json({ club, members, managers: managers.map((m) => m.user.name), plans, news, me });
}

// POST /api/clubs/:clubId/join { message }
async function join(req, res) {
  const club = await Club.findByPk(req.params.clubId);
  if (!club) throw new AppError('Club not found', 404);
  const cm = await clubMemberService.requestToJoin(req.user, club, req.body.message);
  res.status(201).json({ membership: { status: cm.status }, message: 'Request sent. The club manager will review it.' });
}

// POST /api/clubs/:clubId/leave
async function leave(req, res) {
  const club = await Club.findByPk(req.params.clubId);
  if (!club) throw new AppError('Club not found', 404);
  await clubMemberService.leave(req.user, club);
  res.json({ message: `You left ${club.name}` });
}

// POST /api/clubs/:clubId/dues/checkout { planId } — approved members pay the club's membership plan
async function duesCheckout(req, res) {
  const plan = await MembershipPlan.findOne({ where: { id: req.body.planId, clubId: req.params.clubId } });
  if (!plan) throw new AppError('This membership plan is not available', 404);
  const { membership, payment } = await sequelize.transaction(async (t) => {
    const membership = await membershipService.createPending(req.user.id, plan.id, t);
    const payment = await paymentService.createOnlinePayment(
      { clubId: plan.clubId, userId: req.user.id, amount: membership.planPrice, purpose: 'MEMBERSHIP', referenceId: membership.id },
      t
    );
    await membership.update({ paymentId: payment.id }, { transaction: t });
    return { membership, payment };
  });
  res.status(201).json({ membership, payment });
}

// GET /api/clubs/:clubId/products — the club's shop
async function products(req, res) {
  const { ProductVariant } = require('../models');
  const list = await Product.findAll({
    where: { clubId: req.params.clubId, isActive: true },
    include: [{ model: ProductVariant, as: 'variants', attributes: ['id', 'size', 'stock', 'sortOrder'] }],
    order: [['name', 'ASC'], [{ model: ProductVariant, as: 'variants' }, 'sortOrder', 'ASC']],
  });
  let pricing = { isMember: false, merchDiscountPercent: 0 };
  if (req.user) {
    const club = await Club.findByPk(req.params.clubId);
    const a = await access.clubAccess(req.user, club);
    if (a.isMember) pricing = { isMember: true, merchDiscountPercent: (await membershipService.getBenefits(req.user.id, club.id))?.merchDiscountPercent || 0 };
  }
  res.json({ products: list.map((p) => ({ ...p.toJSON(), inStock: p.variants.some((v) => v.stock > 0) })), pricing });
}

// POST /api/clubs/:clubId/mailing-list { email, name }
async function subscribe(req, res) {
  const club = await Club.findByPk(req.params.clubId);
  if (!club || club.status !== 'ACTIVE') throw new AppError('Club not found', 404);
  await announcementService.subscribe(club, req.body);
  res.status(201).json({ message: `You're on the ${club.name} mailing list!` });
}

// POST /api/mailing-list/unsubscribe { token }
async function unsubscribe(req, res) {
  const sub = await announcementService.unsubscribe(req.body.token);
  res.json({ message: `${sub.email} has been removed from the ${sub.club?.name || 'club'} mailing list.` });
}

// GET /api/clubs/:clubId/verify?code= — club staff check a member card
async function verifyCard(req, res) {
  res.json(await clubMemberService.verifyCard(req.query.code, req.club));
}

module.exports = { listColleges, getCollege, listClubs, getClub, join, leave, duesCheckout, products, subscribe, unsubscribe, verifyCard };
