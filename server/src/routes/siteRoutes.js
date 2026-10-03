// Public website + "me" routes. Club-management routes are in clubRoutes.js, college in
// collegeRoutes.js, platform in platformRoutes.js.
const router = require('express').Router();
const { protect, optionalAuth } = require('../middleware/auth');
const { singleFile } = require('../middleware/upload');
const clubs = require('../controllers/clubController');
const events = require('../controllers/eventController');
const shop = require('../controllers/shopController');
const news = require('../controllers/announcementController');
const fundraisers = require('../controllers/fundraiserController');
const finance = require('../controllers/financeController');
const notifications = require('../controllers/notificationController');
const me = require('../controllers/meController');
const support = require('../controllers/supportController');

// ---------- Public website (logged-in visitors see a bit more) ----------
router.get('/colleges', clubs.listColleges);
router.get('/colleges/:collegeId', clubs.getCollege);
router.get('/clubs', clubs.listClubs);
router.get('/clubs/:clubId', optionalAuth, clubs.getClub);
router.get('/clubs/:clubId/products', optionalAuth, clubs.products);
router.post('/clubs/:clubId/mailing-list', clubs.subscribe);
router.post('/mailing-list/unsubscribe', clubs.unsubscribe);
router.get('/events', optionalAuth, events.listPublic);
router.get('/events/:id', optionalAuth, events.getPublic);
router.get('/announcements', news.listPublic);

// ---------- Logged in ----------
router.post('/clubs/:clubId/join', protect, clubs.join);
router.post('/clubs/:clubId/leave', protect, clubs.leave);
router.post('/clubs/:clubId/dues/checkout', protect, clubs.duesCheckout);

router.get('/events/:id/quote', protect, events.getQuote);
router.post('/events/:id/checkout', protect, events.checkout);
router.post('/orders', protect, shop.createOrder);
router.get('/announcements/feed', protect, news.feed);

router.get('/me/context', protect, me.context);
router.get('/me/clubs/:clubId/card', protect, me.card);
router.get('/me/tickets', protect, events.myTickets);
router.get('/me/orders', protect, shop.myOrders);
router.get('/me/tasks', protect, fundraisers.myTasks);
router.get('/me/claims', protect, finance.myClaims);
router.get('/me/volunteering', protect, events.myVolunteering);
router.get('/me/volunteering/:id/participants', protect, events.volunteerParticipants);
router.get('/me/support', protect, support.mine);

// Helping Out: club volunteers offer to help at events; the club manager approves
router.get('/helping-out', protect, events.helpingOut);
router.post('/events/:id/volunteer', protect, events.offerToHelp);
router.delete('/events/:id/volunteer', protect, events.withdrawOffer);

// Help & Support
router.post('/support', protect, support.create);

router.patch('/tasks/:taskId/status', protect, fundraisers.setStatus); // assignee or club manager (checked inside)
router.post('/tasks/:taskId/claim', protect, fundraisers.claim); // club staff (checked inside)

// Door check-in: allowed per event (club manager, College Head, or event volunteer with check-in rights)
router.get('/checkin/events', protect, events.checkinEvents);
router.get('/checkin/events/:id/stats', protect, events.checkinStats);
router.post('/checkin', protect, events.checkIn);

router.get('/notifications', protect, notifications.list);
router.post('/notifications/read-all', protect, notifications.readAll);
router.post('/notifications/:id/read', protect, notifications.readOne);

// Uploads (receipts, product photos, posters, logos): returns { url }
router.post('/uploads', protect, singleFile, (req, res) => res.status(201).json({ url: `/uploads/${req.file.filename}` }));

module.exports = router;
