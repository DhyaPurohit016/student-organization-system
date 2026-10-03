const { DataTypes } = require('sequelize');
const { money } = require('./helpers');

// Every payment in the system (dues now; tickets, merch etc. in later phases).
// Phase 7 builds the finance ledger on top of PAID payments.
module.exports = (sequelize) =>
  sequelize.define(
    'Payment',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      amount: { ...money('amount'), validate: { min: 0 } },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
      purpose: { type: DataTypes.ENUM('MEMBERSHIP', 'TICKET', 'MERCH', 'FUNDRAISER', 'OTHER'), allowNull: false },
      referenceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }, // id of the thing paid for, e.g. a membership
      method: { type: DataTypes.ENUM('ONLINE', 'CASH', 'UPI', 'BANK_TRANSFER'), allowNull: false },
      status: {
        type: DataTypes.ENUM('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      provider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'manual' }, // 'mock', 'razorpay', 'manual'
      providerRef: DataTypes.STRING(100), // gateway order id (e.g. Razorpay order_...)
      providerPaymentId: DataTypes.STRING(100), // gateway payment id once paid (e.g. pay_...), used for refunds
      receiptNumber: { type: DataTypes.STRING(30), unique: 'payments_receipt_unique' },
      recordedById: DataTypes.INTEGER.UNSIGNED, // admin who recorded a cash payment
      note: DataTypes.STRING(500),
      paidAt: DataTypes.DATE,
    },
    {
      tableName: 'payments',
      indexes: [{ fields: ['userId', 'status'] }, { fields: ['purpose', 'referenceId'] }, { fields: ['status', 'paidAt'] }, { fields: ['providerRef'] }],
    }
  );
