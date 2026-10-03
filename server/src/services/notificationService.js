const { Notification } = require('../models');

// Creates in-app notifications for one or many users.
// Pass a transaction to make them part of a larger change (they vanish if it rolls back).
async function notify(userIds, { title, body, link }, transaction) {
  const ids = [...new Set([].concat(userIds).filter(Boolean))];
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 500) {
    await Notification.bulkCreate(
      ids.slice(i, i + 500).map((userId) => ({ userId, title, body, link })),
      { transaction }
    );
  }
}

module.exports = { notify };
