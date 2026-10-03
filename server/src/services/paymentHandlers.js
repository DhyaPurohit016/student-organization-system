const { Membership } = require('../models');
const membershipService = require('./membershipService');
const ticketService = require('./ticketService');
const shopService = require('./shopService');

// What happens when a payment for each purpose is paid or cancelled.
// Each handler runs inside the payment's database transaction.
const onPaid = {
  MEMBERSHIP: (payment, t) => membershipService.activate(payment.referenceId, payment.id, t),
  TICKET: (payment, t) => ticketService.onPaid(payment, t),
  MERCH: (payment, t) => shopService.onPaid(payment, t),
};

const onCancelled = {
  MEMBERSHIP: (payment, t) =>
    Membership.update({ status: 'CANCELLED' }, { where: { id: payment.referenceId, status: 'PENDING' }, transaction: t }),
  TICKET: (payment, t) => ticketService.onCancelled(payment, t),
  MERCH: (payment, t) => shopService.onCancelled(payment, t),
};

const handlePaid = (payment, t) => (onPaid[payment.purpose] ? onPaid[payment.purpose](payment, t) : null);
const handleCancelled = (payment, t) => (onCancelled[payment.purpose] ? onCancelled[payment.purpose](payment, t) : null);

module.exports = { handlePaid, handleCancelled };
