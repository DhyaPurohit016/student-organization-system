// Creates the first PLATFORM ADMIN (runs the whole platform) from ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD in .env.
// Safe to run more than once: it does nothing if that admin already exists.
require('dotenv').config({ quiet: true });
const connectDB = require('../config/db');
const { sequelize, User } = require('../models');

(async () => {
  const { ADMIN_NAME = 'Club Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env first');
    process.exit(1);
  }

  await connectDB();
  const existing = await User.findOne({ where: { email: ADMIN_EMAIL.toLowerCase() } });
  if (existing) {
    console.log(`Admin already exists: ${existing.email}`);
  } else {
    await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'PLATFORM_ADMIN' });
    console.log(`Platform admin created: ${ADMIN_EMAIL}`);
  }
  await sequelize.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
