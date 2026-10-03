// Role separation and the volunteer features: Platform Admin stays out of colleges and clubs,
// College Head oversees, Helping Out, Task Management, participants, expenses, Help & Support
const { db, call, check, makeWorld, signup, run, inDays, TAG } = require('./helpers');

run('Roles', async () => {
  const w = await makeWorld();
  const { admin, A, club, manager, treasurer, volunteer, member, guest } = w;
  let s, j;

  // ---------- Platform Admin is not a student, College Head or club member ----------
  [s, j] = await call('GET', '/me/context', null, admin.token);
  check('Platform Admin has no college and no clubs', s === 200 && j.isPlatformAdmin && !j.college && j.clubs.length === 0 && j.headOf.length === 0);
  [s] = await call('POST', `/clubs/${club.id}/join`, {}, admin.token);
  check("Platform Admin can't join a club (403)", s === 403);
  [s] = await call('GET', `/clubs/${club.id}/manage`, null, admin.token);
  check("Platform Admin can't open a club workspace (403)", s === 403);
  [s] = await call('GET', `/colleges/${A.college.id}/manage`, null, admin.token);
  check("Platform Admin can't open a college workspace (403)", s === 403);
  [s] = await call('PATCH', '/auth/profile', { collegeId: A.college.id }, admin.token);
  check("Platform Admin can't pick a college", s === 400);
  [s] = await call('POST', `/platform/colleges/${A.college.id}/heads`, { email: (await db.User.findByPk(admin.id)).email }, admin.token);
  check("Platform Admin can't also be a College Head (409)", s === 409);
  [s] = await call('PATCH', `/platform/users/${A.head.id}`, { role: 'PLATFORM_ADMIN' }, admin.token);
  check("a College Head can't be made Platform Admin (409)", s === 409);
  [s] = await call('PATCH', `/platform/users/${member.id}`, { role: 'PLATFORM_ADMIN' }, admin.token);
  check("a club member can't be made Platform Admin (409)", s === 409);
  const fresh = await signup('Fiona Fresh', A.college.id);
  [s, j] = await call('PATCH', `/platform/users/${fresh.id}`, { role: 'PLATFORM_ADMIN' }, admin.token);
  check('a plain account can become Platform Admin and leaves its college', s === 200 && j.user.role === 'PLATFORM_ADMIN' && !j.user.collegeId);
  await call('PATCH', `/platform/users/${fresh.id}`, { role: 'USER' }, admin.token);
  [s] = await call('POST', `/clubs/${club.id}/manage/members`, { email: (await db.User.findByPk(admin.id)).email, role: 'MEMBER' }, manager.token);
  check("a manager can't add the Platform Admin to a club (409)", s === 409);

  [s, j] = await call('GET', '/platform/stats', null, admin.token);
  check('platform stats include College Heads and upcoming events', s === 200 && j.collegeHeads >= 1 && j.upcomingEvents !== undefined);
  [s, j] = await call('GET', '/platform/reports', null, admin.token);
  check('platform report lists every college', s === 200 && j.colleges.some((c) => c.id === A.college.id) && j.total.clubs >= 1);
  [s, j] = await call('GET', '/platform/settings', null, admin.token);
  check('platform settings show configuration without secrets', s === 200 && j.payments.provider && !JSON.stringify(j).includes('SECRET'));
  [s] = await call('GET', '/platform/reports', null, A.head.token);
  check("College Head can't see platform reports (403)", s === 403);

  // ---------- College Head: oversees clubs, doesn't run them ----------
  [s, j] = await call('GET', `/clubs/${club.id}/manage`, null, A.head.token);
  check('College Head opens the club workspace (view only)', s === 200 && j.can.view && !j.can.manage && j.can.finance);
  [s] = await call('PATCH', `/clubs/${club.id}/manage/settings`, { description: 'x' }, A.head.token);
  check("College Head can't edit the club (403)", s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage`, null, volunteer.token);
  check('volunteer sees the club overview without finance', s === 200 && j.can.view && !j.can.finance && !j.finance);
  [s] = await call('GET', `/clubs/${club.id}/manage/members`, null, volunteer.token);
  check("volunteer can't open the member list (403)", s === 403);

  // ---------- Events, Helping Out and participants ----------
  [s, j] = await call('POST', `/clubs/${club.id}/manage/events`, { title: `${TAG} Hackathon`, venue: 'Hall', startsAt: inDays(6), capacity: 40, guestPrice: 0, status: 'PUBLISHED', volunteersNeeded: 3 }, manager.token);
  const hack = j.event;
  check('manager asks for volunteers on an event', s === 201 && hack.volunteersNeeded === 3);
  [s, j] = await call('GET', '/helping-out', null, volunteer.token);
  const listed = j.events?.find((e) => e.id === hack.id);
  check('Helping Out lists the event to club volunteers', s === 200 && listed && listed.volunteersApproved === 0 && listed.myStatus === null);
  [s, j] = await call('GET', '/helping-out', null, member.token);
  check('plain members see no Helping Out events', s === 200 && j.events.length === 0);
  [s] = await call('POST', `/events/${hack.id}/volunteer`, { duty: 'x' }, member.token);
  check("plain members can't offer to help (403)", s === 403);
  [s, j] = await call('POST', `/events/${hack.id}/volunteer`, { duty: 'Registration desk', message: 'Free all day' }, volunteer.token);
  check('volunteer offers to help (pending)', s === 201 && j.volunteer.status === 'PENDING');
  [s] = await call('POST', `/events/${hack.id}/volunteer`, { duty: 'Again' }, volunteer.token);
  check("can't offer twice (409)", s === 409);
  check('managers are told about the offer', (await db.Notification.count({ where: { userId: manager.id, title: `Volunteer offer: ${hack.title}` } })) === 1);
  [s, j] = await call('GET', '/me/volunteering', null, volunteer.token);
  check('a pending offer is not yet in My Events', !j.assignments.some((a) => a.eventId === hack.id));
  [s] = await call('GET', `/me/volunteering/${hack.id}/participants`, null, volunteer.token);
  check("pending volunteers can't see participants (403)", s === 403);
  [s] = await call('GET', '/checkin/events/' + hack.id + '/stats', null, volunteer.token);
  check("pending volunteers can't check people in (403)", s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/events/${hack.id}/volunteers`, null, manager.token);
  check('manager sees the pending offer', j.volunteers.some((v) => v.userId === volunteer.id && v.status === 'PENDING' && v.message === 'Free all day'));
  [s] = await call('POST', `/clubs/${club.id}/manage/events/${hack.id}/volunteers/${volunteer.id}/decision`, { decision: 'APPROVED' }, A.head.token);
  check("College Head can't approve volunteers (403)", s === 403);
  [s, j] = await call('POST', `/clubs/${club.id}/manage/events/${hack.id}/volunteers/${volunteer.id}/decision`, { decision: 'APPROVED', canCheckIn: true }, manager.token);
  check('manager approves the volunteer with check-in rights', s === 200 && j.volunteer.status === 'APPROVED' && j.volunteer.canCheckIn);
  [s, j] = await call('GET', '/me/volunteering', null, volunteer.token);
  check('approved event appears in My Events', j.assignments.some((a) => a.eventId === hack.id));
  [s, j] = await call('GET', '/me/context', null, volunteer.token);
  check('context says the volunteer can check people in', j.canCheckIn === true);
  [s] = await call('DELETE', `/events/${hack.id}/volunteer`, null, volunteer.token);
  check("an approved helper can't silently withdraw (404)", s === 404);
  [s] = await call('POST', `/events/${hack.id}/volunteer`, { duty: 'Food' }, treasurer.token);
  [s] = await call('DELETE', `/events/${hack.id}/volunteer`, null, treasurer.token);
  check('a pending offer can be withdrawn', s === 200);

  [s, j] = await call('POST', `/events/${hack.id}/checkout`, { quantity: 1 }, guest.token);
  check('a guest registers', s === 201 || s === 200, j);
  [s, j] = await call('GET', `/me/volunteering/${hack.id}/participants`, null, volunteer.token);
  check('approved volunteer sees participants, without contact details', s === 200 && j.participants.length === 1 && j.participants[0].registrationType === 'GUEST' && !j.participants[0].boughtBy);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/participants?eventId=${hack.id}`, null, manager.token);
  check('manager sees participants with who bought them', s === 200 && j.participants[0].boughtBy?.email === guest.email);
  [s] = await call('GET', `/clubs/${club.id}/manage/participants`, null, volunteer.token);
  check("volunteers can't open the club-wide participant list (403)", s === 403);

  // ---------- Task Management ----------
  [s, j] = await call('POST', `/clubs/${club.id}/manage/tasks`, { title: 'Manage registration desk', eventId: hack.id, assigneeId: volunteer.id, dueDate: inDays(5).slice(0, 10) }, manager.token);
  check('manager creates an event task for a volunteer', s === 201 && j.task.eventId === hack.id && j.task.status === 'TODO');
  const task = j.task;
  [s] = await call('POST', `/clubs/${club.id}/manage/tasks`, { title: 'x', assigneeId: member.id }, manager.token);
  check("tasks can't go to plain members (400)", s === 400);
  [s] = await call('POST', `/clubs/${club.id}/manage/tasks`, { title: 'x' }, A.head.token);
  check("College Head can't create tasks (403)", s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/tasks`, null, A.head.token);
  check('College Head can view the task board', s === 200 && j.tasks.some((t) => t.id === task.id));
  [s, j] = await call('GET', '/me/tasks', null, volunteer.token);
  const mine = j.tasks.find((t) => t.id === task.id);
  check('My Tasks shows the event and who assigned it', mine && mine.event?.title === hack.title && mine.createdBy?.id === manager.id);
  [s] = await call('PATCH', `/tasks/${task.id}/status`, { status: 'IN_PROGRESS' }, volunteer.token);
  [s, j] = await call('PATCH', `/tasks/${task.id}/status`, { status: 'DONE' }, volunteer.token);
  check('volunteer starts and completes the task', s === 200 && j.task.status === 'DONE');
  [s, j] = await call('PATCH', `/clubs/${club.id}/manage/tasks/${task.id}`, { assigneeId: treasurer.id, status: 'TODO' }, manager.token);
  check('manager reassigns and reopens the task', s === 200 && j.task.assigneeId === treasurer.id);

  // ---------- Expenses ----------
  const receipt = '/uploads/test-receipt.png';
  [s, j] = await call('POST', `/clubs/${club.id}/claims`, { title: `${TAG} Banner`, amount: 300, eventId: hack.id, receiptUrl: receipt }, volunteer.token);
  check('volunteer submits an expense', s === 201);
  const claim = j.claim;
  [s, j] = await call('POST', `/clubs/${club.id}/claims`, { title: `${TAG} Head taxi`, amount: 120, receiptUrl: receipt }, A.head.token);
  check('College Head can submit their own expense (My Expenses)', s === 201);
  const headClaim = j.claim;
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage/expenses?status=SUBMITTED`, null, A.head.token);
  check('Expense Management lists claims from every club', s === 200 && j.claims.some((c) => c.id === claim.id && c.club?.name) && j.counts.SUBMITTED >= 2);
  [s] = await call('POST', `/clubs/${club.id}/manage/claims/${headClaim.id}/review`, { decision: 'APPROVED' }, A.head.token);
  check("College Head can't approve their own expense (403)", s === 403);
  [s, j] = await call('POST', `/clubs/${club.id}/manage/claims/${claim.id}/review`, { decision: 'APPROVED' }, A.head.token);
  check('College Head approves a volunteer expense', s === 200 && j.claim.status === 'APPROVED');
  [s, j] = await call('POST', `/clubs/${club.id}/manage/claims/${claim.id}/pay`, { method: 'UPI' }, manager.token);
  check('manager marks it paid', s === 200 && j.claim.status === 'PAID');
  [s, j] = await call('POST', `/clubs/${club.id}/manage/claims/${headClaim.id}/review`, { decision: 'REJECTED', note: 'Not a club cost' }, treasurer.token);
  check('treasurer reviews the College Head expense', s === 200 && j.claim.status === 'REJECTED');
  [s] = await call('POST', `/clubs/${club.id}/manage/finance/transactions`, { type: 'INCOME', category: 'DONATION', amount: 10, description: 'x' }, A.head.token);
  check("College Head can't write to the club's books (403)", s === 403);
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage/finance`, null, A.head.token);
  const row = j.clubs?.find((c) => c.clubId === club.id);
  check('college report has members, events and attendance per club', s === 200 && row && row.members >= 4 && row.events >= 1 && row.ticketsSold >= 1);

  // ---------- Help & Support ----------
  [s, j] = await call('POST', '/support', { subject: `${TAG} Can't find my ticket`, message: 'Bought it yesterday' }, member.token);
  check('a student asks for help (goes to their college)', s === 201 && j.request.collegeId === A.college.id);
  const req1 = j.request;
  [s, j] = await call('POST', '/support', { subject: `${TAG} Account question`, message: 'How do I delete my account?' }, guest.token);
  check('a guest asks for help (goes to the platform)', s === 201 && j.request.collegeId === null);
  const req2 = j.request;
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage/support`, null, A.head.token);
  check('College Head sees their college requests only', s === 200 && j.requests.some((r) => r.id === req1.id) && !j.requests.some((r) => r.id === req2.id) && j.open >= 1);
  [s, j] = await call('GET', '/platform/support', null, admin.token);
  check('Platform Admin sees platform requests', s === 200 && j.requests.some((r) => r.id === req2.id) && !j.requests.some((r) => r.id === req1.id));
  [s] = await call('POST', `/colleges/${A.college.id}/manage/support/${req1.id}/resolve`, { reply: '' }, A.head.token);
  check('resolving needs a reply', s === 400);
  [s, j] = await call('POST', `/colleges/${A.college.id}/manage/support/${req1.id}/resolve`, { reply: 'Check My Registrations' }, A.head.token);
  check('College Head answers', s === 200 && j.request.status === 'RESOLVED');
  [s, j] = await call('GET', '/me/support', null, member.token);
  check('the student sees the answer', j.requests[0]?.reply === 'Check My Registrations');
  [s] = await call('POST', `/platform/support/${req1.id}/resolve`, { reply: 'x' }, admin.token);
  check("Platform Admin can't answer a college's request (404)", s === 404);
  [s, j] = await call('POST', '/support', { subject: `${TAG} Need a new club type`, message: 'x', to: 'PLATFORM' }, A.head.token);
  check('College Head asks the platform', s === 201 && j.request.collegeId === null);
});
