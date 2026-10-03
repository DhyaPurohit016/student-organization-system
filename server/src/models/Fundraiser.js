const { DataTypes } = require('sequelize');

module.exports = (sequelize) =>
  sequelize.define(
    'Fundraiser',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notNull: { msg: 'Title is required' }, notEmpty: { msg: 'Title is required' } },
      },
      description: DataTypes.TEXT,
      eventDate: DataTypes.DATEONLY, // the day of the bake sale etc.
      goalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'Goal cannot be negative' } },
        get() {
          return Number(this.getDataValue('goalAmount'));
        },
      },
      status: { type: DataTypes.ENUM('PLANNING', 'ACTIVE', 'COMPLETED', 'CANCELLED'), allowNull: false, defaultValue: 'PLANNING' },
      leadId: DataTypes.INTEGER.UNSIGNED, // volunteer in charge
      createdById: DataTypes.INTEGER.UNSIGNED,
    },
    { tableName: 'fundraisers' }
  );
