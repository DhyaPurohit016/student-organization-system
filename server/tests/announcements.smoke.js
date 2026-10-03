// Announcements: club audiences (Everyone / College / Members / Staff), college-wide posts by the
// College Head, per-club mailing lists, and who sees what in their feed
const { Op } = require('sequelize');
const { db, call, check, makeWorld, email, sleep, run, TAG } = require('./helpers');

run('Announcements', async () => {
  const w = await makeWorld();
  const { club, manager, member, volunteer, collegeStudent, external, guest, A } = w;
  const post = async (audience, title, extra = {}) => {
    const [s, j] = await call('POST', `/clubs/${club.id}/manage/announcements`, { title: `${TAG} ${title}`, body: `${title} body`, audience, publish: true, ...extra }, manager.token);
    if (s !== 201) throw new Error(JSON.stringify(j));
    return j.announcement;
  };
  const sees = async (u, id) => (await call('GET', '/announcements/feed', null, u.token))[1].announcements.some((a) => a.id === id);
  const notified = async (u, word) => (await db.Notification.count({ where: { userId: u.id, title: { [Op.like]: `%${word}%` } } })) > 0;

  // --- Mailing list per club
  let [s, j] = await call('POST', `/clubs/${club.id}/mailing-list`, { email: email('fan'), name: 'Campus Fan' });
  check('anyone can join a club’s mailing list', s === 201 && j.message.includes('Coding'));
  [s] = await call('POST', `/clubs/${club.id}/mailing-list`, { email: 'nope' });
  check('invalid email rejected', s === 400);

  [s] = await call('POST', `/clubs/${club.id}/manage/announcements`, { title: 'x', body: 'y' }, volunteer.token);
  check('volunteers cannot post club announcements (403)', s === 403);

  // --- Audiences
  const everyone = await post('PUBLIC', 'Hackathon registrations open', { sendEmail: true });
  const college = await post('COLLEGE', 'Workshop for Alpha students');
  const members = await post('MEMBERS', 'Members: meeting moved');
  const staff = await post('STAFF', 'Volunteers: setup at 4pm');
  await sleep(900);

  [s, j] = await call('GET', `/announcements?clubId=${club.id}`);
  check('public club page shows only Everyone posts', j.announcements.some((a) => a.id === everyone.id) && !j.announcements.some((a) => [college.id, members.id, staff.id].includes(a.id)));
  const feedMatrix = {
    member: [await sees(member, everyone.id), await sees(member, college.id), await sees(member, members.id), await sees(member, staff.id)],
    volunteer: [await sees(volunteer, everyone.id), await sees(volunteer, college.id), await sees(volunteer, members.id), await sees(volunteer, staff.id)],
    collegeStudent: [await sees(collegeStudent, everyone.id), await sees(collegeStudent, college.id), await sees(collegeStudent, members.id), await sees(collegeStudent, staff.id)],
    external: [await sees(external, everyone.id), await sees(external, college.id), await sees(external, members.id), await sees(external, staff.id)],
  };
  const expected = {
    member: [true, true, true, false],
    volunteer: [true, true, true, true],
    collegeStudent: [true, true, false, false],
    external: [true, false, false, false],
  };
  check('feed: who sees Everyone / College / Members / Staff posts', JSON.stringify(feedMatrix) === JSON.stringify(expected), feedMatrix);
  check('College Head sees every post in the college', (await sees(A.head, staff.id)) && (await sees(A.head, members.id)));

  check('Everyone post notifies club members', await notified(member, 'Hackathon registrations'));
  check('College post notifies same-college students', await notified(collegeStudent, 'Workshop for Alpha'));
  check('…but not other colleges', !(await notified(external, 'Workshop for Alpha')));
  check('Members post does not reach non-members', !(await notified(collegeStudent, 'meeting moved')) && (await notified(member, 'meeting moved')));
  check('Staff post reaches volunteers only', (await notified(volunteer, 'setup at 4pm')) && !(await notified(member, 'setup at 4pm')));
  const pub = await db.Announcement.findByPk(everyone.id);
  check('emailed to club members + mailing list', pub.emailedAt && pub.emailedCount >= 5, pub.emailedCount);

  // --- Edit rules
  [s, j] = await call('PATCH', `/clubs/${club.id}/manage/announcements/${everyone.id}`, { pinned: true, audience: 'STAFF' }, manager.token);
  check('published post: pin ok, audience locked', j.announcement.pinned && j.announcement.audience === 'PUBLIC');
  [s] = await call('POST', `/clubs/${club.id}/manage/announcements/${everyone.id}/publish`, {}, manager.token);
  check("can't publish twice", s === 409);

  // --- College-wide posts by the College Head
  [s, j] = await call('POST', `/colleges/${A.college.id}/manage/announcements`, { title: `${TAG} Exam timetable out`, body: 'See notice board', audience: 'COLLEGE', publish: true }, A.head.token);
  check('College Head posts to the whole college', s === 201 && j.announcement.clubId === null);
  const collegePost = j.announcement.id;
  await sleep(500);
  check('every verified student of the college sees and is notified', (await sees(collegeStudent, collegePost)) && (await notified(collegeStudent, 'Exam timetable')));
  check('students of other colleges and guests do not', !(await sees(external, collegePost)) && !(await sees(guest, collegePost)));
  [s] = await call('POST', `/colleges/${A.college.id}/manage/announcements`, { title: 'x', body: 'y' }, manager.token);
  check("club managers can't post college-wide (403)", s === 403);

  // --- Unsubscribe
  const sub = await db.Subscriber.findOne({ where: { clubId: club.id, email: email('fan') } });
  [s, j] = await call('POST', '/mailing-list/unsubscribe', { token: sub.unsubscribeToken });
  check('unsubscribe link works', s === 200 && !(await sub.reload()).isSubscribed);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/subscribers`, null, manager.token);
  check('manager sees the mailing list (no tokens exposed)', j.subscribers.some((x) => x.email === email('fan') && !x.unsubscribeToken));
});
