const { DataTypes } = require('sequelize');
const { money } = require('./helpers');

// PENDING: seat held while the buyer pays (15 min). VALID: paid. CANCELLED: never paid. REFUNDED: paid then refunded.
const STATUSES = ['PENDING', 'VALID', 'CANCELLED', 'REFUNDED'];

module.exports = (sequelize) =>
  sequelize.define(
    'Ticket',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      eventId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }, // buyer
      paymentId: DataTypes.INTEGER.UNSIGNED,
      ticketCode: { type: DataTypes.STRING(20), allowNull: false, unique: 'tickets_code_unique' }, // e.g. TKT-7F3A9C, typed at the door if the QR won't scan
      qrToken: { type: DataTypes.STRING(64), allowNull: false, unique: 'tickets_qr_unique' },
      holderName: { type: DataTypes.STRING(100), allowNull: false },
      priceType: { type: DataTypes.ENUM('MEMBER', 'COLLEGE', 'GUEST'), allowNull: false }, // which price was charged
      // Who registered: club member, student of the same college, student of another college, or guest
      registrationType: { type: DataTypes.ENUM('CLUB_MEMBER', 'COLLEGE_STUDENT', 'EXTERNAL_STUDENT', 'GUEST'), allowNull: false, defaultValue: 'GUEST' },
      price: money('price'),
      status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PENDING' },
      checkedInAt: DataTypes.DATE,
      checkedInById: DataTypes.INTEGER.UNSIGNED,
    },
    {
      tableName: 'tickets',
      indexes: [{ fields: ['eventId', 'status'] }, { fields: ['userId'] }, { fields: ['paymentId'] }],
    }
  );

module.exports.STATUSES = STATUSES;
