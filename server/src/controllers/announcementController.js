const { Announcement, Subscriber, User, Club, College, ClubMember } = require('../models');
const service = require('../services/announcementService');
const AppError = require('../utils/AppError');

const INCLUDE = [
  { model: User, as: 'author', attributes: ['id', 'name'] },
  { model: Club, as: 'club', attributes: ['id', 'name'] },
  { model: College, as: 'college', attributes: ['id', 'name', 'code'] },
];
const ORDER = [['pinned', 'DESC'], ['publishedAt', 'DESC']];

// GET /api/announcements?clubId=&collegeId= — public posts (website)
async function listPublic(req, res) {
  const where = { status: 'PUBLISHED', audience: 'PUBLIC' };
  if (req.query.clubId) where.clubId = req.query.clubId;
  if (req.query.collegeId) where.collegeId = req.query.collegeId;
  const announcements = await Announcement.findAll({ where, include: INCLUDE, order: ORDER, limit: Math.min(100, parseInt(req.query.limit, 10) || 50) });
  res.json({ announcements });
}

// GET /api/announcements/feed — everything this user may see, across their college and clubs
async function feed(req, res) {
  const where = { status: 'PUBLISHED', ...(await service.visibilityWhere(req.user)) };
  if (req.query.clubId) where.clubId = req.query.clubId;
  const announcements = await Announcement.findAll({ where, include: INCLUDE, order: ORDER, limit: 100 });
  res.json({ announcements });
}

// ---------- Club manager (req.club) ----------

const clubPost = async (req) => {
  const a = await Announcement.findOne({ where: { id: req.params.announcementId, clubId: req.club.id } });
  if (!a) throw new AppError('Announcement not found', 404);
  return a;
};

async function adminList(req, res) {
  const announcements = await Announcement.findAll({
    where: { clubId: req.club.id },
    include: INCLUDE,
    order: [['status', 'ASC'], ['pinned', 'DESC'], ['publishedAt', 'DESC'], ['updatedAt', 'DESC']],
  });
  res.json({ announcements });
}

const pick = (b) => Object.fromEntries(['title', 'body', 'audience', 'pinned'].filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));

async function create(req, res) {
  const fields = pick(req.body);
  if (fields.audience && !Announcement.AUDIENCES.includes(fields.audience)) throw new AppError('Invalid audience');
  const a = await Announcement.create({ ...fields, clubId: req.club.id, collegeId: req.club.collegeId, authorId: req.user.id });
  if (req.body.publish) await service.publish(a, { sendEmail: req.body.sendEmail });
  res.status(201).json({ announcement: await a.reload() });
}

async function update(req, res) {
  const a = await clubPost(req);
  const changes = pick(req.body);
  if (a.status === 'PUBLISHED') delete changes.audience; // the notifications/emails are already out
  await a.update(changes);
  res.json({ announcement: a });
}

async function publish(req, res) {
  res.json({ announcement: await service.publish(await clubPost(req), { sendEmail: req.body.sendEmail }) });
}

async function remove(req, res) {
  await (await clubPost(req)).destroy();
  res.json({ message: 'Announcement deleted' });
}

// GET /api/clubs/:clubId/manage/subscribers
async function subscribers(req, res) {
  const [list, members] = await Promise.all([
    Subscriber.findAll({ where: { clubId: req.club.id }, order: [['createdAt', 'DESC']], attributes: { exclude: ['unsubscribeToken'] } }),
    ClubMember.count({ where: { clubId: req.club.id, status: 'ACTIVE' } }),
  ]);
  res.json({ subscribers: list, active: list.filter((s) => s.isSubscribed).length, members });
}

module.exports = { listPublic, feed, adminList, create, update, publish, remove, subscribers };
