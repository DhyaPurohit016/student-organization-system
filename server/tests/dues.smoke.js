// Club membership dues: per-club plans, "requires dues", paying online / in person, renewals,
// expiry & reminders, and isolation between clubs
const { db, call, check, makeWorld, makeClub, addToClub, student, signup, pay, inDays, run, TAG } = require('./helpers');

run('Dues', async () => {
  const w = await makeWorld();
  const { club, manager, treasurer, member, collegeStudent, A } = w;

  // --- Plans belong to a club
  let [s, j] = await call('POST', `/clubs/${club.id}/manage/plans`, { name: 'Annual', price: 500, durationType: 'YEAR_END', benefits: { ticketDiscountPercent: 20, merchDiscountPercent: 10 } }, manager.token);
  check('manager creates a club plan', s === 201 && j.plan.clubId === club.id);
  const annual = j.plan;
  [s] = await call('POST', `/clubs/${club.id}/manage/plans`, { name: 'Annual', price: 1 }, manager.token);
  check('plan names unique within a club', s === 409);
  const { club: other, manager: otherMgr } = await makeClub(A.college, A.head, 'Music');
  [s] = await call('POST', `/clubs/${other.id}/manage/plans`, { name: 'Annual', price: 300 }, otherMgr.token);
  check('…but another club can use the same name', s === 201);
  [s] = await call('POST', `/clubs/${club.id}/manage/plans`, { name: 'Hack', price: 0 }, treasurer.token);
  check('treasurer cannot create plans (403)', s === 403);

  // --- Paying requires being an approved member
  [s, j] = await call('POST', `/clubs/${club.id}/dues/checkout`, { planId: annual.id }, collegeStudent.token);
  check("non-members can't pay dues (join first)", s === 403 && /Join the club/.test(j.message));
  [s] = await call('POST', `/clubs/${other.id}/dues/checkout`, { planId: annual.id }, member.token);
  check("can't buy one club's plan through another club", s === 404);

  // --- Dues optional: members count without paying
  [s, j] = await call('GET', `/clubs/${club.id}`, null, member.token);
  check('requiresDues OFF: approved member is a member without paying', j.me.isMember && !j.me.duesRequired);

  // --- Switch dues ON
  [s] = await call('PATCH', `/clubs/${other.id}/manage/settings`, { requiresDues: true }, otherMgr.token);
  check('requires dues can be switched on once a plan exists', s === 200);
  const { club: emptyClub, manager: emptyMgr } = await makeClub(A.college, A.head, 'Empty');
  [s] = await call('PATCH', `/clubs/${emptyClub.id}/manage/settings`, { requiresDues: true }, emptyMgr.token);
  check('…but not without any plan', s === 400);
  [s] = await call('PATCH', `/clubs/${club.id}/manage/settings`, { requiresDues: true }, manager.token);
  [s, j] = await call('GET', `/clubs/${club.id}`, null, member.token);
  check('requiresDues ON: unpaid member is no longer counted as a member', !j.me.isMember && j.me.duesRequired && j.me.status === 'ACTIVE');
  [s, j] = await call('GET', `/clubs/${club.id}`, null, treasurer.token);
  check('club staff never need dues', j.me.isMember);

  // Club-only events need paid dues
  const [, ev] = await call('POST', `/clubs/${club.id}/manage/events`, { title: `${TAG} Members night`, venue: 'Lab', startsAt: inDays(6), capacity: 20, guestPrice: 200, visibility: 'CLUB', status: 'PUBLISHED' }, manager.token);
  [s, j] = await call('GET', `/events/${ev.event.id}/quote`, null, member.token);
  check('unpaid member: club event explains "pay your club membership"', j.quote.allowed === false && /Pay your club membership/.test(j.quote.reason), j.quote);
  [s, j] = await call('GET', `/clubs/${club.id}/verify?code=${encodeURIComponent((await db.ClubMember.findOne({ where: { clubId: club.id, userId: member.id } })).memberNumber)}`, null, manager.token);
  check('unpaid member card: not valid (dues)', j.valid === false && /not paid/.test(j.reason));

  // --- Pay online
  [s, j] = await call('POST', `/clubs/${club.id}/dues/checkout`, { planId: annual.id }, member.token);
  check('member starts dues checkout (₹500)', s === 201 && j.payment.amount === 500 && j.payment.clubId === club.id);
  [s, j] = await pay(j.payment.id, member.token);
  check('paid → dues active with a club membership number', j.result?.status === 'ACTIVE' && new RegExp(`^${A.college.code}-`).test(j.result.membershipNumber), j.result);
  const end = new Date(j.result.endDate);
  check('Annual runs to 31 Dec', end.getMonth() === 11 && end.getDate() === 31);
  [s, j] = await call('GET', `/clubs/${club.id}`, null, member.token);
  check('member counts again, with their plan', j.me.isMember && j.me.membership?.planName === 'Annual');
  [s, j] = await call('GET', `/events/${ev.event.id}/quote`, null, member.token);
  check('paid member may register, with the plan discount (200 → 160)', j.quote.allowed && j.quote.yourPrice === 160, j.quote);
  const ledger = await db.LedgerEntry.findOne({ where: { clubId: club.id, category: 'MEMBERSHIP_DUES' } });
  check("dues land in this club's ledger", ledger?.amount === 500);

  // --- Early renewal stacks
  [s, j] = await call('POST', `/clubs/${club.id}/dues/checkout`, { planId: annual.id }, member.token);
  [s, j] = await pay(j.payment.id, member.token);
  check('renewal starts when the current period ends', new Date(j.result.startDate).getTime() === end.getTime());

  // --- Treasurer records cash dues
  const late = await student('Leo Latecomer', A.college, A.head);
  const cm = await addToClub(club, manager, late, 'MEMBER');
  [s, j] = await call('POST', `/clubs/${club.id}/manage/members/${cm.id}/dues`, { planId: annual.id, paymentMethod: 'CASH' }, treasurer.token);
  check('treasurer records cash dues', s === 201 && j.membership.status === 'ACTIVE');
  const cash = await db.Payment.findOne({ where: { id: j.membership.paymentId } });
  check('cash payment: club + recorded by treasurer', cash.method === 'CASH' && cash.clubId === club.id && cash.recordedById === treasurer.id);
  [s] = await call('POST', `/clubs/${club.id}/manage/members/${cm.id}/dues`, { planId: annual.id }, w.volunteer.token);
  check('volunteers cannot record dues (403)', s === 403);

  // --- Members list shows dues
  [s, j] = await call('GET', `/clubs/${club.id}/manage/members`, null, manager.token);
  const row = j.members.find((m) => m.userId === late.id);
  check('member list shows dues status', row.duesOk && row.dues.planName === 'Annual');

  // --- Reminders and expiry
  const m = await db.Membership.findOne({ where: { clubId: club.id, userId: late.id, status: 'ACTIVE' } });
  await m.update({ startDate: new Date(Date.now() - 300 * 86400000), endDate: new Date(Date.now() + 5 * 86400000) });
  const { runMembershipJobs } = require('../src/jobs/membershipJobs');
  await runMembershipJobs();
  const after = await db.Membership.findByPk(m.id);
  check('reminder sent at 5 days left (30 & 7 marked)', after.remindersSent.includes(7) && after.remindersSent.includes(30));
  check('reminder names the club', (await db.Notification.count({ where: { userId: late.id, title: { [require('sequelize').Op.like]: `%${club.name.slice(0, 20)}%expires%` } } })) === 1);
  await m.update({ endDate: new Date(Date.now() - 1000) });
  await runMembershipJobs();
  check('expired dues → EXPIRED', (await db.Membership.findByPk(m.id)).status === 'EXPIRED');
  [s, j] = await call('GET', `/clubs/${club.id}`, null, late.token);
  check('lapsed member loses member status but stays in the club', !j.me.isMember && j.me.status === 'ACTIVE' && j.me.duesRequired);

  // --- Plans admin
  [s] = await call('DELETE', `/clubs/${club.id}/manage/plans/${annual.id}`, null, manager.token);
  check("can't delete a plan with memberships", s === 409);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/plans`, null, manager.token);
  check('plan list shows active members', j.plans.find((p) => p.id === annual.id).activeMembers >= 1);
  void signup;
});
