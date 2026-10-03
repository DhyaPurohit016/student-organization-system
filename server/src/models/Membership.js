const { DataTypes } = require('sequelize');
const { jsonText, money } = require('./helpers');

const STATUSES = ['PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED'];

module.exports = (sequelize) =>
  sequelize.define(
    'Membership',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      paymentId: DataTypes.INTEGER.UNSIGNED,

      // Copy of the plan at purchase time, so later plan edits don't change what was paid for
      planName: { type: DataTypes.STRING(100), allowNull: false },
      planPrice: money('planPrice'),
      ticketDiscountPercent: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      merchDiscountPercent: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      perks: jsonText('perks', []),

      membershipNumber: { type: DataTypes.STRING(30), unique: 'memberships_number_unique' }, // e.g. SSA-2026-0001
      qrToken: { type: DataTypes.STRING(64), unique: 'memberships_qr_unique' }, // secret encoded in the QR
      startDate: DataTypes.DATE(3), // millisecond precision: 23:59:59.999 must not round to the next day
      endDate: DataTypes.DATE(3),
      status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PENDING' },
      remindersSent: jsonText('remindersSent', []), // days-before-expiry reminders already emailed, e.g. [30, 7]

      planSnapshot: {
        type: DataTypes.VIRTUAL,
        get() {
          return {
            name: this.planName,
            price: this.planPrice,
            benefits: {
              ticketDiscountPercent: this.ticketDiscountPercent,
              merchDiscountPercent: this.merchDiscountPercent,
              perks: this.perks,
            },
          };
        },
      },
      // True only while paid and inside its validity window
      isCurrent: {
        type: DataTypes.VIRTUAL,
        get() {
          const now = new Date();
          return this.status === 'ACTIVE' && this.startDate <= now && this.endDate > now;
        },
      },
      daysLeft: {
        type: DataTypes.VIRTUAL,
        get() {
          if (this.status !== 'ACTIVE' || !this.endDate) return null;
          return Math.max(0, Math.ceil((this.endDate - Date.now()) / 86400000));
        },
      },
    },
    {
      tableName: 'memberships',
      indexes: [{ fields: ['userId', 'status'] }, { fields: ['status', 'endDate'] }],
    }
  );

module.exports.STATUSES = STATUSES;
