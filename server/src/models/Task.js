const { DataTypes } = require('sequelize');

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

// A to-do for a fundraiser (or an event): who is doing what, by when
module.exports = (sequelize) => {
  const Task = sequelize.define(
    'Task',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      fundraiserId: DataTypes.INTEGER.UNSIGNED,
      eventId: DataTypes.INTEGER.UNSIGNED,
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { notNull: { msg: 'Task title is required' }, notEmpty: { msg: 'Task title is required' } },
      },
      description: DataTypes.TEXT,
      assigneeId: DataTypes.INTEGER.UNSIGNED,
      dueDate: DataTypes.DATEONLY,
      priority: { type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'), allowNull: false, defaultValue: 'MEDIUM' },
      status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'TODO' },
      completedAt: DataTypes.DATE,
      createdById: DataTypes.INTEGER.UNSIGNED,
    },
    { tableName: 'tasks', indexes: [{ fields: ['fundraiserId'] }, { fields: ['eventId'] }, { fields: ['assigneeId', 'status'] }] }
  );
  Task.STATUSES = STATUSES;
  return Task;
};
