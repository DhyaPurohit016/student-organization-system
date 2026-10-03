const cron = require('node-cron');
const { Op } = require('sequelize');
const { Payment } = require('../models');
const { expireOld, sendRenewalReminders } = require('../services/membershipService');
const paymentService = require('../services/paymentService');
const { handleCancelled } = require('../services/paymentHandlers');
const ledgerService = require('../services/ledgerService');

async function runMembershipJobs() {
  const expired = await expireOld();
  const reminded = await sendRenewalReminders();
  if (expired || reminded) console.log(`[jobs] memberships expired=${expired} reminders=${reminded}`);
  return { expired, reminded };
}

// Cancels checkouts left unpaid for longer than the hold time, giving back
// held seats and stock (and cancelling the pending membership)
async function releaseStaleCheckouts() {
  const cutoff = new Date(Date.now() - paymentService.HOLD_MINUTES * 60000);
  const stale = await Payment.findAll({ where: { status: 'PENDING', createdAt: { [Op.lt]: cutoff } }, attributes: ['id'] });
  let released = 0;
  for (const { id } of stale) {
    try {
      await paymentService.cancelPayment(id, null, handleCancelled);
      released++;
    } catch {
      /* paid or cancelled in the meantime: nothing to do */
    }
  }
  if (released) console.log(`[jobs] released ${released} unpaid checkout(s)`);
  return released;
}

const safe = (name, fn) => () => fn().catch((err) => console.error(`[jobs] ${name} failed:`, err.message));

// Runs once at startup, then: memberships daily at 09:00, stale checkouts every minute
function scheduleJobs() {
  safe('ledger backfill', async () => {
    const n = await ledgerService.backfill();
    if (n) console.log(`[jobs] added ${n} missing ledger entr${n === 1 ? 'y' : 'ies'}`);
  })();
  safe('memberships', runMembershipJobs)();
  safe('stale checkouts', releaseStaleCheckouts)();
  cron.schedule('0 9 * * *', safe('memberships', runMembershipJobs));
  cron.schedule('* * * * *', safe('stale checkouts', releaseStaleCheckouts));
}

module.exports = { runMembershipJobs, releaseStaleCheckouts, scheduleJobs, scheduleMembershipJobs: scheduleJobs };
