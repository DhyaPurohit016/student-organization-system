const { DataTypes } = require('sequelize');

// In-app notification shown under the bell icon
module.exports = (sequelize) =>
  sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: DataTypes.STRING(500),
      link: DataTypes.STRING(200), // app path to open, e.g. /tickets
      readAt: DataTypes.DATE,
    },
    { tableName: 'notifications', updatedAt: false, indexes: [{ fields: ['userId', 'readAt'] }] }
  );
