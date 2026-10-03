const { DataTypes } = require('sequelize');
const { money } = require('./helpers');

// PENDING_PAYMENT: stock held for 15 min while paying. PAID → READY (for pickup) → COLLECTED.
const STATUSES = ['PENDING_PAYMENT', 'PAID', 'READY', 'COLLECTED', 'CANCELLED', 'REFUNDED'];

module.exports = (sequelize) => {
  const Order = sequelize.define(
    'Order',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      orderNumber: { type: DataTypes.STRING(20), allowNull: false, unique: 'orders_number_unique' },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      paymentId: DataTypes.INTEGER.UNSIGNED,
      status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PENDING_PAYMENT' },
      subtotal: money('subtotal'), // at full price
      discount: money('discount'), // member discount
      total: money('total'),
      memberDiscountApplied: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      note: DataTypes.STRING(300),
      paidAt: DataTypes.DATE,
      readyAt: DataTypes.DATE,
      collectedAt: DataTypes.DATE,
    },
    { tableName: 'orders', indexes: [{ fields: ['userId'] }, { fields: ['status'] }] }
  );
  Order.STATUSES = STATUSES;
  return Order;
};
