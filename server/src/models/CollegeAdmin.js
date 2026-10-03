const { DataTypes } = require('sequelize');

// College Heads: who runs each college (a college may have more than one)
module.exports = (sequelize) =>
  sequelize.define(
    'CollegeAdmin',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      collegeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      assignedById: DataTypes.INTEGER.UNSIGNED,
    },
    { tableName: 'college_admins', indexes: [{ unique: true, fields: ['collegeId', 'userId'], name: 'college_admins_unique' }] }
  );
