require('dotenv').config({ quiet: true });
const app = require('./app');
const connectDB = require('./config/db');
const { scheduleJobs } = require('./jobs/membershipJobs');

const PORT = process.env.PORT || 5000;

// Fail fast on a half-configured payment gateway rather than at a student's checkout
function checkPaymentConfig() {
  const provider = process.env.PAYMENT_PROVIDER || 'mock';
  if (provider === 'razorpay') {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('PAYMENT_PROVIDER=razorpay needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
    }
    const mode = process.env.RAZORPAY_KEY_ID.startsWith('rzp_live_') ? 'LIVE' : 'test';
    console.log(`Payments: Razorpay (${mode} mode)`);
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      console.warn('Warning: RAZORPAY_WEBHOOK_SECRET is not set; payments from closed browser tabs will not be picked up.');
    }
  } else {
    console.log(`Payments: ${provider === 'mock' ? 'test mode (no real money)' : provider}`);
  }
}

Promise.resolve()
  .then(checkPaymentConfig)
  .then(connectDB)
  .then(() => {
    app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
    scheduleJobs();
  })
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
