const { DataTypes } = require('sequelize');
const { money } = require('./helpers');

const INCOME_CATEGORIES = ['MEMBERSHIP_DUES', 'TICKET_SALES', 'MERCHANDISE', 'FUNDRAISER', 'DONATION', 'SPONSORSHIP', 'OPENING_BALANCE', 'OTHER_INCOME'];
const EXPENSE_CATEGORIES = ['EVENT_COSTS', 'MERCH_STOCK', 'SUPPLIES', 'VENUE', 'MARKETING', 'REIMBURSEMENT', 'REFUND', 'OTHER_EXPENSE'];

// The club's money book: one row per amount in or out.
// Rows from payments, refunds and reimbursements are written automatically; `sourceKey`
// (e.g. "payment:12") makes that idempotent. Treasurer-entered rows have source MANUAL.
module.exports = (sequelize) => {
  const LedgerEntry = sequelize.define(
    'LedgerEntry',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      type: { type: DataTypes.ENUM('INCOME', 'EXPENSE'), allowNull: false },
      category: { type: DataTypes.ENUM(...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES), allowNull: false },
      amount: { ...money('amount'), validate: { min: { args: [0.01], msg: 'Amount must be greater than 0' } } },
      date: { type: DataTypes.DATE, allowNull: false },
      description: { type: DataTypes.STRING(300), allowNull: false },
      source: { type: DataTypes.ENUM('PAYMENT', 'REFUND', 'CLAIM', 'MANUAL'), allowNull: false, defaultValue: 'MANUAL' },
      sourceKey: { type: DataTypes.STRING(60), unique: 'ledger_source_unique' },
      paymentId: DataTypes.INTEGER.UNSIGNED,
      claimId: DataTypes.INTEGER.UNSIGNED,
      eventId: DataTypes.INTEGER.UNSIGNED,
      fundraiserId: DataTypes.INTEGER.UNSIGNED,
      method: DataTypes.STRING(20), // CASH, UPI, ONLINE...
      receiptUrl: DataTypes.STRING(500),
      recordedById: DataTypes.INTEGER.UNSIGNED,
    },
    {
      tableName: 'ledger_entries',
      indexes: [{ fields: ['date'] }, { fields: ['type', 'category'] }, { fields: ['eventId'] }, { fields: ['fundraiserId'] }],
      validate: {
        categoryMatchesType() {
          const ok = this.type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
          if (!ok.includes(this.category)) throw new Error(`${this.category} is not a valid ${this.type.toLowerCase()} category`);
        },
      },
    }
  );
  LedgerEntry.INCOME_CATEGORIES = INCOME_CATEGORIES;
  LedgerEntry.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
  return LedgerEntry;
};
