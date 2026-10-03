const { DataTypes } = require('sequelize');

// Someone helping at a particular event, with a duty (Registration, Technical, Food...).
// canCheckIn lets them mark attendance at the door. Volunteers can offer to help ("Helping Out"):
// the offer is PENDING until the club manager approves it; managers' own assignments are APPROVED.
module.exports = (sequelize) =>
  sequelize.define(
    'EventVolunteer',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      eventId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      duty: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'General' },
      canCheckIn: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.ENUM('PENDING', 'APPROVED'), allowNull: false, defaultValue: 'APPROVED' },
      message: DataTypes.STRING(300), // the volunteer's note when offering to help
      assignedById: DataTypes.INTEGER.UNSIGNED,
    },
    { tableName: 'event_volunteers', indexes: [{ unique: true, fields: ['eventId', 'userId'], name: 'event_volunteers_unique' }] }
  );
