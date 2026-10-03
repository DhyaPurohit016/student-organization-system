const { DataTypes } = require('sequelize');
const { money } = require('./helpers');

// Product name/size/price are copied so the order stays correct if the product changes later
module.exports = (sequelize) =>
  sequelize.define(
    'OrderItem',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      variantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      productName: { type: DataTypes.STRING(120), allowNull: false },
      size: { type: DataTypes.STRING(30), allowNull: false },
      quantity: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, validate: { min: 1 } },
      unitPrice: money('unitPrice'), // what was charged per item
      fullPrice: money('fullPrice'), // non-member price per item
      lineTotal: money('lineTotal'),
    },
    { tableName: 'order_items', indexes: [{ fields: ['orderId'] }, { fields: ['variantId'] }] }
  );
