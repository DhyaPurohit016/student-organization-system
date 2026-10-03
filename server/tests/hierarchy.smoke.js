// Sign-up, colleges, College Heads, clubs, join requests and per-club roles
const { db, call, check, platformAdmin, signup, relogin, makeCollege, makeClub, student, run, TAG } = require('./helpers');

run('Hierarchy', async () => {
  const admin = await platformAdmin();

  // --- Sign-up and login
  let [s, j] = await call('GET', '/health'.replace('/health', '/colleges'));
  check('public college list works', s === 200 && Array.isArray(j.colleges));
  const guest = await signup('Plain Guest');
  check('sign up without a college → guest (NONE)', guest.user.role === 'USER' && guest.user.collegeStatus === 'NONE' && !guest.user.collegeId);
  const savedGuest = await db.User.findByPk(guest.id);
  check('sign up persists the account in the database', savedGuest?.email === guest.email);
  [s, j] = await call('POST', '/auth/login', { email: guest.email, password: 'Smoke@1234' });
  check('saved account can sign in and receive a session', s === 200 && j.user?.id === guest.id && Boolean(j.token));
  [s, j] = await call('GET', '/me/context', null, j.token);
  check('signed-in account can access its authenticated profile', s === 200 && j.user?.id === guest.id);
  [s, j] = await call('POST', '/auth/register', { name: 'Sneaky', email: `sneaky.${Date.now()}@smoke.test`, password: 'Smoke@1234', role: 'PLATFORM_ADMIN' });
  check("can't sign up as platform admin", s === 201 && j.user.role === 'USER');
  [s] = await call('POST', '/auth/register', { name: 'Dup', email: guest.email, password: 'Smoke@1234' });
  check('duplicate email → 409', s === 409);
  [s] = await call('POST', '/auth/register', { name: 'Short', email: `short.${Date.now()}@smoke.test`, password: '123' });
  check('short password → 400', s === 400);
  [s] = await call('POST', '/auth/login', { email: guest.email, password: 'wrong-pass' });
  check('wrong password → 401', s === 401);
  [s] = await call('POST', '/auth/register', { name: 'Bad College', email: `badc.${Date.now()}@smoke.test`, password: 'Smoke@1234', collegeId: 999999 });
  check('unknown college → 400', s === 400);

  // --- Platform admin creates colleges
  [s] = await call('POST', '/platform/colleges', { name: 'x', code: 'XX' }, guest.token);
  check('non-admins cannot create colleges (403)', s === 403);
  const A = await makeCollege(admin, 'Alpha');
  const B = await makeCollege(admin, 'Beta', { approveStudents: false });
  check('platform admin creates colleges with a College Head', A.college.id && B.college.id);
  [s] = await call('POST', '/platform/colleges', { name: `${TAG} Dup`, code: A.college.code }, admin.token);
  check('college codes are unique', s === 409);
  [s, j] = await call('GET', '/me/context', null, A.head.token);
  check('head sees the college under "headOf" and belongs to it', j.headOf.some((c) => c.id === A.college.id) && j.college?.id === A.college.id && j.collegeStatus === 'VERIFIED', j);
  [s, j] = await call('GET', '/platform/colleges', null, admin.token);
  check('platform college list shows heads', j.colleges.find((c) => c.id === A.college.id)?.heads.some((h) => h.id === A.head.id));

  // --- Students choose a college: approval vs trusted
  const pending = await signup('Alpha Applicant', A.college.id);
  check('college that approves → PENDING', pending.user.collegeStatus === 'PENDING');
  const trusted = await signup('Beta Student', B.college.id);
  check('college that trusts → VERIFIED immediately', trusted.user.collegeStatus === 'VERIFIED');
  check('head notified of the student to approve', (await db.Notification.count({ where: { userId: A.head.id, title: 'New student to approve' } })) >= 1);
  [s] = await call('GET', `/colleges/${A.college.id}/manage/students`, null, B.head.token);
  check("a head can't manage another college (403)", s === 403);
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage/students?status=PENDING`, null, A.head.token);
  check('head sees pending students', j.students.some((u) => u.id === pending.id));
  [s, j] = await call('POST', `/colleges/${A.college.id}/manage/students/${pending.id}/decision`, { decision: 'VERIFIED' }, A.head.token);
  check('head approves the student', j.user?.collegeStatus === 'VERIFIED');
  const rejectMe = await signup('Alpha Pretender', A.college.id);
  [s, j] = await call('POST', `/colleges/${A.college.id}/manage/students/${rejectMe.id}/decision`, { decision: 'REJECTED' }, A.head.token);
  check('head rejects a student', j.user?.collegeStatus === 'REJECTED');
  [s, j] = await call('PATCH', '/auth/profile', { collegeId: A.college.id }, trusted.token);
  check('changing college restarts approval', j.user.collegeId === A.college.id && j.user.collegeStatus === 'PENDING');

  // --- Head creates clubs and appoints managers
  const { club, manager } = await makeClub(A.college, A.head, 'Robotics');
  check('head creates a club with a manager', club.id && club.collegeId === A.college.id);
  [s] = await call('POST', `/colleges/${A.college.id}/manage/clubs`, { name: `${TAG} Robotics`, code: 'ZZ1' }, A.head.token);
  check('club names are unique within a college', s === 409);
  [s] = await call('POST', `/colleges/${A.college.id}/manage/clubs`, { name: 'Nope', code: 'NOPE' }, manager.token);
  check("managers can't create clubs (403)", s === 403);
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage/clubs`, null, A.head.token);
  const listed = j.clubs.find((c) => c.id === club.id);
  check('club list shows the manager and counts', listed.managers.some((m) => m.id === manager.id) && listed.members === 1);
  [s, j] = await call('GET', '/me/context', null, manager.token);
  check("manager's context lists the club with manage rights", j.clubs.some((c) => c.id === club.id && c.role === 'MANAGER' && c.can.manage));

  // --- Joining a club: request → approve / reject
  const alice = await student('Alice Joiner', A.college, A.head);
  [s, j] = await call('POST', `/clubs/${club.id}/join`, { message: 'I love robots' }, alice.token);
  check('student asks to join', s === 201 && j.membership.status === 'PENDING');
  [s] = await call('POST', `/clubs/${club.id}/join`, {}, alice.token);
  check('asking twice → 409', s === 409);
  check('manager notified of the request', (await db.Notification.count({ where: { userId: manager.id } })) >= 1);
  [s] = await call('GET', `/clubs/${club.id}/manage/members?status=PENDING`, null, alice.token);
  check("applicants can't see the manager's member list (403)", s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/members?status=PENDING`, null, manager.token);
  const request = j.members.find((x) => x.userId === alice.id);
  check('manager sees the pending request with the message', request?.message === 'I love robots');
  [s, j] = await call('POST', `/clubs/${club.id}/manage/members/${request.id}/decision`, { decision: 'APPROVE' }, manager.token);
  check('manager approves → ACTIVE with a member number', j.member?.status === 'ACTIVE' && new RegExp(`^${A.college.code}-`).test(j.member.memberNumber), j.member);
  [s, j] = await call('GET', `/clubs/${club.id}`, null, alice.token);
  check('club page shows my membership and QR card', j.me.isMember && j.me.card?.startsWith('data:image/png') && j.me.memberNumber);
  [s, j] = await call('GET', `/clubs/${club.id}/verify?code=${encodeURIComponent(j.me.memberNumber)}`, null, manager.token);
  check('member card verifies as valid', j.valid === true && j.member.name === 'Alice Joiner');

  const bob = await signup('Bob Outsider');
  await call('POST', `/clubs/${club.id}/join`, {}, bob.token);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/members?status=PENDING`, null, manager.token);
  const bobReq = j.members.find((x) => x.userId === bob.id);
  [s] = await call('POST', `/clubs/${club.id}/manage/members/${bobReq.id}/decision`, { decision: 'REJECT' }, manager.token);
  check('rejecting needs a reason', s === 400);
  [s, j] = await call('POST', `/clubs/${club.id}/manage/members/${bobReq.id}/decision`, { decision: 'REJECT', note: 'Club is full this term' }, manager.token);
  check('manager rejects with a reason', j.member?.status === 'REJECTED');
  [s, j] = await call('GET', `/clubs/${club.id}`, null, bob.token);
  check('rejected student sees the reason', j.me.status === 'REJECTED' && j.me.decisionNote === 'Club is full this term');
  [s, j] = await call('POST', `/clubs/${club.id}/join`, {}, bob.token);
  check('rejected student may ask again later', s === 201);

  // --- Roles inside the club
  const aliceMember = await db.ClubMember.findOne({ where: { clubId: club.id, userId: alice.id } });
  [s, j] = await call('PATCH', `/clubs/${club.id}/manage/members/${aliceMember.id}`, { role: 'VOLUNTEER' }, manager.token);
  check('manager makes a member a volunteer', j.member?.role === 'VOLUNTEER');
  [s] = await call('PATCH', `/clubs/${club.id}/manage/members/${aliceMember.id}`, { role: 'MANAGER' }, manager.token);
  check("manager can't appoint another manager (403)", s === 403);
  [s] = await call('PATCH', `/clubs/${club.id}/manage/members/${aliceMember.id}`, { role: 'MEMBER' }, A.head.token);
  check("College Head can't change club members directly (view only, 403)", s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/members`, null, A.head.token);
  check('College Head can view the member list', s === 200 && j.members.length >= 2);
  [s] = await call('GET', `/clubs/${club.id}/manage/members`, null, admin.token);
  check("Platform Admin can't open a club's members (403)", s === 403);
  [s, j] = await call('POST', `/colleges/${A.college.id}/manage/clubs/${club.id}/managers`, { email: alice.email }, A.head.token);
  check('College Head can appoint a second manager', s === 201 && j.member?.role === 'MANAGER');
  const mgrMember = await db.ClubMember.findOne({ where: { clubId: club.id, userId: manager.id } });
  [s] = await call('DELETE', `/clubs/${club.id}/manage/members/${mgrMember.id}`, null, alice.token);
  check("a manager can't remove another manager (403)", s === 403);
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage/people?role=MANAGER`, null, A.head.token);
  check('College Head sees managers across clubs', s === 200 && j.people.filter((p) => p.club.id === club.id).length === 2);
  [s] = await call('DELETE', `/colleges/${A.college.id}/manage/clubs/${club.id}/managers/${alice.id}`, null, A.head.token);
  check('College Head removes a manager', s === 200);
  [s] = await call('DELETE', `/colleges/${A.college.id}/manage/clubs/${club.id}/managers/${manager.id}`, null, A.head.token);
  check('the last manager cannot be removed', s === 409);
  [s] = await call('POST', `/clubs/${club.id}/leave`, {}, manager.token);
  check('the last manager cannot leave', s === 409);

  // Same person, different roles in different clubs
  const { club: club2, manager: club2Manager } = await makeClub(A.college, A.head, 'Drama');
  await call('POST', `/clubs/${club2.id}/manage/members`, { email: manager.email, role: 'VOLUNTEER' }, club2Manager.token);
  [s, j] = await call('GET', '/me/context', null, manager.token);
  const roles = Object.fromEntries(j.clubs.map((c) => [c.id, c.role]));
  check('one person: manager of one club, volunteer of another', roles[club.id] === 'MANAGER' && roles[club2.id] === 'VOLUNTEER');
  [s] = await call('GET', `/clubs/${club2.id}/manage/members`, null, manager.token);
  check('…and has no manager rights in the second club (403)', s === 403);

  // Leaving / removal
  [s] = await call('POST', `/clubs/${club.id}/leave`, {}, alice.token);
  check('member leaves the club', s === 200);
  [s, j] = await call('GET', `/clubs/${club.id}/verify?code=${encodeURIComponent(aliceMember.memberNumber)}`, null, manager.token);
  check("a former member's card is not valid", j.valid === false && /Left/.test(j.reason));

  // Archive
  [s] = await call('PATCH', `/colleges/${A.college.id}/manage/clubs/${club2.id}`, { status: 'ARCHIVED' }, A.head.token);
  [s] = await call('GET', `/clubs/${club2.id}`);
  check('archived club is hidden from the public', s === 404);
  [s] = await call('POST', `/clubs/${club2.id}/join`, {}, guest.token);
  check("can't join an archived club", s === 409);

  // Platform admin tools
  [s, j] = await call('GET', `/platform/users?search=${encodeURIComponent('Alpha Applicant')}`, null, admin.token);
  check('platform admin searches users', j.users.some((u) => u.id === pending.id));
  [s] = await call('PATCH', `/platform/users/${guest.id}`, { isActive: false }, admin.token);
  [s] = await call('POST', '/auth/login', { email: guest.email, password: 'Smoke@1234' });
  check('disabled account cannot log in', s === 403);
  [s] = await call('PATCH', `/platform/users/${admin.id}`, { role: 'USER' }, admin.token);
  check('platform admin cannot demote themselves', s === 400);
  void relogin;
});
