// Adds 500 fictional, development-only users and their sample organization roles.
// Run from server/ with: npm run seed:users
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const db = require('../models');
const sampleUsers = require('../data/sampleUsers');
const seedCatalog = require('./seedCatalog');

if (process.env.NODE_ENV === 'production') {
  console.error('seed:users is for development only.');
  process.exit(1);
}

async function seedUsers() {
  await connectDB();

  const [college] = await db.College.findOrCreate({
    where: { code: sampleUsers.college.code },
    defaults: {
      ...sampleUsers.college,
      approveStudents: false,
    },
  });

  const clubByCode = new Map();
  for (const clubData of sampleUsers.clubs) {
    const [club] = await db.Club.findOrCreate({
      where: { collegeId: college.id, code: clubData.code },
      defaults: { ...clubData, collegeId: college.id },
    });
    clubByCode.set(clubData.code, club);
  }

  const password = process.env.DEMO_PASSWORD || 'Demo@12345';
  const emails = sampleUsers.users.map((user) => user.email);
  const existingUsers = await db.User.findAll({ where: { email: emails } });
  const usersByEmail = new Map(existingUsers.map((user) => [user.email, user]));
  const missingProfiles = sampleUsers.users.filter((user) => !usersByEmail.has(user.email));

  if (missingProfiles.length) {
    // bulkCreate skips beforeSave, so hash the shared demo password once for all 500 accounts.
    const passwordHash = await bcrypt.hash(password, 12);
    await db.User.bulkCreate(
      missingProfiles.map((user) => ({
        name: user.name,
        email: user.email,
        password: passwordHash,
        studentId: user.studentId,
        collegeId: college.id,
        collegeStatus: 'VERIFIED',
        role: 'USER',
      }))
    );
  }

  const seededUsers = await db.User.findAll({ where: { email: emails } });
  const usersById = new Map(seededUsers.map((user) => [user.email, user]));
  const heads = sampleUsers.users.filter((user) => user.category === 'COLLEGE_HEAD');
  for (const head of heads) {
    const user = usersById.get(head.email);
    await db.CollegeAdmin.findOrCreate({
      where: { collegeId: college.id, userId: user.id },
      defaults: { collegeId: college.id, userId: user.id },
    });
  }

  const clubIds = [...clubByCode.values()].map((club) => club.id);
  const currentRoles = await db.ClubMember.findAll({
    where: { clubId: clubIds },
    attributes: ['clubId', 'userId'],
  });
  const existingRoleKeys = new Set(currentRoles.map((record) => `${record.clubId}:${record.userId}`));
  const headUser = usersById.get(heads[0].email);
  const roleRows = sampleUsers.users
    .filter((profile) => profile.clubRole)
    .map((profile) => {
      const user = usersById.get(profile.email);
      const club = clubByCode.get(profile.clubCode);
      return { profile, user, club };
    })
    .filter(({ user, club }) => !existingRoleKeys.has(`${club.id}:${user.id}`))
    .map(({ profile, user, club }) => ({
      clubId: club.id,
      userId: user.id,
      role: profile.clubRole,
      status: 'ACTIVE',
      decidedById: headUser.id,
      decidedAt: new Date(),
      joinedAt: new Date(),
      memberNumber: `S500-${club.code}-${String(profile.number).padStart(4, '0')}`,
      qrToken: crypto.randomBytes(24).toString('hex'),
    }));

  if (roleRows.length) await db.ClubMember.bulkCreate(roleRows);

  await seedCatalog();

  console.log(`Sample users ready: ${sampleUsers.users.length} total.`);
  for (const [category, count] of Object.entries(sampleUsers.roleCounts)) {
    console.log(`  ${category}: ${count}`);
  }
  console.log(`Created ${missingProfiles.length} new users and ${roleRows.length} new club roles.`);
  console.log('Sample accounts use DEMO_PASSWORD (default: Demo@12345).');
}

seedUsers()
  .catch((err) => {
    console.error('Sample user seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize.close();
  });
