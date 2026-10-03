const { DataTypes } = require('sequelize');

// "Help & Support": a question or problem sent by a user. It goes to the College Head of the user's
// college, or to the Platform Admin when the user has no college (or asks the platform directly).
module.exports = (sequelize) =>
  sequelize.define(
    'SupportRequest',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      collegeId: DataTypes.INTEGER.UNSIGNED, // null = for the Platform Admin
      subject: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notNull: { msg: 'Subject is required' }, notEmpty: { msg: 'Subject is required' } },
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: { notNull: { msg: 'Please describe the problem' }, notEmpty: { msg: 'Please describe the problem' } },
      },
      status: { type: DataTypes.ENUM('OPEN', 'RESOLVED'), allowNull: false, defaultValue: 'OPEN' },
      reply: DataTypes.TEXT,
      resolvedById: DataTypes.INTEGER.UNSIGNED,
      resolvedAt: DataTypes.DATE,
    },
    { tableName: 'support_requests', indexes: [{ fields: ['collegeId', 'status'] }, { fields: ['userId'] }] }
  );
