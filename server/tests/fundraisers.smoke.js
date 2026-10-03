// Fundraisers & tasks inside a club: assignment to club staff, self-pickup, progress and on-track status
const { db, call, check, makeWorld, makeClub, addToClub, student, run, TAG } = require('./helpers');

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

run('Fundraisers', async () => {
  const w = await makeWorld();
  const { club, manager, volunteer, treasurer, member, A } = w;
  const priya = await student('Priya Baker', A.college, A.head);
  await addToClub(club, manager, priya, 'VOLUNTEER');
  const { club: other, manager: otherMgr } = await makeClub(A.college, A.head, 'Drama');
  const outsiderVol = await student('Olly Outsider', A.college, A.head);
  await addToClub(other, otherMgr, outsiderVol, 'VOLUNTEER');

  let [s, j] = await call('POST', `/clubs/${club.id}/manage/fundraisers`, { title: `${TAG} Bake Sale`, goalAmount: 5000, eventDate: day(10), status: 'ACTIVE', leadId: priya.id }, manager.token);
  check('manager creates a fundraiser led by a club volunteer', s === 201 && j.fundraiser.clubId === club.id, j);
  const bake = j.fundraiser;
  [s] = await call('POST', `/clubs/${club.id}/manage/fundraisers`, { title: 'x', leadId: member.id }, manager.token);
  check('a plain member cannot lead a fundraiser', s === 400);

  [s, j] = await call('POST', `/clubs/${club.id}/manage/fundraisers/${bake.id}/tasks`, { title: 'Buy ingredients', assigneeId: priya.id, dueDate: day(5), priority: 'HIGH' }, manager.token);
  const t1 = j.task;
  [s, j] = await call('POST', `/clubs/${club.id}/manage/fundraisers/${bake.id}/tasks`, { title: 'Bake cakes', assigneeId: priya.id, dueDate: day(9) }, manager.token);
  const t2 = j.task;
  [s, j] = await call('POST', `/clubs/${club.id}/manage/fundraisers/${bake.id}/tasks`, { title: 'Manage the table' }, manager.token);
  const t3 = j.task;
  check('tasks created (2 assigned, 1 open)', t1 && t2 && t3 && !t3.assigneeId);
  [s] = await call('POST', `/clubs/${club.id}/manage/fundraisers/${bake.id}/tasks`, { title: 'x', assigneeId: outsiderVol.id }, manager.token);
  check("can't give a task to another club's volunteer", s === 400);
  check('assignee notified', (await db.Notification.count({ where: { userId: priya.id, title: 'New task for you' } })) >= 1);

  // --- Volunteer views
  [s, j] = await call('GET', '/me/tasks', null, priya.token);
  check('Priya sees her 2 tasks with the club name', j.tasks.length === 2 && j.tasks.every((t) => t.club.id === club.id));
  [s, j] = await call('GET', '/me/tasks', null, volunteer.token);
  check('club volunteer sees the open task to pick up', j.openTasks.some((t) => t.id === t3.id));
  [s, j] = await call('GET', '/me/tasks', null, outsiderVol.token);
  check("another club's volunteer does not", !j.openTasks.some((t) => t.id === t3.id));
  [s] = await call('POST', `/tasks/${t3.id}/claim`, {}, outsiderVol.token);
  check("…and can't claim it (403)", s === 403);
  [s] = await call('POST', `/tasks/${t3.id}/claim`, {}, member.token);
  check("plain members can't claim tasks (403)", s === 403);
  [s, j] = await call('POST', `/tasks/${t3.id}/claim`, {}, volunteer.token);
  check('club volunteer claims it', j.task?.assigneeId === volunteer.id);
  [s] = await call('POST', `/tasks/${t3.id}/claim`, {}, priya.token);
  check('already taken → 409', s === 409);
  [s] = await call('PATCH', `/tasks/${t1.id}/status`, { status: 'DONE' }, volunteer.token);
  check("can't update someone else's task (403)", s === 403);
  [s, j] = await call('PATCH', `/tasks/${t1.id}/status`, { status: 'DONE' }, priya.token);
  check('assignee marks done', j.task?.status === 'DONE');

  // --- Money raised (manager or treasurer)
  [s] = await call('POST', `/clubs/${club.id}/manage/fundraisers/${bake.id}/income`, { amount: 100 }, volunteer.token);
  check("volunteers can't record money (403)", s === 403);
  [s, j] = await call('POST', `/clubs/${club.id}/manage/fundraisers/${bake.id}/income`, { amount: 3200, description: `${TAG} Saturday takings` }, treasurer.token);
  check("treasurer records takings into the club's ledger", s === 201 && j.entry.clubId === club.id);

  // --- Progress & health
  [s, j] = await call('GET', `/clubs/${club.id}/fundraisers/${bake.id}`, null, volunteer.token);
  const f = j.fundraiser;
  check('progress 1/3, ₹3200 of ₹5000 (64%), on track', f.tasks.done === 1 && f.tasks.total === 3 && f.raised === 3200 && f.percentRaised === 64 && f.health === 'ON_TRACK', f);
  [s] = await call('GET', `/clubs/${club.id}/fundraisers/${bake.id}`, null, member.token);
  check('plain members cannot open the fundraiser board (403)', s === 403);
  [s] = await call('GET', `/clubs/${other.id}/fundraisers/${bake.id}`, null, otherMgr.token);
  check("can't open another club's fundraiser", s === 404);
  await call('PATCH', `/clubs/${club.id}/manage/tasks/${t2.id}`, { dueDate: day(-1) }, manager.token);
  [s, j] = await call('GET', `/clubs/${club.id}/fundraisers/${bake.id}`, null, manager.token);
  check('overdue task → BEHIND', j.fundraiser.health === 'BEHIND');
  await call('PATCH', `/clubs/${club.id}/manage/tasks/${t2.id}`, { dueDate: day(2) }, manager.token);
  await call('PATCH', `/clubs/${club.id}/manage/fundraisers/${bake.id}`, { eventDate: day(2) }, manager.token);
  [s, j] = await call('GET', `/clubs/${club.id}/fundraisers`, null, manager.token);
  check('2 days out with 33% done → AT_RISK', j.fundraisers.find((x) => x.id === bake.id).health === 'AT_RISK');

  [s, j] = await call('GET', `/clubs/${club.id}/manage/assignees`, null, manager.token);
  check('assignees = club staff only', j.users.some((u) => u.id === priya.id) && !j.users.some((u) => u.id === member.id));
  [s] = await call('DELETE', `/clubs/${club.id}/manage/fundraisers/${bake.id}`, null, manager.token);
  check("can't delete a fundraiser with money recorded", s === 409);
});
