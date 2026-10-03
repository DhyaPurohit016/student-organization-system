const router = require('express').Router();
const { register, login, me, changePassword, updateProfile } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, me);
router.patch('/password', protect, changePassword);
router.patch('/profile', protect, updateProfile);

module.exports = router;
