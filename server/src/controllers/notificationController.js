const { Notification } = require('../models');

// GET /api/notifications — latest 30 and the unread count
async function list(req, res) {
  const [notifications, unread] = await Promise.all([
    Notification.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 30 }),
    Notification.count({ where: { userId: req.user.id, readAt: null } }),
  ]);
  res.json({ notifications, unread });
}

// POST /api/notifications/read-all
async function readAll(req, res) {
  await Notification.update({ readAt: new Date() }, { where: { userId: req.user.id, readAt: null } });
  res.json({ unread: 0 });
}

// POST /api/notifications/:id/read
async function readOne(req, res) {
  await Notification.update({ readAt: new Date() }, { where: { id: req.params.id, userId: req.user.id, readAt: null } });
  res.json({ ok: true });
}

module.exports = { list, readAll, readOne };
