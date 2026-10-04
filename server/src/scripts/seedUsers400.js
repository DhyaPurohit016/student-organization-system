// Adds 400 more fictional, development-only users (see src/data/sampleUsers400.js) across two sample
// colleges and six clubs. Safe to run again: existing users, colleges, clubs and roles are kept.
// Run from server/ with: npm run seed:users400
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const db = require('../models');
const sample = require('../data/sampleUsers400');

if (process.env.NODE_ENV === 'production') {
  console.error('seed:users400 is for development only.');
  process.exit(1);
}

async function seedUsers400() {
  await connectDB();

  const colleges = {};
  for (const data of [sample.college, sample.otherCollege]) {
    const [college] = await db.College.findOrCreate({ where: { code: data.code }, defaults: data });
    colleges[data.code] = college;
  }
  const home = colleges[sample.college.code];

  const clubByCode = new Map();
  for (const data of sample.clubs) {
    const [club] = await db.Club.findOrCreate({
      where: { collegeId: home.id, code: data.code },
      defaults: { ...data, collegeId: home.id },
    });
    clubByCode.set(data.code, club);
  }

  // Users (bulkCreate skips the password hook, so hash the shared demo password once)
  const password = process.env.DEMO_PASSWORD || 'Demo@12345';
  const emails = sample.users.map((u) => u.email);
  const existing = new Set((await db.User.findAll({ where: { email: emails }, attributes: ['email'] })).map((u) => u.email));
  const missing = sample.users.filter((u) => !existing.has(u.email));
  if (missing.length) {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.User.bulkCreate(
      missing.map((u) => ({
        name: u.name,
        email: u.email,
        password: passwordHash,
        studentId: u.studentId,
        phone: u.phone,
        emailOptIn: u.emailOptIn,
        collegeId: u.where ? colleges[u.where].id : null,
        collegeStatus: u.collegeStatus,
        role: 'USER',
      }))
    );
  }
  const userByEmail = new Map((await db.User.findAll({ where: { email: emails } })).map((u) => [u.email, u]));

  // College Heads
  const heads = sample.users.filter((u) => u.head);
  for (const h of heads) {
    await db.CollegeAdmin.findOrCreate({ where: { collegeId: home.id, userId: userByEmail.get(h.email).id }, defaults: {} });
  }
  const headUser = userByEmail.get(heads[0].email);

  // Club roles and join requests
  const clubIds = [...clubByCode.values()].map((c) => c.id);
  const taken = new Set((await db.ClubMember.findAll({ where: { clubId: clubIds }, attributes: ['clubId', 'userId'] })).map((r) => `${r.clubId}:${r.userId}`));
  const rows = sample.users
    .filter((u) => u.clubRole)
    .map((u) => ({ u, user: userByEmail.get(u.email), club: clubByCode.get(u.clubCode) }))
    .filter(({ user, club }) => !taken.has(`${club.id}:${user.id}`))
    .map(({ u, user, club }) =>
      u.clubStatus === 'PENDING'
        ? { clubId: club.id, userId: user.id, role: 'MEMBER', status: 'PENDING', message: u.message }
        : {
            clubId: club.id,
            userId: user.id,
            role: u.clubRole,
            status: 'ACTIVE',
            decidedById: headUser.id,
            decidedAt: new Date(),
            joinedAt: new Date(),
            memberNumber: `S400-${club.code}-${String(u.number).padStart(4, '0')}`,
            qrToken: crypto.randomBytes(24).toString('hex'),
          }
    );
  if (rows.length) await db.ClubMember.bulkCreate(rows);

  console.log(`Sample 400 users ready (${sample.college.name}, ${sample.otherCollege.name}, ${sample.clubs.length} clubs):`);
  for (const [category, count] of Object.entries(sample.counts)) console.log(`  ${category.padEnd(16)} ${count}`);
  console.log(`Created ${missing.length} new users and ${rows.length} club roles / join requests.`);
  console.log('Logins: user001@sample400.demo.test … user400@sample400.demo.test, password DEMO_PASSWORD (default Demo@12345).');
}

seedUsers400()
  .catch((err) => {
    console.error('Sample 400 users seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
