const crypto = require('crypto');
const QRCode = require('qrcode');
const { Op, QueryTypes } = require('sequelize');
const { sequelize, Event, Ticket, Payment, User, Club } = require('../models');
const membershipService = require('./membershipService');
const paymentService = require('./paymentService');
const clubMemberService = require('./clubMemberService');
const access = require('./access');
const { notify } = require('./notificationService');
const { sendEmail } = require('../utils/email');
const AppError = require('../utils/AppError');

const QR_PREFIX = 'SSA-TKT:';
const round2 = (n) => Math.round(n * 100) / 100;
const holdCutoff = () => new Date(Date.now() - paymentService.HOLD_MINUTES * 60000);

// Seats that are sold, or held by someone who is paying right now
function takenWhere(eventId) {
  return {
    eventId,
    [Op.or]: [{ status: 'VALID' }, { status: 'PENDING', createdAt: { [Op.gt]: holdCutoff() } }],
  };
}

async function seatsTaken(eventId, transaction) {
  return Ticket.count({ where: takenWhere(eventId), transaction });
}

// Registration is open while the event is published, the deadline (if any) hasn't passed and it hasn't ended
function salesOpen(event) {
  if (event.status !== 'PUBLISHED') return false;
  const now = new Date();
  if (event.registrationDeadline && now > new Date(event.registrationDeadline)) return false;
  const end = event.endsAt || new Date(new Date(event.startsAt).getTime() + 6 * 3600000);
  return now < end;
}

// Who may register, and what they'd pay.
//   Club member        → member price (fixed, or guest price minus their paid plan's ticket discount); one per event
//   Same-college student → college price (or guest price if none set)
//   Everyone else      → guest price
// Extra tickets for friends are only possible on PUBLIC events, at the guest price.
async function quote(event, user, transaction, club) {
  club = club || (await Club.findByPk(event.clubId, { transaction }));
  const elig = await access.eventEligibility(user, event, club, transaction);
  const benefits = elig.access.isMember ? await membershipService.getBenefits(user.id, club.id, transaction) : null;
  const memberUnit = event.memberPrice ?? round2(event.guestPrice * (1 - (benefits?.ticketDiscountPercent || 0) / 100));
  const collegeUnit = event.collegePrice ?? event.guestPrice;

  let memberTicketUsed = false;
  if (elig.access.isMember) {
    memberTicketUsed = (await Ticket.count({ where: { ...takenWhere(event.id), userId: user.id, priceType: 'MEMBER' }, transaction })) > 0;
  }
  const tier = elig.access.isMember && !memberTicketUsed ? 'MEMBER' : elig.sameCollege ? 'COLLEGE' : 'GUEST';
  const taken = await seatsTaken(event.id, transaction);

  return {
    allowed: elig.allowed,
    reason: elig.reason,
    registrationType: elig.registrationType,
    isMember: elig.access.isMember,
    sameCollege: elig.sameCollege,
    memberEligible: tier === 'MEMBER',
    memberTicketUsed,
    tier,
    memberPrice: memberUnit,
    collegePrice: collegeUnit,
    guestPrice: event.guestPrice,
    yourPrice: tier === 'MEMBER' ? memberUnit : tier === 'COLLEGE' ? collegeUnit : event.guestPrice,
    seatsLeft: Math.max(0, event.capacity - taken),
    salesOpen: salesOpen(event),
    maxPerOrder: event.visibility === 'PUBLIC' ? event.maxPerOrder : 1,
  };
}

function newCode() {
  return `TKT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

// Reserves seats and starts payment. Free events are confirmed straight away.
async function checkout(eventId, user, { quantity = 1, holderNames = [] } = {}) {
  quantity = parseInt(quantity, 10);
  if (!(quantity >= 1)) throw new AppError('Choose at least one ticket');

  return sequelize.transaction(async (t) => {
    // Lock the event row so two buyers can't take the last seat at the same time
    const event = await Event.findByPk(eventId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!event || event.status === 'DRAFT') throw new AppError('Event not found', 404);
    if (event.status === 'CANCELLED') throw new AppError('This event has been cancelled', 409);
    if (event.registrationDeadline && new Date() > new Date(event.registrationDeadline)) throw new AppError('The registration deadline for this event has passed', 409);
    if (!salesOpen(event)) throw new AppError('Registration for this event has closed', 409);

    const club = await Club.findByPk(event.clubId, { transaction: t });
    const q = await quote(event, user, t, club);
    if (!q.allowed) throw new AppError(q.reason, 403);
    if (quantity > q.maxPerOrder) {
      throw new AppError(event.visibility === 'PUBLIC' ? `You can register up to ${event.maxPerOrder} people at once` : 'This is a private event: one registration per person', 400);
    }
    if (q.seatsLeft < quantity) {
      throw new AppError(q.seatsLeft === 0 ? 'Sorry, this event is sold out' : `Only ${q.seatsLeft} seat${q.seatsLeft === 1 ? '' : 's'} left`, 409);
    }

    // Cancel this user's own unfinished checkout for the event, so it doesn't hold seats
    const stale = await Ticket.findAll({ where: { eventId, userId: user.id, status: 'PENDING' }, transaction: t });
    const stalePaymentIds = [...new Set(stale.map((s) => s.paymentId).filter(Boolean))];
    if (stale.length) {
      await Ticket.update({ status: 'CANCELLED' }, { where: { id: stale.map((s) => s.id) }, transaction: t });
      await Payment.update({ status: 'CANCELLED' }, { where: { id: stalePaymentIds, status: 'PENDING' }, transaction: t });
    }

    // Private events: one personal registration, and not twice
    if (event.visibility !== 'PUBLIC' && (await Ticket.count({ where: { eventId, userId: user.id, status: 'VALID' }, transaction: t }))) {
      throw new AppError("You're already registered for this event", 409);
    }

    const rows = Array.from({ length: quantity }, (_, i) => {
      const first = i === 0;
      const priceType = first ? q.tier : 'GUEST';
      return {
        eventId,
        userId: user.id,
        ticketCode: newCode(),
        qrToken: crypto.randomBytes(16).toString('hex'),
        holderName: String(holderNames[i] || '').trim() || (first ? user.name : `${user.name} (guest ${i})`),
        priceType,
        registrationType: first ? q.registrationType : 'GUEST',
        price: priceType === 'MEMBER' ? q.memberPrice : priceType === 'COLLEGE' ? q.collegePrice : q.guestPrice,
        status: 'PENDING',
      };
    });
    const total = round2(rows.reduce((a, r) => a + r.price, 0));

    if (total === 0) {
      rows.forEach((r) => (r.status = 'VALID'));
      const tickets = await Ticket.bulkCreate(rows, { transaction: t });
      await notifyIssued(user, event, tickets, t);
      return { tickets, payment: null, total, free: true };
    }

    const payment = await paymentService.createOnlinePayment(
      { clubId: event.clubId, userId: user.id, amount: total, purpose: 'TICKET', referenceId: event.id },
      t
    );
    rows.forEach((r) => (r.paymentId = payment.id));
    const tickets = await Ticket.bulkCreate(rows, { transaction: t });
    return { tickets, payment, total, free: false };
  });
}

async function notifyIssued(user, event, tickets, t) {
  await notify(
    user.id,
    { title: `Tickets confirmed: ${event.title}`, body: `${tickets.length} ticket${tickets.length === 1 ? '' : 's'} · ${new Date(event.startsAt).toDateString()}`, link: '/tickets' },
    t
  );
  t.afterCommit(() =>
    sendEmail({
      to: user.email,
      subject: `Your tickets for ${event.title}`,
      text: `Hi ${user.name},\n\nYou have ${tickets.length} ticket(s) for ${event.title} at ${event.venue} on ${new Date(event.startsAt).toString()}.\nCodes: ${tickets.map((x) => x.ticketCode).join(', ')}\n\nOpen "My tickets" in your account to show the QR code at the door.`,
    }).catch((err) => console.error('Ticket email failed:', err.message))
  );
}

// Payment succeeded: tickets become valid. The VALID count is re-checked under the event lock,
// so even a late payment can never push the event over capacity.
async function onPaid(payment, t) {
  const event = await Event.findByPk(payment.referenceId, { transaction: t, lock: t.LOCK.UPDATE });
  const tickets = await Ticket.findAll({ where: { paymentId: payment.id }, transaction: t });
  if (tickets.length && tickets.every((x) => x.status === 'VALID')) return { tickets };
  if (!event || event.status === 'CANCELLED') throw new AppError('This event has been cancelled', 409);

  const pending = tickets.filter((x) => x.status === 'PENDING');
  const valid = await Ticket.count({ where: { eventId: event.id, status: 'VALID' }, transaction: t });
  if (valid + pending.length > event.capacity) throw new AppError('Sorry, the event sold out while you were paying. You have not been charged.', 409);

  await Ticket.update({ status: 'VALID' }, { where: { id: pending.map((x) => x.id) }, transaction: t });
  const user = await User.findByPk(payment.userId, { transaction: t });
  await notifyIssued(user, event, pending, t);
  return { tickets: await Ticket.findAll({ where: { paymentId: payment.id }, transaction: t }) };
}

async function onCancelled(payment, t) {
  await Ticket.update({ status: 'CANCELLED' }, { where: { paymentId: payment.id, status: 'PENDING' }, transaction: t });
}

async function qrFor(ticket) {
  return QRCode.toDataURL(QR_PREFIX + ticket.qrToken, { margin: 1, width: 260 });
}

// ---------- Door check-in ----------

// Accepts a scanned ticket QR, a typed ticket code, or a club member card (which it verifies against
// the event's club instead). Callers must already have checked that the staff member may check in here.
async function checkIn(code, { eventId, staffId }) {
  const value = String(code || '').trim();
  if (!value) throw new AppError('Scan a QR code or type a ticket code');
  const scanEvent = await Event.findByPk(eventId);
  if (!scanEvent) throw new AppError('Event not found', 404);

  if (value.startsWith(clubMemberService.QR_PREFIX) || /^[A-Z0-9]{2,12}-[A-Z0-9]{2,10}-\d{4}$/i.test(value)) {
    const club = await Club.findByPk(scanEvent.clubId);
    return { kind: 'MEMBERSHIP', ...(await clubMemberService.verifyCard(value, club)) };
  }

  const where = value.startsWith(QR_PREFIX) ? { qrToken: value.slice(QR_PREFIX.length) } : { ticketCode: value.toUpperCase() };
  const ticket = await Ticket.findOne({
    where,
    include: [
      { model: Event, as: 'event', attributes: ['id', 'title', 'startsAt', 'status'] },
      { model: User, as: 'checkedInBy', attributes: ['id', 'name'] },
    ],
  });
  if (!ticket) return { kind: 'TICKET', ok: false, result: 'NOT_FOUND', message: 'No ticket found for this code' };

  const info = {
    ticketCode: ticket.ticketCode,
    holderName: ticket.holderName,
    priceType: ticket.priceType,
    event: { id: ticket.event.id, title: ticket.event.title, startsAt: ticket.event.startsAt },
  };
  if (eventId && Number(eventId) !== ticket.eventId) {
    return { kind: 'TICKET', ok: false, result: 'WRONG_EVENT', message: `This ticket is for "${ticket.event.title}"`, ticket: info };
  }
  if (ticket.event.status === 'CANCELLED') return { kind: 'TICKET', ok: false, result: 'EVENT_CANCELLED', message: 'This event was cancelled', ticket: info };
  if (ticket.status !== 'VALID') {
    const why = { PENDING: 'This ticket was never paid for', CANCELLED: 'This ticket was cancelled', REFUNDED: 'This ticket was refunded' };
    return { kind: 'TICKET', ok: false, result: ticket.status, message: why[ticket.status], ticket: info };
  }
  if (ticket.checkedInAt) {
    return {
      kind: 'TICKET',
      ok: false,
      result: 'ALREADY_USED',
      message: `Already checked in at ${ticket.checkedInAt.toLocaleTimeString('en-IN')}${ticket.checkedInBy ? ` by ${ticket.checkedInBy.name}` : ''}`,
      ticket: info,
    };
  }

  // Only one scan can win: the update only matches while checkedInAt is still empty
  const [updated] = await Ticket.update(
    { checkedInAt: new Date(), checkedInById: staffId },
    { where: { id: ticket.id, status: 'VALID', checkedInAt: null } }
  );
  if (!updated) return { kind: 'TICKET', ok: false, result: 'ALREADY_USED', message: 'Already checked in', ticket: info };
  return { kind: 'TICKET', ok: true, result: 'CHECKED_IN', message: 'Welcome in!', ticket: info };
}

// ---------- Admin ----------

async function report(eventId) {
  const event = await Event.findByPk(eventId);
  if (!event) throw new AppError('Event not found', 404);

  const [counts] = await sequelize.query(
    `SELECT
       SUM(status = 'VALID') AS sold,
       SUM(status = 'VALID' AND priceType = 'MEMBER') AS memberTickets,
       SUM(status = 'VALID' AND priceType = 'COLLEGE') AS collegeTickets,
       SUM(status = 'VALID' AND priceType = 'GUEST') AS guestTickets,
       SUM(status = 'VALID' AND registrationType = 'CLUB_MEMBER') AS byClubMember,
       SUM(status = 'VALID' AND registrationType = 'COLLEGE_STUDENT') AS byCollegeStudent,
       SUM(status = 'VALID' AND registrationType = 'EXTERNAL_STUDENT') AS byExternalStudent,
       SUM(status = 'VALID' AND registrationType = 'GUEST') AS byGuest,
       SUM(status = 'VALID' AND checkedInAt IS NOT NULL) AS checkedIn,
       SUM(status = 'REFUNDED') AS refunded,
       COALESCE(SUM(CASE WHEN status = 'VALID' THEN price END), 0) AS ticketRevenue
     FROM tickets WHERE eventId = :eventId`,
    { replacements: { eventId: event.id }, type: QueryTypes.SELECT }
  );
  const [money] = await sequelize.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount END), 0) AS expense
     FROM ledger_entries WHERE eventId = :eventId`,
    { replacements: { eventId: event.id }, type: QueryTypes.SELECT }
  );

  const n = (v) => Number(v || 0);
  const sold = n(counts.sold);
  const checkedIn = n(counts.checkedIn);
  const ended = new Date() > (event.endsAt || event.startsAt);
  const income = n(money.income);
  const expense = n(money.expense);

  const recentCheckIns = await Ticket.findAll({
    where: { eventId: event.id, checkedInAt: { [Op.ne]: null } },
    order: [['checkedInAt', 'DESC']],
    limit: 10,
    attributes: ['id', 'ticketCode', 'holderName', 'priceType', 'registrationType', 'checkedInAt'],
  });

  return {
    event,
    capacity: event.capacity,
    sold,
    seatsLeft: Math.max(0, event.capacity - (await seatsTaken(event.id))),
    memberTickets: n(counts.memberTickets),
    collegeTickets: n(counts.collegeTickets),
    guestTickets: n(counts.guestTickets),
    // Who registered (the table from the design: club member / same college / other college / guest)
    byRegistrationType: {
      CLUB_MEMBER: n(counts.byClubMember),
      COLLEGE_STUDENT: n(counts.byCollegeStudent),
      EXTERNAL_STUDENT: n(counts.byExternalStudent),
      GUEST: n(counts.byGuest),
    },
    checkedIn,
    notArrived: sold - checkedIn,
    attendanceRate: sold ? Math.round((checkedIn / sold) * 100) : 0,
    ended,
    refunded: n(counts.refunded),
    ticketRevenue: n(counts.ticketRevenue),
    income, // ticket payments minus nothing: refunds are in expense
    expense, // refunds + costs linked to this event
    profit: Math.round((income - expense) * 100) / 100,
    recentCheckIns,
  };
}

// Cancels one paid ticket and refunds its price
async function refundTicket(ticketId, adminId) {
  return sequelize.transaction(async (t) => {
    const ticket = await Ticket.findByPk(ticketId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!ticket) throw new AppError('Ticket not found', 404);
    if (ticket.status !== 'VALID') throw new AppError('Only valid tickets can be refunded', 409);
    if (ticket.checkedInAt) throw new AppError('This ticket has already been used', 409);

    await ticket.update({ status: 'REFUNDED' }, { transaction: t });
    if (ticket.paymentId && ticket.price > 0) {
      const payment = await Payment.findByPk(ticket.paymentId, { transaction: t, lock: t.LOCK.UPDATE });
      const remaining = await Ticket.count({ where: { paymentId: payment.id, status: 'VALID' }, transaction: t });
      await paymentService.refund(
        payment,
        { amount: ticket.price, key: `ticket:${ticket.id}`, description: `Ticket refund ${ticket.ticketCode} (${ticket.holderName})`, eventId: ticket.eventId, recordedById: adminId, full: remaining === 0 },
        t
      );
    }
    await notify(ticket.userId, { title: 'Ticket refunded', body: `Ticket ${ticket.ticketCode} was cancelled and ₹${ticket.price} refunded.`, link: '/tickets' }, t);
    return ticket;
  });
}

// Cancels the event: every paid ticket is refunded and holders are notified
async function cancelEvent(eventId, adminId) {
  return sequelize.transaction(async (t) => {
    const event = await Event.findByPk(eventId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!event) throw new AppError('Event not found', 404);
    if (event.status === 'CANCELLED') throw new AppError('Event is already cancelled', 409);

    await event.update({ status: 'CANCELLED' }, { transaction: t });
    const valid = await Ticket.findAll({ where: { eventId, status: 'VALID' }, transaction: t });
    const pending = await Ticket.findAll({ where: { eventId, status: 'PENDING' }, transaction: t });

    await Ticket.update({ status: 'CANCELLED' }, { where: { eventId, status: 'PENDING' }, transaction: t });
    const pendingPayments = [...new Set(pending.map((x) => x.paymentId).filter(Boolean))];
    if (pendingPayments.length) await Payment.update({ status: 'CANCELLED' }, { where: { id: pendingPayments, status: 'PENDING' }, transaction: t });

    // Refund per payment, so a 3-ticket order gets one refund entry
    const byPayment = {};
    for (const ticket of valid) (byPayment[ticket.paymentId || 'free'] ||= []).push(ticket);
    await Ticket.update({ status: 'REFUNDED' }, { where: { eventId, status: 'VALID' }, transaction: t });

    let refundedAmount = 0;
    for (const [paymentId, tickets] of Object.entries(byPayment)) {
      if (paymentId === 'free') continue;
      const payment = await Payment.findByPk(paymentId, { transaction: t });
      const amount = Math.round(tickets.reduce((a, x) => a + x.price, 0) * 100) / 100;
      refundedAmount += amount;
      await paymentService.refund(
        payment,
        { amount, key: `event-cancel:${eventId}:payment:${paymentId}`, description: `Refund: "${event.title}" cancelled`, eventId: event.id, recordedById: adminId, full: true },
        t
      );
    }

    await notify(
      [...new Set(valid.map((x) => x.userId))],
      { title: `Event cancelled: ${event.title}`, body: 'Your tickets have been refunded in full.', link: '/tickets' },
      t
    );
    return { event, refundedTickets: valid.length, refundedAmount: Math.round(refundedAmount * 100) / 100 };
  });
}

module.exports = { QR_PREFIX, seatsTaken, salesOpen, quote, checkout, onPaid, onCancelled, qrFor, checkIn, report, refundTicket, cancelEvent, holdCutoff };
