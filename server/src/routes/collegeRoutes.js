// College Head: /api/colleges/:collegeId/manage/...
const router = require('express').Router({ mergeParams: true });
const { protect } = require('../middleware/auth');
const { collegeGuard } = require('../middleware/scope');
const college = require('../controllers/collegeController');
const support = require('../controllers/supportController');

router.use(protect, collegeGuard);

router.get('/', college.overview);
router.patch('/', college.updateCollege);
router.get('/clubs', college.listClubs);
router.post('/clubs', college.createClub);
router.patch('/clubs/:clubId', college.updateClub);
router.post('/clubs/:clubId/managers', college.addManager);
router.delete('/clubs/:clubId/managers/:userId', college.removeManager);
router.get('/people', college.people);
router.get('/expenses', college.expenses);
router.get('/support', support.collegeInbox);
router.post('/support/:requestId/resolve', support.collegeResolve);
router.get('/students', college.listStudents);
router.post('/students/:userId/decision', college.decideStudent);
router.get('/events', college.listEvents);
router.get('/finance', college.finance);
router.get('/announcements', college.listAnnouncements);
router.post('/announcements', college.createAnnouncement);
router.post('/announcements/:id/publish', college.publishAnnouncement);
router.delete('/announcements/:id', college.deleteAnnouncement);

module.exports = router;
