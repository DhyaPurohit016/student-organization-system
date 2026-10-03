// Populates each active college with a sample club directory, events, merchandise and finance data.
// The operation is idempotent and can also be run on its own with: npm run seed:catalog
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const connectDB = require('../config/db');
const db = require('../models');
const catalog = require('../data/sampleCatalog');

if (process.env.NODE_ENV === 'production') {
  console.error('seed:catalog is for development only.');
  process.exit(1);
}

const day = 24 * 60 * 60 * 1000;
const dateOnly = (value) => value.toISOString().slice(0, 10);
const receiptUrl = '/sample-receipt.svg';

function eventDates(index, now) {
  const phaseIndex = index % 30;
  let startsAt;
  if (phaseIndex < 10) {
    startsAt = new Date(now.getTime() - (phaseIndex + 1) * 7 * day);
  } else if (phaseIndex < 20) {
    startsAt = new Date(now.getTime() - (45 - (phaseIndex - 10) * 4) * 60 * 1000);
  } else {
    startsAt = new Date(now.getTime() + (phaseIndex - 19) * 2 * day);
  }
  return { startsAt, endsAt: new Date(startsAt.getTime() + 3 * 60 * 60 * 1000) };
}

async function ensureProducts(club) {
  const prefix = (name) => `${name} · ${club.code}`;
  const existing = await db.Product.findAll({ where: { clubId: club.id }, attributes: ['id', 'name'] });
  const existingNames = new Set(existing.map((product) => product.name));
  const missing = catalog.products
    .map((product) => ({
      clubId: club.id,
      name: prefix(product.name),
      description: `${product.description} Sold by ${club.name}.`,
      price: product.price,
      memberPrice: product.memberPrice,
      isActive: true,
    }))
    .filter((product) => !existingNames.has(product.name));

  if (missing.length) await db.Product.bulkCreate(missing);

  const products = await db.Product.findAll({ where: { clubId: club.id }, attributes: ['id', 'name'] });
  const productIds = products.map((product) => product.id);
  if (!productIds.length) return;

  const variants = await db.ProductVariant.findAll({
    where: { productId: productIds },
    attributes: ['productId', 'size'],
  });
  const existingSizes = new Set(variants.map((variant) => `${variant.productId}:${variant.size.toLowerCase()}`));
  const variantsToCreate = [];
  for (const product of catalog.products) {
    const stored = products.find((item) => item.name === prefix(product.name));
    if (!stored) continue;
    product.sizes.forEach((size, index) => {
      const key = `${stored.id}:${size.toLowerCase()}`;
      if (!existingSizes.has(key)) {
        variantsToCreate.push({
          productId: stored.id,
          size,
          stock: (index + product.name.length) % 9 === 0 ? 0 : 8 + ((index + product.price) % 24),
          sortOrder: index,
        });
      }
    });
  }
  if (variantsToCreate.length) await db.ProductVariant.bulkCreate(variantsToCreate);
}

async function ensureEvents(club, college, createdById, now) {
  const existing = await db.Event.findAll({ where: { clubId: club.id }, attributes: ['title'] });
  const existingTitles = new Set(existing.map((event) => event.title));
  const events = catalog.eventTitles
    .map((title, index) => {
      const eventTitle = `${club.name.slice(0, 85)}: ${title}`;
      const { startsAt, endsAt } = eventDates(index, now);
      return {
        clubId: club.id,
        collegeId: college.id,
        title: eventTitle,
        description: `A sample ${title.toLowerCase()} hosted by ${club.name}. Meet fellow students, take part and explore what the club does.`,
        venue: `${college.code} ${catalog.venues[index % catalog.venues.length]}`,
        startsAt,
        endsAt,
        registrationDeadline: new Date(startsAt.getTime() - 60 * 60 * 1000),
        capacity: 60 + ((index * 31) % 340),
        guestPrice: 150 + ((index % 5) * 50),
        collegePrice: 100 + ((index % 5) * 35),
        memberPrice: 0,
        visibility: 'PUBLIC',
        status: 'PUBLISHED',
        volunteersNeeded: 2 + (index % 5),
        maxPerOrder: 5,
        createdById,
      };
    })
    .filter((event) => !existingTitles.has(event.title));
  if (events.length) await db.Event.bulkCreate(events);
}

async function ensureEventVolunteers(events, volunteers, assignedById) {
  if (!events.length || !volunteers.length) return;
  const assignments = await db.EventVolunteer.findAll({
    where: { eventId: events.map((event) => event.id) },
    attributes: ['eventId', 'userId'],
  });
  const assigned = new Set(assignments.map((item) => `${item.eventId}:${item.userId}`));
  const duties = ['Registration', 'Stage support', 'Guest welcome', 'Logistics', 'Photography'];
  const missing = events
    .map((event, index) => {
      const volunteer = volunteers[index % volunteers.length];
      if (assigned.has(`${event.id}:${volunteer.userId}`)) return null;
      return {
        eventId: event.id,
        userId: volunteer.userId,
        duty: duties[index % duties.length],
        canCheckIn: true,
        status: 'APPROVED',
        assignedById,
      };
    })
    .filter(Boolean);
  if (missing.length) await db.EventVolunteer.bulkCreate(missing);
}

async function ensureSampleTickets(events, members, checkedInById, now) {
  if (!events.length || !members.length) return;
  const memberUsers = await db.User.findAll({
    where: { id: members.map((member) => member.userId) },
    attributes: ['id', 'name'],
  });
  const usersById = new Map(memberUsers.map((user) => [user.id, user]));
  const tickets = events.flatMap((event, eventIndex) => {
    const isPast = new Date(event.endsAt || event.startsAt).getTime() < now.getTime();
    return Array.from({ length: Math.min(4, memberUsers.length) }, (_, index) => {
      const user = memberUsers[(eventIndex * 3 + index) % memberUsers.length];
      const ticketCode = `SMP-${event.id}-${index + 1}`;
      return {
        eventId: event.id,
        userId: user.id,
        ticketCode,
        qrToken: crypto.randomBytes(16).toString('hex'),
        holderName: usersById.get(user.id).name,
        priceType: 'MEMBER',
        registrationType: 'CLUB_MEMBER',
        price: 0,
        status: 'VALID',
        checkedInAt: isPast ? event.endsAt || event.startsAt : null,
        checkedInById: isPast ? checkedInById : null,
      };
    });
  });
  const existingCodes = new Set(
    (await db.Ticket.findAll({ where: { ticketCode: tickets.map((ticket) => ticket.ticketCode) }, attributes: ['ticketCode'] }))
      .map((ticket) => ticket.ticketCode)
  );
  const missing = tickets.filter((ticket) => !existingCodes.has(ticket.ticketCode));
  if (missing.length) await db.Ticket.bulkCreate(missing);
}

async function ensureMembershipPlan(club) {
  await db.MembershipPlan.findOrCreate({
    where: { clubId: club.id, name: 'Annual Sample Membership' },
    defaults: {
      clubId: club.id,
      name: 'Annual Sample Membership',
      description: 'Sample one-year membership with member event and merchandise benefits.',
      price: 500,
      durationType: 'MONTHS',
      durationMonths: 12,
      ticketDiscountPercent: 100,
      merchDiscountPercent: 20,
      perks: ['Free member event enrollment', 'Member merchandise prices'],
    },
  });
}

async function ensureFundraiser(club, createdById, now) {
  const title = `${club.name.slice(0, 110)} Community Fund`;
  const [fundraiser] = await db.Fundraiser.findOrCreate({
    where: { clubId: club.id, title },
    defaults: {
      clubId: club.id,
      title,
      description: `A sample fundraising campaign supporting ${club.name} activities.`,
      eventDate: dateOnly(new Date(now.getTime() + 21 * day)),
      goalAmount: 25000,
      status: 'ACTIVE',
      createdById,
    },
  });
  return fundraiser;
}

async function ensureFinanceData(club, staff, events, fundraiser, recordedById, now) {
  const sourceEntries = [
    ['membership', 'INCOME', 'MEMBERSHIP_DUES', 12000, 'Sample membership dues'],
    ['tickets', 'INCOME', 'TICKET_SALES', 18500, 'Sample event ticket sales'],
    ['merchandise', 'INCOME', 'MERCHANDISE', 4200, 'Sample merchandise sales'],
    ['fundraiser', 'INCOME', 'FUNDRAISER', 6000, 'Sample fundraiser proceeds'],
    ['fundraiser-expense', 'EXPENSE', 'SUPPLIES', 1800, 'Sample fundraiser supplies'],
    ['sponsorship', 'INCOME', 'SPONSORSHIP', 15000, 'Sample local sponsorship'],
    ['event-expense', 'EXPENSE', 'EVENT_COSTS', 5200, 'Sample event production costs'],
    ['reimbursement', 'EXPENSE', 'REIMBURSEMENT', 950, 'Sample volunteer reimbursement'],
  ].map(([key, type, category, amount, description], index) => ({
    clubId: club.id,
    type,
    category,
    amount,
    date: new Date(now.getTime() - (index + 1) * 9 * day),
    description,
    source: 'MANUAL',
    sourceKey: `sample-${club.id}-${key}`,
    eventId: type === 'EXPENSE' ? events[index]?.id || null : null,
    fundraiserId: category === 'FUNDRAISER' || key === 'fundraiser-expense' ? fundraiser.id : null,
    method: type === 'INCOME' ? 'UPI' : 'BANK_TRANSFER',
    recordedById,
  }));
  const existingKeys = new Set(
    (await db.LedgerEntry.findAll({
      where: { sourceKey: sourceEntries.map((entry) => entry.sourceKey) },
      attributes: ['sourceKey'],
    })).map((entry) => entry.sourceKey)
  );
  const missingEntries = sourceEntries.filter((entry) => !existingKeys.has(entry.sourceKey));
  if (missingEntries.length) await db.LedgerEntry.bulkCreate(missingEntries);

  if (!staff) return;
  const title = `Sample event bill · ${club.code}`;
  const existingClaim = await db.ExpenseClaim.findOne({ where: { clubId: club.id, title }, attributes: ['id'] });
  if (!existingClaim) {
    await db.ExpenseClaim.create({
      clubId: club.id,
      claimantId: staff.userId,
      title,
      description: 'Sample pending bill for event equipment. Review the attached demo receipt.',
      amount: 1750,
      category: 'EVENT_COSTS',
      spentOn: dateOnly(now),
      eventId: events[0]?.id || null,
      receiptUrl,
      status: 'SUBMITTED',
    });
  }
}

async function seedCatalog() {
  const colleges = await db.College.findAll({ where: { status: 'ACTIVE' }, order: [['id', 'ASC']] });
  if (!colleges.length) throw new Error('No active colleges found. Seed a college before running seed:catalog.');

  const now = new Date();
  let clubsCreated = 0;
  let eventsCreated = 0;
  let productsCreated = 0;

  for (const college of colleges) {
    const [admins, collegeUsers, allCollegeClubs] = await Promise.all([
      db.CollegeAdmin.findAll({ where: { collegeId: college.id }, attributes: ['userId'], order: [['id', 'ASC']] }),
      db.User.findAll({ where: { collegeId: college.id, isActive: true }, attributes: ['id'] }),
      db.Club.findAll({ where: { collegeId: college.id }, order: [['id', 'ASC']] }),
    ]);
    const createdById = admins[0]?.userId || collegeUsers[0]?.id || null;
    const collegeClubs = allCollegeClubs.filter((club) => club.status === 'ACTIVE');
    const known = new Set(allCollegeClubs.flatMap((club) => [club.code.toLowerCase(), club.name.toLowerCase()]));

    for (const fixture of catalog.clubs) {
      if (collegeClubs.length >= 30) break;
      if (known.has(fixture.code.toLowerCase()) || known.has(fixture.name.toLowerCase())) continue;
      const club = await db.Club.create({
        ...fixture,
        collegeId: college.id,
        createdById,
      });
      collegeClubs.push(club);
      known.add(club.code.toLowerCase());
      known.add(club.name.toLowerCase());
      clubsCreated += 1;
    }

    for (const club of collegeClubs) {
      const beforeEvents = await db.Event.count({ where: { clubId: club.id } });
      const beforeProducts = await db.Product.count({ where: { clubId: club.id } });
      await Promise.all([
        ensureProducts(club),
        ensureEvents(club, college, createdById, now),
        ensureMembershipPlan(club),
      ]);
      const [staff, events] = await Promise.all([
        db.ClubMember.findAll({
          where: { clubId: club.id, status: 'ACTIVE', role: ['MANAGER', 'TREASURER', 'VOLUNTEER'] },
          attributes: ['userId', 'role'],
          order: [['id', 'ASC']],
        }),
        db.Event.findAll({ where: { clubId: club.id }, order: [['startsAt', 'ASC']], limit: 30 }),
      ]);
      const [volunteer, members] = await Promise.all([
        Promise.resolve(staff.filter((member) => member.role === 'VOLUNTEER')),
        db.ClubMember.findAll({ where: { clubId: club.id, status: 'ACTIVE', role: 'MEMBER' }, attributes: ['userId'], order: [['id', 'ASC']] }),
      ]);
      const assignedVolunteers = volunteer.length ? volunteer : staff.filter((member) => member.role === 'MANAGER');
      await ensureEventVolunteers(events, assignedVolunteers, createdById);
      await ensureSampleTickets(events, members, createdById, now);
      const fundraiser = await ensureFundraiser(club, createdById, now);
      const submitter = staff.find((member) => member.role === 'MANAGER') || staff.find((member) => member.role === 'VOLUNTEER') || staff[0];
      const recordedById = staff.find((member) => member.role === 'TREASURER')?.userId || createdById;
      await ensureFinanceData(club, submitter, events, fundraiser, recordedById, now);
      eventsCreated += Math.max(0, await db.Event.count({ where: { clubId: club.id } }) - beforeEvents);
      productsCreated += Math.max(0, await db.Product.count({ where: { clubId: club.id } }) - beforeProducts);
    }
  }

  console.log(`Sample catalog ready for ${colleges.length} active college(s).`);
  console.log(`Created ${clubsCreated} clubs, ${eventsCreated} events and ${productsCreated} products.`);
  console.log(`Target per college: 30 clubs; target per club: 30 events and ${catalog.products.length} merchandise products.`);
}

if (require.main === module) {
  connectDB()
    .then(seedCatalog)
    .catch((err) => {
      console.error('Sample catalog seed failed:', err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.sequelize.close();
    });
}

module.exports = seedCatalog;
