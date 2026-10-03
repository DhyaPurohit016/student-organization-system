const router = require('express').Router();
const { listMine, getOne, confirm, cancel } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/me', listMine);
router.get('/:id', getOne);
router.post('/:id/confirm', confirm);
router.post('/:id/cancel', cancel);

module.exports = router;
