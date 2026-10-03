// Platform Admin: /api/platform/...
const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { platformGuard } = require('../middleware/scope');
const platform = require('../controllers/platformController');
const support = require('../controllers/supportController');

router.use(protect, platformGuard);

router.get('/stats', platform.stats);
router.get('/reports', platform.reports);
router.get('/settings', platform.settings);
router.get('/support', support.platformInbox);
router.post('/support/:requestId/resolve', support.platformResolve);
router.get('/colleges', platform.listColleges);
router.post('/colleges', platform.createCollege);
router.patch('/colleges/:id', platform.updateCollege);
router.post('/colleges/:id/heads', platform.addHead);
router.delete('/colleges/:id/heads/:userId', platform.removeHead);
router.get('/users', platform.listUsers);
router.patch('/users/:id', platform.updateUser);
router.post('/users/:id/reset-password', platform.resetPassword);

module.exports = router;
