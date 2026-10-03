const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Product',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: { notNull: { msg: 'Product name is required' }, notEmpty: { msg: 'Product name is required' } },
      },
      description: DataTypes.TEXT,
      imageUrl: DataTypes.STRING(500),
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: { notNull: { msg: 'Price is required' }, min: { args: [0], msg: 'Price cannot be negative' } },
        get() {
          return Number(this.getDataValue('price'));
        },
      },
      // Optional fixed member price; when empty, members get price minus their plan's merch discount
      memberPrice: {
        type: DataTypes.DECIMAL(10, 2),
        validate: { min: { args: [0], msg: 'Price cannot be negative' } },
        get() {
          const v = this.getDataValue('memberPrice');
          return v === null || v === undefined ? null : Number(v);
        },
      },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'products' }
  );
