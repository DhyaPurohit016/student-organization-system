const { DataTypes } = require('sequelize');
const { money } = require('./helpers');

// A volunteer asking to be paid back for something they bought for the club.
// SUBMITTED → APPROVED → PAID, or REJECTED.
module.exports = (sequelize) =>
  sequelize.define(
    'ExpenseClaim',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      claimantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notNull: { msg: 'What was bought is required' }, notEmpty: { msg: 'What was bought is required' } },
      },
      description: DataTypes.TEXT,
      amount: { ...money('amount'), validate: { min: { args: [0.01], msg: 'Amount must be greater than 0' } } },
      category: {
        type: DataTypes.ENUM('EVENT_COSTS', 'MERCH_STOCK', 'SUPPLIES', 'VENUE', 'MARKETING', 'OTHER_EXPENSE'),
        allowNull: false,
        defaultValue: 'SUPPLIES',
      },
      spentOn: { type: DataTypes.DATEONLY, allowNull: false },
      eventId: DataTypes.INTEGER.UNSIGNED,
      fundraiserId: DataTypes.INTEGER.UNSIGNED,
      receiptUrl: DataTypes.STRING(500),
      status: { type: DataTypes.ENUM('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'), allowNull: false, defaultValue: 'SUBMITTED' },
      reviewedById: DataTypes.INTEGER.UNSIGNED,
      reviewedAt: DataTypes.DATE,
      reviewNote: DataTypes.STRING(300),
      paidAt: DataTypes.DATE,
      paidMethod: DataTypes.STRING(20),
    },
    { tableName: 'expense_claims', indexes: [{ fields: ['claimantId'] }, { fields: ['status'] }] }
  );
