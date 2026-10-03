// Everything inside one club: /api/clubs/:clubId/...
// clubGuard(cap) loads the club and checks the person's standing in it:
//   staff   → club volunteers, treasurer, managers
//   view    → club staff + the College Head (open the workspace)
//   oversee → managers + the College Head (read manager pages)
//   finance → manager, treasurer + the College Head (finance, reports, expense management)
//   money   → manager, treasurer (write to the books)
//   manage  → managers (change the club)
const router = require('express').Router({ mergeParams: true });
const { protect } = require('../middleware/auth');
const { clubGuard } = require('../middleware/scope');
const clubs = require('../controllers/clubController');
const manage = require('../controllers/clubManageController');
const events = require('../controllers/eventController');
const shop = require('../controllers/shopController');
const news = require('../controllers/announcementController');
const fundraisers = require('../controllers/fundraiserController');
const finance = require('../controllers/financeController');
const reports = require('../controllers/reportController');

const staff = [protect, clubGuard('staff')];
const view = [protect, clubGuard('view')];
const oversee = [protect, clubGuard('oversee')];
const fin = [protect, clubGuard('finance')];
const money = [protect, clubGuard('money')];
const mgr = [protect, clubGuard('manage')];

// ---------- Club workspace (staff and College Head) ----------
router.get('/manage', view, manage.dashboard);
router.get('/verify', staff, clubs.verifyCard);
router.get('/fundraisers', view, fundraisers.list);
router.get('/fundraisers/:fundraiserId', view, fundraisers.detail);
router.post('/claims', view, finance.submitClaim); // "My Expenses": club staff and the College Head
router.get('/finance/options', view, finance.linkOptions);
router.get('/manage/assignees', view, manage.assignees);

// ---------- Members, volunteers and plans ----------
router.patch('/manage/settings', mgr, manage.updateSettings);
router.get('/manage/members', oversee, manage.listMembers);
router.post('/manage/members', mgr, manage.addMember);
router.get('/manage/members/:memberId', oversee, manage.memberDetail);
router.patch('/manage/members/:memberId', mgr, manage.changeRole);
router.delete('/manage/members/:memberId', mgr, manage.removeMember);
router.post('/manage/members/:memberId/decision', mgr, manage.decide);
router.post('/manage/members/:memberId/dues', money, manage.recordDues);
router.get('/manage/plans', oversee, manage.listPlans);
router.post('/manage/plans', mgr, manage.createPlan);
router.patch('/manage/plans/:planId', mgr, manage.updatePlan);
router.delete('/manage/plans/:planId', mgr, manage.deletePlan);

// ---------- Events, volunteers and participants ----------
router.get('/manage/events', oversee, events.adminList);
router.post('/manage/events', mgr, events.create);
router.patch('/manage/events/:eventId', mgr, events.update);
router.delete('/manage/events/:eventId', mgr, events.remove);
router.get('/manage/events/:eventId/report', oversee, events.report);
router.get('/manage/events/:eventId/tickets', oversee, events.tickets);
router.post('/manage/events/:eventId/cancel', mgr, events.cancel);
router.get('/manage/events/:eventId/volunteers', oversee, events.listVolunteers);
router.post('/manage/events/:eventId/volunteers', mgr, events.addVolunteer);
router.post('/manage/events/:eventId/volunteers/:userId/decision', mgr, events.decideVolunteer);
router.delete('/manage/events/:eventId/volunteers/:userId', mgr, events.removeVolunteer);
router.get('/manage/participants', oversee, events.participants);
router.get('/manage/volunteers', oversee, events.clubVolunteers);
router.post('/manage/tickets/:ticketId/refund', mgr, events.refundTicket);

// ---------- Shop ----------
router.get('/manage/products', mgr, shop.adminList);
router.post('/manage/products', mgr, shop.create);
router.patch('/manage/products/:productId', mgr, shop.update);
router.delete('/manage/products/:productId', mgr, shop.remove);
router.get('/manage/orders', mgr, shop.adminOrders);
router.patch('/manage/orders/:orderId', mgr, shop.setStatus);
router.post('/manage/orders/:orderId/refund', mgr, shop.refund);

// ---------- Announcements & mailing list ----------
router.get('/manage/announcements', mgr, news.adminList);
router.post('/manage/announcements', mgr, news.create);
router.patch('/manage/announcements/:announcementId', mgr, news.update);
router.post('/manage/announcements/:announcementId/publish', mgr, news.publish);
router.delete('/manage/announcements/:announcementId', mgr, news.remove);
router.get('/manage/subscribers', mgr, news.subscribers);

// ---------- Fundraisers & Task Management ----------
router.post('/manage/fundraisers', mgr, fundraisers.create);
router.patch('/manage/fundraisers/:fundraiserId', mgr, fundraisers.update);
router.delete('/manage/fundraisers/:fundraiserId', mgr, fundraisers.remove);
router.post('/manage/fundraisers/:fundraiserId/tasks', mgr, fundraisers.addTask);
router.post('/manage/fundraisers/:fundraiserId/income', money, fundraisers.addIncome);
router.get('/manage/tasks', oversee, fundraisers.clubTasks);
router.post('/manage/tasks', mgr, fundraisers.createTask);
router.patch('/manage/tasks/:taskId', mgr, fundraisers.updateTask);
router.delete('/manage/tasks/:taskId', mgr, fundraisers.removeTask);

// ---------- Money: finance, reports, Expense Management ----------
router.get('/manage/finance/summary', fin, finance.summary);
router.get('/manage/finance/transactions', fin, finance.transactions);
router.get('/manage/finance/transactions.csv', fin, finance.transactionsCsv);
router.post('/manage/finance/transactions', money, finance.addEntry);
router.delete('/manage/finance/transactions/:entryId', money, finance.removeEntry);
router.get('/manage/claims', fin, finance.adminClaims);
router.post('/manage/claims/:claimId/review', fin, finance.reviewClaim);
router.post('/manage/claims/:claimId/pay', fin, finance.payClaim);
router.get('/manage/reports/semester', fin, reports.semester);

module.exports = router;
