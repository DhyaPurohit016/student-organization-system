const { Op, QueryTypes } = require('sequelize');
const { sequelize, ClubMember, Product, ProductVariant } = require('../models');
const ledgerService = require('../services/ledgerService');
const fundraiserService = require('../services/fundraiserService');
const { utc } = require('../models/helpers');

// Default period: the current semester (Jan–Jun or Jul–Dec)
function defaultPeriod() {
  const now = new Date();
  const firstHalf = now.getMonth() < 6;
  const y = now.getFullYear();
  return { from: `${y}-${firstHalf ? '01-01' : '07-01'}`, to: `${y}-${firstHalf ? '06-30' : '12-31'}` };
}

// GET /api/clubs/:clubId/manage/reports/semester?from=&to= — the club's end-of-term report
async function semester(req, res) {
  const club = req.club;
  const period = { ...defaultPeriod(), ...Object.fromEntries(['from', 'to'].filter((k) => req.query[k]).map((k) => [k, req.query[k]])) };
  const range = ledgerService.dateRange(period.from, period.to);
  const r = { from: range[Op.gte], to: range[Op.lte] };
  const rSql = { from: utc(r.from), to: utc(r.to), clubId: club.id };

  const [finance, events, activeMembers, newMembers, staff, [dues], products, fundraisers, soldRows] = await Promise.all([
    ledgerService.summary({ ...period, clubIds: [club.id] }),
    ledgerService.eventProfitAndLoss({ ...period, clubIds: [club.id] }),
    ClubMember.count({ where: { clubId: club.id, status: 'ACTIVE' } }),
    ClubMember.count({ where: { clubId: club.id, status: 'ACTIVE', joinedAt: { [Op.between]: [r.from, r.to] } } }),
    ClubMember.count({ where: { clubId: club.id, status: 'ACTIVE', role: { [Op.ne]: 'MEMBER' } } }),
    sequelize.query(
      `SELECT COUNT(*) AS sold,
              SUM(EXISTS (SELECT 1 FROM memberships p WHERE p.userId = m.userId AND p.clubId = m.clubId AND p.status IN ('ACTIVE','EXPIRED') AND p.id <> m.id AND p.startDate < m.startDate)) AS renewals,
              COALESCE(SUM(planPrice), 0) AS dues
       FROM memberships m
       WHERE m.clubId = :clubId AND m.status IN ('ACTIVE','EXPIRED') AND m.createdAt BETWEEN :from AND :to`,
      { replacements: rSql, type: QueryTypes.SELECT }
    ),
    Product.findAll({
      where: { clubId: club.id },
      include: [{ model: ProductVariant, as: 'variants' }],
      order: [['name', 'ASC'], [{ model: ProductVariant, as: 'variants' }, 'sortOrder', 'ASC'], [{ model: ProductVariant, as: 'variants' }, 'id', 'ASC']],
    }),
    fundraiserService.list(club.id),
    sequelize.query(
      `SELECT i.variantId, SUM(i.quantity) AS units, SUM(i.lineTotal) AS revenue
       FROM order_items i JOIN orders o ON o.id = i.orderId
       WHERE o.clubId = :clubId AND o.status IN ('PAID','READY','COLLECTED') AND o.paidAt BETWEEN :from AND :to
       GROUP BY i.variantId`,
      { replacements: rSql, type: QueryTypes.SELECT }
    ),
  ]);

  const sold = Object.fromEntries(soldRows.map((s) => [s.variantId, { units: Number(s.units), revenue: Number(s.revenue) }]));
  const merch = products.map((p) => ({
    id: p.id,
    name: p.name,
    sizes: p.variants.map((v) => ({ size: v.size, sold: sold[v.id]?.units || 0, stockLeft: v.stock })),
    unitsSold: p.variants.reduce((a, v) => a + (sold[v.id]?.units || 0), 0),
    revenue: Math.round(p.variants.reduce((a, v) => a + (sold[v.id]?.revenue || 0), 0) * 100) / 100,
  }));
  const inPeriod = (d) => d && new Date(d) >= r.from && new Date(d) <= r.to;

  res.json({
    club: { id: club.id, name: club.name, code: club.code },
    period,
    generatedAt: new Date(),
    finance,
    membership: {
      activeMembers,
      newMembers,
      staff,
      duesSold: Number(dues.sold),
      renewals: Number(dues.renewals || 0),
      duesCollected: Number(dues.dues),
    },
    events: events.map((e) => ({ ...e, attendanceRate: e.ticketsSold ? Math.round((e.checkedIn / e.ticketsSold) * 100) : 0 })),
    merch,
    fundraisers: fundraisers.filter((f) => !f.eventDate || inPeriod(f.eventDate) || f.status === 'ACTIVE'),
  });
}

module.exports = { semester, defaultPeriod };
