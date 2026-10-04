// Events: PUBLIC / COLLEGE / CLUB visibility, who may register (the design's access table),
// price tiers, private-event rules, deadlines, event volunteers and door check-in permissions
const { db, call, check, makeWorld, makeClub, addToClub, student, pay, inDays, run, TAG } = require('./helpers');

run('Events', async () => {
  const w = await makeWorld();
  const { club, manager, member, collegeStudent, external, pending, guest, volunteer, treasurer, A } = w;
  const base = { venue: 'Main Hall', startsAt: inDays(5), endsAt: inDays(5, 22), capacity: 50, guestPrice: 300, collegePrice: 150, memberPrice: 100, status: 'PUBLISHED' };
  const mk = async (title, extra) => {
    const [s, j] = await call('POST', `/clubs/${club.id}/manage/events`, { title: `${TAG} ${title}`, ...base, ...extra }, manager.token);
    if (s !== 201) throw new Error(JSON.stringify(j));
    return j.event;
  };

  // --- Only the club's manager (or College Head) creates events
  let [s, j] = await call('POST', `/clubs/${club.id}/manage/events`, { title: 'x', ...base }, member.token);
  check('members cannot create events (403)', s === 403);
  [s] = await call('POST', `/clubs/${club.id}/manage/events`, { title: 'x', ...base }, volunteer.token);
  check('volunteers cannot create events (403)', s === 403);
  [s] = await call('POST', `/clubs/${club.id}/manage/events`, { title: 'x', ...base, visibility: 'SECRET' }, manager.token);
  check('invalid visibility rejected', s === 400);

  const hack = await mk('Open Hackathon', { visibility: 'PUBLIC' });
  const internal = await mk('Internal Coding Competition', { visibility: 'COLLEGE' });
  const meetup = await mk('Members Meetup', { visibility: 'CLUB', guestPrice: 0, collegePrice: null, memberPrice: null });
  check('manager creates public, college-only and club-only events', hack.collegeId === A.college.id && internal.visibility === 'COLLEGE' && meetup.visibility === 'CLUB');
  const [, otherHeadClub] = [null, await makeClub(A.college, A.head, 'Chess')];
  [s] = await call('POST', `/clubs/${club.id}/manage/events`, { title: 'x', ...base }, otherHeadClub.manager.token);
  check("another club's manager can't create events here (403)", s === 403);
  [s] = await call('POST', `/clubs/${club.id}/manage/events`, { title: `${TAG} Head event`, ...base }, A.head.token);
  check('the College Head views events but does not create them (403)', s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/events`, null, A.head.token);
  check('the College Head can list the club\'s events', s === 200 && j.events.length >= 3);

  // --- The access table: who may register for what
  const people = { member, collegeStudent, external, pending, guest };
  const expect = {
    PUBLIC: { member: true, collegeStudent: true, external: true, pending: true, guest: true },
    COLLEGE: { member: true, collegeStudent: true, external: false, pending: false, guest: false },
    CLUB: { member: true, collegeStudent: false, external: false, pending: false, guest: false },
  };
  const events = { PUBLIC: hack, COLLEGE: internal, CLUB: meetup };
  for (const [vis, ev] of Object.entries(events)) {
    const got = {};
    for (const [who, u] of Object.entries(people)) {
      const [qs, q] = await call('GET', `/events/${ev.id}/quote`, null, u.token);
      got[who] = qs === 200 && q.quote.allowed;
    }
    check(`${vis} event: who may register`, JSON.stringify(got) === JSON.stringify(expect[vis]), got);
  }

  // Private events are hidden from people who can't attend (filtered to this club so a big database doesn't page them out)
  [s, j] = await call('GET', `/events?clubId=${club.id}`, null, external.token);
  check('other-college student sees the public event only', j.events.some((e) => e.id === hack.id) && !j.events.some((e) => e.id === internal.id || e.id === meetup.id));
  [s, j] = await call('GET', `/events?clubId=${club.id}`);
  check('logged-out visitors see public events only', j.events.some((e) => e.id === hack.id) && !j.events.some((e) => e.id === internal.id));
  [s, j] = await call('GET', `/events?clubId=${club.id}`, null, collegeStudent.token);
  check('same-college student sees college events but not club-only ones', j.events.some((e) => e.id === internal.id) && !j.events.some((e) => e.id === meetup.id));
  [s, j] = await call('GET', `/events?clubId=${club.id}`, null, member.token);
  check('club member sees all three', [hack, internal, meetup].every((ev) => j.events.some((e) => e.id === ev.id)));
  [s] = await call('GET', `/events/${internal.id}`, null, external.token);
  check('private event page → 404 for outsiders', s === 404);
  [s, j] = await call('GET', `/events/${internal.id}/quote`, null, pending.token);
  check('pending student is told why', j.quote.allowed === false && /waiting for approval/.test(j.quote.reason), j.quote);

  // --- Price tiers
  const price = async (u, ev) => (await call('GET', `/events/${ev.id}/quote`, null, u.token))[1].quote;
  const qm = await price(member, hack);
  const qc = await price(collegeStudent, hack);
  const qe = await price(external, hack);
  const qg = await price(guest, hack);
  check('club member pays member price (₹100)', qm.tier === 'MEMBER' && qm.yourPrice === 100 && qm.registrationType === 'CLUB_MEMBER');
  check('same-college student pays college price (₹150)', qc.tier === 'COLLEGE' && qc.yourPrice === 150 && qc.registrationType === 'COLLEGE_STUDENT');
  check('other-college student pays guest price (₹300)', qe.tier === 'GUEST' && qe.yourPrice === 300 && qe.registrationType === 'EXTERNAL_STUDENT');
  check('guest pays guest price (₹300)', qg.yourPrice === 300 && qg.registrationType === 'GUEST');

  // --- Registering
  [s, j] = await call('POST', `/events/${internal.id}/checkout`, { quantity: 1 }, external.token);
  check('outsider cannot register for a college event (403)', s === 403);
  [s, j] = await call('POST', `/events/${internal.id}/checkout`, { quantity: 2 }, collegeStudent.token);
  check('private events: one registration per person', s === 400 && /one registration/.test(j.message), j);
  [s, j] = await call('POST', `/events/${internal.id}/checkout`, { quantity: 1 }, collegeStudent.token);
  check('same-college student registers (college price)', s === 201 && j.total === 150 && j.tickets[0].registrationType === 'COLLEGE_STUDENT');
  await pay(j.payment.id, collegeStudent.token);
  [s] = await call('POST', `/events/${internal.id}/checkout`, { quantity: 1 }, collegeStudent.token);
  check('can’t register twice for a private event', s === 409);
  [s, j] = await call('POST', `/events/${meetup.id}/checkout`, { quantity: 1 }, member.token);
  check('club-only free event: member registered instantly', s === 201 && j.free && j.tickets[0].status === 'VALID');

  [s, j] = await call('POST', `/events/${hack.id}/checkout`, { quantity: 3 }, member.token);
  check('public event: member brings 2 friends → 100 + 300 + 300', s === 201 && j.total === 700, j);
  await pay(j.payment.id, member.token);
  [s, j] = await call('POST', `/events/${hack.id}/checkout`, { quantity: 1 }, external.token);
  check('other-college student registers for the public event', s === 201 && j.tickets[0].registrationType === 'EXTERNAL_STUDENT');
  await pay(j.payment.id, external.token);
  [s, j] = await call('POST', `/events/${hack.id}/checkout`, { quantity: 1 }, guest.token);
  await pay(j.payment.id, guest.token);

  // --- Deadline
  const late = await mk('Closed Registration', { registrationDeadline: new Date(Date.now() - 3600000).toISOString() });
  [s, j] = await call('POST', `/events/${late.id}/checkout`, { quantity: 1 }, member.token);
  check('registration deadline passed → refused', s === 409 && /deadline/.test(j.message));
  [s, j] = await call('GET', `/events/${late.id}`);
  check('…and shown as closed', j.event.salesOpen === false);

  // --- Can't make an event more private after people registered
  [s] = await call('PATCH', `/clubs/${club.id}/manage/events/${hack.id}`, { visibility: 'CLUB' }, manager.token);
  check("can't restrict an event that already has registrations", s === 400);
  [s] = await call('PATCH', `/clubs/${club.id}/manage/events/${internal.id}`, { visibility: 'PUBLIC' }, manager.token);
  check('can open an event up to more people', s === 200);

  // --- Event volunteers and door check-in permissions
  [s] = await call('POST', `/clubs/${club.id}/manage/events/${hack.id}/volunteers`, { userId: member.id, duty: 'Registration' }, manager.token);
  check('plain members cannot be event volunteers', s === 400);
  [s, j] = await call('POST', `/clubs/${club.id}/manage/events/${hack.id}/volunteers`, { userId: volunteer.id, duty: 'Food' }, manager.token);
  check('assign a club volunteer to the event (food duty)', s === 201 && j.volunteer.canCheckIn === false);
  [s, j] = await call('GET', '/me/volunteering', null, volunteer.token);
  check('volunteer sees their assignment', j.assignments.some((a) => a.eventId === hack.id && a.duty === 'Food'));

  const ticket = await db.Ticket.findOne({ where: { eventId: hack.id, userId: guest.id } });
  [s] = await call('POST', '/checkin', { eventId: hack.id, code: ticket.ticketCode }, volunteer.token);
  check('volunteer without check-in rights is refused (403)', s === 403);
  [s] = await call('POST', '/checkin', { eventId: hack.id, code: ticket.ticketCode }, treasurer.token);
  check('treasurer not on the check-in team is refused (403)', s === 403);
  await call('POST', `/clubs/${club.id}/manage/events/${hack.id}/volunteers`, { userId: volunteer.id, duty: 'Registration', canCheckIn: true }, manager.token);
  [s, j] = await call('GET', '/checkin/events', null, volunteer.token);
  check('volunteer with rights sees the event on the scanner', j.events.some((e) => e.id === hack.id) && !j.events.some((e) => e.id === internal.id));
  [s, j] = await call('POST', '/checkin', { eventId: hack.id, code: `SSA-TKT:${ticket.qrToken}` }, volunteer.token);
  check('volunteer checks the guest in', j.ok && j.result === 'CHECKED_IN', j);
  [s, j] = await call('POST', '/checkin', { eventId: hack.id, code: ticket.ticketCode }, volunteer.token);
  check('second scan → already used', !j.ok && j.result === 'ALREADY_USED');
  const cs = await db.Ticket.findOne({ where: { eventId: internal.id, userId: collegeStudent.id } });
  [s, j] = await call('POST', '/checkin', { eventId: hack.id, code: cs.ticketCode }, manager.token);
  check('ticket for another event → wrong event', !j.ok && j.result === 'WRONG_EVENT');
  const card = await db.ClubMember.findOne({ where: { clubId: club.id, userId: member.id } });
  [s, j] = await call('POST', '/checkin', { eventId: hack.id, code: card.memberNumber }, manager.token);
  check("scanning a club member's card verifies membership", j.kind === 'MEMBERSHIP' && j.valid);
  const otherCard = await db.ClubMember.findOne({ where: { clubId: otherHeadClub.club.id, userId: otherHeadClub.manager.id } });
  [s, j] = await call('POST', '/checkin', { eventId: hack.id, code: otherCard.memberNumber }, manager.token);
  check("another club's card is not valid here", j.kind === 'MEMBERSHIP' && j.valid === false && /another club|is for/.test(j.reason), j);
  [s] = await call('POST', '/checkin', { eventId: hack.id, code: ticket.ticketCode }, otherHeadClub.manager.token);
  check("another club's manager can't check in here (403)", s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/events/${hack.id}/report`, null, A.head.token);
  check('College Head can see the event report', s === 200);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/participants?eventId=${hack.id}`, null, A.head.token);
  check('College Head sees participants with arrival', s === 200 && j.participants.some((p) => p.checkedInAt));

  // --- Report: who registered
  [s, j] = await call('GET', `/clubs/${club.id}/manage/events/${hack.id}/report`, null, manager.token);
  check('report: by registration type (member, external, guests)', j.byRegistrationType.CLUB_MEMBER === 1 && j.byRegistrationType.EXTERNAL_STUDENT === 1 && j.byRegistrationType.GUEST === 3, j.byRegistrationType);
  check('report: income ₹1000 (700 + 300 … + 300 guest)', j.income === 1300 && j.sold === 5, { income: j.income, sold: j.sold });
  [s, j] = await call('GET', `/clubs/${club.id}/manage/events/${hack.id}/tickets?type=EXTERNAL_STUDENT`, null, manager.token);
  check('ticket list filter by registration type, with college', j.tickets.length === 1 && j.tickets[0].buyer.college?.id === w.B.college.id);
  [s] = await call('GET', `/clubs/${club.id}/manage/events/${hack.id}/report`, null, volunteer.token);
  check('volunteers cannot open the event report (403)', s === 403);

  // --- Refund & cancel (club-scoped)
  const extTicket = await db.Ticket.findOne({ where: { eventId: hack.id, userId: external.id } });
  [s] = await call('POST', `/clubs/${otherHeadClub.club.id}/manage/tickets/${extTicket.id}/refund`, {}, otherHeadClub.manager.token);
  check("can't refund another club's ticket", s === 404);
  [s, j] = await call('POST', `/clubs/${club.id}/manage/tickets/${extTicket.id}/refund`, {}, manager.token);
  check('manager refunds a ticket', j.ticket?.status === 'REFUNDED');
  [s, j] = await call('POST', `/clubs/${club.id}/manage/events/${internal.id}/cancel`, {}, manager.token);
  check('cancel event refunds its tickets', j.refundedTickets === 1 && j.refundedAmount === 150, j);

  // --- College Head overview
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage/events`, null, A.head.token);
  check("College Head sees every club's events", j.events.some((e) => e.id === hack.id && e.club.id === club.id) && j.events.some((e) => e.id === internal.id));
  void student;
  void addToClub;
});
