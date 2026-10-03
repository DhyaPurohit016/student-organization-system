// Club money: automatic ledger, manual entries, treasurer powers, expense claims, reports,
// the College Head's overview across clubs, uploads, notifications and the club dashboard
const fs = require('fs');
const path = require('path');
const { db, call, check, makeWorld, makeClub, addToClub, student, pay, inDays, run, TAG } = require('./helpers');

run('Finance', async () => {
  const w = await makeWorld();
  const { club, manager, treasurer, volunteer, member, collegeStudent, A } = w;
  const { club: other, manager: otherMgr } = await makeClub(A.college, A.head, 'Photo');
  const otherTreasurer = await student('Omar OtherTreasurer', A.college, A.head);
  await addToClub(other, otherMgr, otherTreasurer, 'TREASURER');

  // --- Payments flow into the right club's ledger
  let [s, j] = await call('POST', `/clubs/${club.id}/manage/events`, { title: `${TAG} Quiz`, venue: 'Library', startsAt: inDays(5), capacity: 40, guestPrice: 120, memberPrice: 60, status: 'PUBLISHED' }, manager.token);
  const quiz = j.event;
  [s, j] = await call('POST', `/events/${quiz.id}/checkout`, { quantity: 1 }, member.token);
  await pay(j.payment.id, member.token);
  let entry = await db.LedgerEntry.findOne({ where: { paymentId: j.payment.id } });
  check("ticket income lands in the organising club's ledger", entry?.clubId === club.id && entry.category === 'TICKET_SALES' && entry.amount === 60 && entry.eventId === quiz.id);

  // --- Manual entries (manager + treasurer)
  [s, j] = await call('POST', `/clubs/${club.id}/manage/finance/transactions`, { type: 'EXPENSE', category: 'EVENT_COSTS', amount: 1500, description: `${TAG} Quiz prizes`, eventId: quiz.id }, treasurer.token);
  check('treasurer records an event expense', s === 201 && j.entry.clubId === club.id && j.entry.recordedById === treasurer.id);
  const manualId = j.entry.id;
  [s] = await call('POST', `/clubs/${club.id}/manage/finance/transactions`, { type: 'INCOME', category: 'DONATION', amount: 2000, description: `${TAG} Alumni donation` }, manager.token);
  check('manager records a donation', s === 201);
  [s] = await call('POST', `/clubs/${other.id}/manage/finance/transactions`, { type: 'EXPENSE', category: 'EVENT_COSTS', amount: 5, description: 'x', eventId: quiz.id }, otherMgr.token);
  check("can't link an entry to another club's event", s === 400);
  [s] = await call('POST', `/clubs/${club.id}/manage/finance/transactions`, { type: 'INCOME', category: 'TICKET_SALES', amount: 10, description: 'fake' }, treasurer.token);
  check("automatic categories can't be typed in", s === 400);

  // --- Who can see the money
  [s] = await call('GET', `/clubs/${club.id}/manage/finance/summary`, null, volunteer.token);
  check('volunteers cannot see finance (403)', s === 403);
  [s] = await call('GET', `/clubs/${club.id}/manage/finance/summary`, null, otherTreasurer.token);
  check("another club's treasurer cannot see this club's money (403)", s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/finance/summary`, null, treasurer.token);
  check('summary: in 2060, out 1500, balance 560', j.totalIncome === 2060 && j.totalExpense === 1500 && j.balance === 560, { in: j.totalIncome, out: j.totalExpense, bal: j.balance });
  check('event P&L for the quiz', j.events.find((e) => e.id === quiz.id)?.profit === -1440);
  [s, j] = await call('GET', `/clubs/${other.id}/manage/finance/summary`, null, otherTreasurer.token);
  check("the other club's books are separate (empty)", j.totalIncome === 0 && j.balance === 0);
  [s, j] = await call('GET', `/clubs/${club.id}/manage/finance/transactions.csv`, null, treasurer.token);
  check('CSV export', s === 200 && j.includes('Quiz prizes'));
  [s] = await call('DELETE', `/clubs/${other.id}/manage/finance/transactions/${manualId}`, null, otherTreasurer.token);
  check("can't delete another club's entry", s === 404);

  // --- Expense claims (club staff submit; manager/treasurer review; not your own)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'receipt.png');
  const up = await fetch(`http://localhost:${process.env.PORT || 5000}/api/uploads`, { method: 'POST', headers: { Authorization: `Bearer ${volunteer.token}` }, body: form });
  const upload = await up.json();
  check('upload a receipt photo', up.status === 201 && /^\/uploads\//.test(upload.url));

  [s] = await call('POST', `/clubs/${club.id}/claims`, { title: 'x', amount: 10, receiptUrl: upload.url }, member.token);
  check('plain members cannot submit claims (403)', s === 403);
  [s, j] = await call('POST', `/clubs/${club.id}/claims`, { title: `${TAG} Decorations`, amount: 450, category: 'EVENT_COSTS', eventId: quiz.id, receiptUrl: upload.url }, volunteer.token);
  check('volunteer submits a claim', s === 201 && j.claim.clubId === club.id);
  const claimId = j.claim.id;
  check('manager and treasurer notified', (await db.Notification.count({ where: { userId: [manager.id, treasurer.id], title: { [require('sequelize').Op.like]: 'New expense to review%' } } })) === 2);
  [s] = await call('POST', `/clubs/${other.id}/manage/claims/${claimId}/review`, { decision: 'APPROVED' }, otherTreasurer.token);
  check("another club's treasurer can't review it", s === 404);
  [s, j] = await call('POST', `/clubs/${club.id}/manage/claims/${claimId}/review`, { decision: 'APPROVED' }, treasurer.token);
  check('treasurer approves', j.claim?.status === 'APPROVED');
  [s, j] = await call('POST', `/clubs/${club.id}/manage/claims/${claimId}/pay`, { method: 'UPI' }, treasurer.token);
  check('treasurer pays → reimbursement in the ledger', j.claim?.status === 'PAID' && (await db.LedgerEntry.count({ where: { claimId, clubId: club.id, category: 'REIMBURSEMENT' } })) === 1);
  [s, j] = await call('POST', `/clubs/${club.id}/claims`, { title: `${TAG} Treasurer taxi`, amount: 100, receiptUrl: upload.url }, treasurer.token);
  [s] = await call('POST', `/clubs/${club.id}/manage/claims/${j.claim.id}/review`, { decision: 'APPROVED' }, treasurer.token);
  check('nobody approves their own claim', s === 403);
  [s, j] = await call('GET', '/me/claims', null, volunteer.token);
  check('volunteer sees their claim, with the club', j.claims.some((c) => c.id === claimId && c.status === 'PAID' && c.club.id === club.id));

  // --- Report & dashboard
  [s, j] = await call('GET', `/clubs/${club.id}/manage/reports/semester`, null, treasurer.token);
  check('semester report for the club', s === 200 && j.club.id === club.id && j.membership.activeMembers === 4 && j.events.some((e) => e.id === quiz.id));
  [s] = await call('GET', `/clubs/${club.id}/manage/reports/semester`, null, volunteer.token);
  check('reports are for manager/treasurer only (403)', s === 403);
  [s, j] = await call('GET', `/clubs/${club.id}/manage`, null, volunteer.token);
  check('volunteer dashboard has no money figures', s === 200 && j.finance === null && j.can.staff && !j.can.money);
  [s, j] = await call('GET', `/clubs/${club.id}/manage`, null, manager.token);
  check('manager dashboard: counts, to-dos and money', j.counts.members === 4 && j.finance.balance === 110 && typeof j.todo.claimsToReview === 'number', { counts: j.counts, bal: j.finance?.balance });
  [s] = await call('GET', `/clubs/${club.id}/manage`, null, collegeStudent.token);
  check('non-staff cannot open the club workspace (403)', s === 403);

  // --- College Head: overview across clubs
  await call('POST', `/clubs/${other.id}/manage/finance/transactions`, { type: 'INCOME', category: 'SPONSORSHIP', amount: 3000, description: `${TAG} Camera shop sponsor` }, otherTreasurer.token);
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage/finance`, null, A.head.token);
  const coding = j.clubs.find((c) => c.clubId === club.id);
  const photo = j.clubs.find((c) => c.clubId === other.id);
  check('College Head sees money per club and in total', coding.balance === 110 && photo.balance === 3000 && j.total.balance === 3110, { coding, photo, total: j.total.balance });
  [s, j] = await call('GET', `/clubs/${club.id}/manage/finance/summary`, null, A.head.token);
  check("College Head can open any club's books", s === 200);
  [s] = await call('GET', `/colleges/${A.college.id}/manage/finance`, null, w.B.head.token);
  check("another college's head cannot (403)", s === 403);
  [s, j] = await call('GET', `/colleges/${A.college.id}/manage`, null, A.head.token);
  check('college dashboard counts', j.counts.clubs >= 2 && j.counts.students >= 6 && j.counts.pendingStudents >= 1, j.counts);

  // --- Notifications
  [s, j] = await call('GET', '/notifications', null, volunteer.token);
  check('volunteer has unread notifications', j.unread >= 2);
  await call('POST', '/notifications/read-all', {}, volunteer.token);
  [s, j] = await call('GET', '/notifications', null, volunteer.token);
  check('mark all read', j.unread === 0);

  fs.rmSync(path.join(__dirname, '..', 'uploads', path.basename(upload.url)), { force: true });
});
