// Fills a DEVELOPMENT database with example colleges, clubs, people and activity so every screen
// has something to show. Every demo account uses DEMO_PASSWORD (default "Demo@12345").
//
//   platform@demo.test   Platform Admin
//   head@ldce.demo       College Head, LDCE (approves students)
//   head@nirma.demo      College Head, Nirma (trusts students)
//   krupa@ldce.demo      Coding Club manager            amit@ldce.demo   Robotics Club manager
//   tara@ldce.demo       Coding Club treasurer          priya@ldce.demo  Coding Club volunteer (door check-in)
//   rahul@ldce.demo      Coding Club member             cal@ldce.demo    LDCE student, not in Coding Club
//   pat@ldce.demo        chose LDCE, waiting for approval
//   neha@nirma.demo      Nirma student (other college)  john@guest.demo  guest, no college
//
// Refuses to run when NODE_ENV=production. Skips if the demo data already exists.
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const connectDB = require('../config/db');
const db = require('../models');
const clubMemberService = require('../services/clubMemberService');
const membershipService = require('../services/membershipService');
const paymentService = require('../services/paymentService');
const ticketService = require('../services/ticketService');
const shopService = require('../services/shopService');
const ledgerService = require('../services/ledgerService');
const { handlePaid } = require('../services/paymentHandlers');
const seedCatalog = require('./seedCatalog');

if (process.env.NODE_ENV === 'production') {
  console.error('seed:demo is for development only.');
  process.exit(1);
}

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@12345';
const days = (n, h = 18) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, 0, 0, 0);
  return d;
};
const dateOnly = (n) => days(n).toISOString().slice(0, 10);

async function user(name, email, extra = {}) {
  const [u] = await db.User.findOrCreate({ where: { email }, defaults: { name, email, password: PASSWORD, role: 'USER', ...extra } });
  return u;
}

const paidOnline = (paymentId, userId) => paymentService.confirmOnlinePayment(paymentId, userId, {}, handlePaid);

(async () => {
  await connectDB();
  if (await db.User.findOne({ where: { email: 'platform@demo.test' } })) {
    console.log('Demo accounts already exist. Ensuring sample clubs, events and shop products are present.');
    await seedCatalog();
    return db.sequelize.close();
  }

  // --- Platform & colleges
  const platform = await user('Platform Admin', 'platform@demo.test', { role: 'PLATFORM_ADMIN' });
  const ldce = await db.College.create({ name: 'L.D. College of Engineering', code: 'LDCE', city: 'Ahmedabad', approveStudents: true, createdById: platform.id });
  const nirma = await db.College.create({ name: 'Nirma University', code: 'NIRMA', city: 'Ahmedabad', approveStudents: false, createdById: platform.id });
  const ldceHead = await user('Dr. Mehta (LDCE Head)', 'head@ldce.demo', { collegeId: ldce.id, collegeStatus: 'VERIFIED' });
  const nirmaHead = await user('Dr. Shah (Nirma Head)', 'head@nirma.demo', { collegeId: nirma.id, collegeStatus: 'VERIFIED' });
  await db.CollegeAdmin.bulkCreate([
    { collegeId: ldce.id, userId: ldceHead.id, assignedById: platform.id },
    { collegeId: nirma.id, userId: nirmaHead.id, assignedById: platform.id },
  ]);

  // --- People
  const L = { collegeId: ldce.id, collegeStatus: 'VERIFIED' };
  const krupa = await user('Krupa Patel', 'krupa@ldce.demo', { ...L, studentId: 'LD21CE014' });
  const amit = await user('Amit Desai', 'amit@ldce.demo', { ...L, studentId: 'LD21ME031' });
  const tara = await user('Tara Menon', 'tara@ldce.demo', { ...L, studentId: 'LD22CE009' });
  const priya = await user('Priya Shah', 'priya@ldce.demo', { ...L, studentId: 'LD22IT017' });
  const rahul = await user('Rahul Patel', 'rahul@ldce.demo', { ...L, studentId: 'LD23CE112', phone: '9876543210' });
  const cal = await user('Cal Joshi', 'cal@ldce.demo', { ...L, studentId: 'LD23EC140' });
  const sara = await user('Sara Khan', 'sara@ldce.demo', { ...L, studentId: 'LD23CE077' });
  const kabir = await user('Kabir Singh', 'kabir@ldce.demo', { ...L, studentId: 'LD23CE081' });
  await user('Pat Trivedi', 'pat@ldce.demo', { collegeId: ldce.id, collegeStatus: 'PENDING' });
  const neha = await user('Neha Iyer', 'neha@nirma.demo', { collegeId: nirma.id, collegeStatus: 'VERIFIED', studentId: 'NU22BCE140' });
  const vikram = await user('Vikram Rao', 'vikram@nirma.demo', { collegeId: nirma.id, collegeStatus: 'VERIFIED' });
  const john = await user('John Mathew', 'john@guest.demo');

  // --- Clubs and roles
  const coding = await db.Club.create({ collegeId: ldce.id, name: 'Coding Club', code: 'CODE', description: 'Hackathons, coding contests and weekly problem-solving sessions.', createdById: ldceHead.id });
  const robotics = await db.Club.create({ collegeId: ldce.id, name: 'Robotics Club', code: 'ROBO', description: 'Build, break and race robots.', createdById: ldceHead.id });
  const cultural = await db.Club.create({ collegeId: ldce.id, name: 'Cultural Club', code: 'CULT', description: 'Music, dance and drama. Membership dues apply.', createdById: ldceHead.id });
  const sports = await db.Club.create({ collegeId: nirma.id, name: 'Sports Club', code: 'SPRT', description: 'Football, cricket and inter-college tournaments.', createdById: nirmaHead.id });

  const add = (club, u, role) => clubMemberService.addByEmail(club, u.email, role, ldceHead);
  await add(coding, krupa, 'MANAGER');
  await add(coding, tara, 'TREASURER');
  await add(coding, priya, 'VOLUNTEER');
  await add(coding, rahul, 'MEMBER');
  await add(coding, sara, 'MEMBER');
  await add(robotics, amit, 'MANAGER');
  await add(robotics, krupa, 'VOLUNTEER'); // same person, different role in another club
  await add(robotics, kabir, 'MEMBER');
  await add(cultural, amit, 'MANAGER');
  await add(cultural, sara, 'MEMBER');
  await clubMemberService.addByEmail(sports, nirmaHead.email, 'MANAGER', nirmaHead);
  await clubMemberService.addByEmail(sports, vikram.email, 'MEMBER', nirmaHead);
  // A pending join request for Krupa to approve
  await db.ClubMember.create({ clubId: coding.id, userId: cal.id, role: 'MEMBER', status: 'PENDING', message: 'I want to join the hackathon team!' });

  // Cultural Club charges dues
  const culturalPlan = await db.MembershipPlan.create({ clubId: cultural.id, name: 'Annual', price: 300, durationType: 'YEAR_END', benefits: { ticketDiscountPercent: 25, merchDiscountPercent: 10, perks: ['Free entry to open-mic nights'] } });
  await cultural.update({ requiresDues: true });
  await db.sequelize.transaction(async (t) => {
    const m = await membershipService.createPending(sara.id, culturalPlan.id, t);
    const p = await paymentService.recordManualPayment({ clubId: cultural.id, userId: sara.id, amount: m.planPrice, purpose: 'MEMBERSHIP', referenceId: m.id, method: 'CASH', recordedById: amit.id, note: 'Paid at the stall' }, t);
    await membershipService.activate(m.id, p.id, t);
  });

  // --- Events
  const ev = (club, fields) => db.Event.create({ clubId: club.id, collegeId: club.collegeId, status: 'PUBLISHED', createdById: krupa.id, maxPerOrder: 5, ...fields });
  const hackathon = await ev(coding, { title: 'Open Hackathon 2026', visibility: 'PUBLIC', venue: 'LDCE Main Auditorium', description: '24-hour hackathon open to every college. Teams of up to 4.', startsAt: days(9, 9), endsAt: days(10, 9), capacity: 120, guestPrice: 300, collegePrice: 150, memberPrice: 100, registrationDeadline: days(8, 23), volunteersNeeded: 5 });
  const internal = await ev(coding, { title: 'Internal Coding Competition', visibility: 'COLLEGE', venue: 'CE Lab 3', description: 'For LDCE students only.', startsAt: days(4, 14), endsAt: days(4, 17), capacity: 60, guestPrice: 50, memberPrice: 0, volunteersNeeded: 2 });
  const meetup = await ev(coding, { title: 'Members Meetup & Pizza', visibility: 'CLUB', venue: 'Club Room', startsAt: days(2, 17), endsAt: days(2, 19), capacity: 30, guestPrice: 0 });
  const pastTalk = await ev(coding, { title: 'Intro to Git (talk)', visibility: 'PUBLIC', venue: 'Seminar Hall', startsAt: days(-14, 15), endsAt: days(-14, 17), capacity: 80, guestPrice: 0 });
  const roboWars = await ev(robotics, { volunteersNeeded: 3, title: 'Robo Wars', visibility: 'PUBLIC', venue: 'LDCE Ground', startsAt: days(15, 10), endsAt: days(15, 17), capacity: 200, guestPrice: 200, collegePrice: 100, memberPrice: 50, createdById: amit.id });
  await ev(sports, { title: 'Inter-college Football Fest', visibility: 'PUBLIC', venue: 'Nirma Sports Complex', startsAt: days(20, 8), endsAt: days(20, 18), capacity: 300, guestPrice: 100, collegePrice: 50, createdById: nirmaHead.id });
  await db.Event.create({ clubId: coding.id, collegeId: ldce.id, title: 'Web Dev Bootcamp (draft)', visibility: 'PUBLIC', venue: 'CE Lab 1', startsAt: days(25, 10), capacity: 40, guestPrice: 100, status: 'DRAFT', createdById: krupa.id });

  // Registrations
  for (const [u, qty] of [[rahul, 2], [sara, 1], [cal, 1], [neha, 2], [john, 1]]) {
    const r = await ticketService.checkout(hackathon.id, u, { quantity: qty });
    if (r.payment) await paidOnline(r.payment.id, u.id);
  }
  for (const u of [rahul, cal, kabir]) {
    const r = await ticketService.checkout(internal.id, u, { quantity: 1 });
    if (r.payment) await paidOnline(r.payment.id, u.id);
  }
  await ticketService.checkout(meetup.id, rahul, { quantity: 1 });
  // Past talk: attendance already recorded
  const past = await db.Ticket.bulkCreate(
    [rahul, sara, cal, kabir, neha, john].map((u) => ({
      eventId: pastTalk.id, userId: u.id, ticketCode: `TKT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, qrToken: crypto.randomBytes(16).toString('hex'),
      holderName: u.name, priceType: 'GUEST', registrationType: u.collegeId === ldce.id ? (u.id === rahul.id || u.id === sara.id ? 'CLUB_MEMBER' : 'COLLEGE_STUDENT') : u.collegeId ? 'EXTERNAL_STUDENT' : 'GUEST', price: 0, status: 'VALID', createdAt: days(-20),
    }))
  );
  for (const t of past.slice(0, 5)) await t.update({ checkedInAt: days(-14, 15), checkedInById: priya.id });
  // Event volunteers
  await db.EventVolunteer.bulkCreate([
    { eventId: hackathon.id, userId: priya.id, duty: 'Registration', canCheckIn: true, assignedById: krupa.id },
    { eventId: hackathon.id, userId: tara.id, duty: 'Food', canCheckIn: false, assignedById: krupa.id },
    { eventId: internal.id, userId: priya.id, duty: 'Attendance', canCheckIn: true, assignedById: krupa.id },
    // Helping Out: Krupa (a Robotics volunteer) offered to help; Amit hasn't decided yet
    { eventId: roboWars.id, userId: krupa.id, duty: 'Arena marshal', status: 'PENDING', message: 'Free all day, can help with the arena.' },
  ]);

  // --- Shop
  const hoodie = await db.Product.create({ clubId: coding.id, name: 'Coding Club Hoodie', description: 'Black hoodie with the </> logo.', price: 800, memberPrice: 650 });
  await db.ProductVariant.bulkCreate([['S', 8], ['M', 15], ['L', 3], ['XL', 0]].map(([size, stock], i) => ({ productId: hoodie.id, size, stock, sortOrder: i })));
  const tee = await db.Product.create({ clubId: cultural.id, name: 'Cultural Fest T-shirt', description: 'White tee, festival print.', price: 400 });
  await db.ProductVariant.bulkCreate([['S', 10], ['M', 10], ['L', 10]].map(([size, stock], i) => ({ productId: tee.id, size, stock, sortOrder: i })));
  const vM = (await db.ProductVariant.findOne({ where: { productId: hoodie.id, size: 'M' } })).id;
  const vL = (await db.ProductVariant.findOne({ where: { productId: hoodie.id, size: 'L' } })).id;
  for (const [u, variantId] of [[rahul, vM], [cal, vL], [neha, vM]]) {
    const { order, payment } = await shopService.createOrder(u, [{ variantId, quantity: 1 }]);
    await paidOnline(payment.id, u.id);
    if (u === rahul) await shopService.advanceStatus(order.id, 'READY');
  }

  // --- Fundraiser
  const bake = await db.Fundraiser.create({ clubId: coding.id, title: 'Bake Sale for Hackathon Prizes', description: 'Outside the library, Friday.', eventDate: dateOnly(6), goalAmount: 6000, status: 'ACTIVE', leadId: priya.id, createdById: krupa.id });
  for (const [title, assigneeId, due, status, priority] of [
    ['Buy ingredients', priya.id, -1, 'DONE', 'HIGH'],
    ['Book the table', tara.id, -3, 'DONE', 'MEDIUM'],
    ['Bake cakes', priya.id, 5, 'IN_PROGRESS', 'HIGH'],
    ['Make posters', null, 3, 'TODO', 'MEDIUM'],
    ['Manage the cash box', null, 6, 'TODO', 'MEDIUM'],
  ]) {
    await db.Task.create({ clubId: coding.id, fundraiserId: bake.id, title, assigneeId, dueDate: dateOnly(due), status, priority, completedAt: status === 'DONE' ? new Date() : null, createdById: krupa.id });
  }
  // Event tasks (Task Management)
  for (const [title, assigneeId, due, status] of [
    ['Set up the registration desk', priya.id, 8, 'TODO'],
    ['Arrange food for 120 people', tara.id, 7, 'IN_PROGRESS'],
    ['Stage and projector setup', null, 8, 'TODO'],
  ]) {
    await db.Task.create({ clubId: coding.id, eventId: hackathon.id, title, assigneeId, dueDate: dateOnly(due), status, createdById: krupa.id });
  }
  await db.LedgerEntry.create({ clubId: coding.id, type: 'INCOME', category: 'FUNDRAISER', amount: 1850, date: days(-2, 14), description: 'Bake sale pre-orders', source: 'MANUAL', fundraiserId: bake.id, method: 'UPI', recordedById: tara.id });

  // --- Other money
  await db.LedgerEntry.bulkCreate([
    { clubId: coding.id, type: 'INCOME', category: 'OPENING_BALANCE', amount: 8000, date: days(-60, 10), description: 'Balance carried over from last year', source: 'MANUAL', method: 'BANK_TRANSFER', recordedById: tara.id },
    { clubId: coding.id, type: 'INCOME', category: 'SPONSORSHIP', amount: 10000, date: days(-10, 11), description: 'TechCorp sponsorship for the hackathon', source: 'MANUAL', eventId: hackathon.id, method: 'BANK_TRANSFER', recordedById: tara.id },
    { clubId: coding.id, type: 'EXPENSE', category: 'MERCH_STOCK', amount: 9000, date: days(-30, 12), description: 'Hoodies from printer', source: 'MANUAL', method: 'BANK_TRANSFER', recordedById: tara.id },
    { clubId: robotics.id, type: 'INCOME', category: 'OPENING_BALANCE', amount: 5000, date: days(-60, 10), description: 'Balance carried over', source: 'MANUAL', method: 'BANK_TRANSFER', recordedById: amit.id },
    { clubId: robotics.id, type: 'EXPENSE', category: 'SUPPLIES', amount: 2200, date: days(-5, 12), description: 'Motors and batteries', source: 'MANUAL', method: 'CASH', recordedById: amit.id },
  ]);
  const paid = await db.ExpenseClaim.create({ clubId: coding.id, claimantId: priya.id, title: 'Flour, sugar and butter', amount: 640, category: 'SUPPLIES', spentOn: dateOnly(-1), fundraiserId: bake.id, status: 'APPROVED', reviewedById: tara.id, reviewedAt: new Date() });
  await db.sequelize.transaction(async (t) => {
    await paid.update({ status: 'PAID', paidAt: new Date(), paidMethod: 'UPI' }, { transaction: t });
    await ledgerService.recordClaimPayment(paid, priya.name, tara.id, t);
  });
  await db.ExpenseClaim.create({ clubId: coding.id, claimantId: priya.id, title: 'Poster printing', description: '20 A3 posters', amount: 380, category: 'MARKETING', spentOn: dateOnly(0), fundraiserId: bake.id, status: 'SUBMITTED' });

  // --- Announcements
  const ann = (fields) => db.Announcement.create({ status: 'PUBLISHED', ...fields });
  await ann({ collegeId: ldce.id, clubId: coding.id, title: 'Open Hackathon registrations are live!', body: 'Students from any college can join. LDCE students ₹150, club members ₹100, others ₹300.', audience: 'PUBLIC', pinned: true, publishedAt: days(-5, 10), authorId: krupa.id });
  await ann({ collegeId: ldce.id, clubId: coding.id, title: 'Internal contest next week', body: 'LDCE students only. Register from the Events page.', audience: 'COLLEGE', publishedAt: days(-3, 10), authorId: krupa.id });
  await ann({ collegeId: ldce.id, clubId: coding.id, title: 'Members: pizza meetup Thursday', body: 'Club room, 5pm.', audience: 'MEMBERS', publishedAt: days(-2, 10), authorId: krupa.id });
  await ann({ collegeId: ldce.id, clubId: coding.id, title: 'Volunteers: hackathon briefing', body: 'Registration desk team, please arrive at 8am.', audience: 'STAFF', publishedAt: days(-1, 10), authorId: krupa.id });
  await ann({ collegeId: ldce.id, clubId: null, title: 'LDCE: exam timetable published', body: 'Check the notice board and college website.', audience: 'COLLEGE', publishedAt: days(-4, 9), authorId: ldceHead.id });
  // --- Help & Support
  await db.SupportRequest.create({ userId: rahul.id, collegeId: ldce.id, subject: 'Ticket QR does not load', message: 'My hackathon ticket shows a blank QR on my phone.' });
  await db.SupportRequest.create({ userId: john.id, collegeId: null, subject: 'How do I change my email?', message: 'I signed up with my old email address.' });
  await db.Subscriber.create({ clubId: coding.id, email: 'fan@example.com', name: 'Coding Fan', unsubscribeToken: crypto.randomBytes(24).toString('hex') });

  await seedCatalog();
  console.log('Demo data created: 2 colleges, 4 clubs, events, tickets, shop, fundraiser, money and announcements.');
  console.log(`All demo accounts use DEMO_PASSWORD (default ${process.env.DEMO_PASSWORD ? 'set in .env' : 'Demo@12345'}). See the list at the top of src/scripts/seedDemo.js.`);
  await db.sequelize.close();
})().catch(async (err) => {
  console.error('Demo seed failed:', err.message);
  await db.sequelize.close();
  process.exit(1);
});
