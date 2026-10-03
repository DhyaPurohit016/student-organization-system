const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { notFound, errorHandler } = require('./middleware/error');
const { UPLOAD_DIR } = require('./middleware/upload');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));

// Razorpay webhook needs the raw body to check its signature, so it's registered before express.json()
app.post('/api/payments/webhook/razorpay', express.raw({ type: '*/*', limit: '1mb' }), require('./controllers/paymentController').razorpayWebhook);

app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/platform', require('./routes/platformRoutes')); // Platform Admin
app.use('/api/colleges/:collegeId/manage', require('./routes/collegeRoutes')); // College Head
app.use('/api/clubs/:clubId', require('./routes/clubRoutes')); // club staff / treasurer / manager
app.use('/api', require('./routes/siteRoutes')); // public website + "me"

app.use(notFound);
app.use(errorHandler);

module.exports = app;
