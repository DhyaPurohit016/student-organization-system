const { DataTypes } = require('sequelize');

// One size (or colour) of a product, with its own stock count
module.exports = (sequelize) =>
  sequelize.define(
    'ProductVariant',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      productId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      size: { type: DataTypes.STRING(30), allowNull: false, validate: { notEmpty: { msg: 'Size is required' } } },
      stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'Stock cannot be negative' } },
      },
      sortOrder: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'product_variants',
      indexes: [{ unique: true, fields: ['productId', 'size'], name: 'variants_product_size_unique' }],
    }
  );
