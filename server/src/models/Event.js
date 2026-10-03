const { DataTypes } = require('sequelize');

const STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED'];
const VISIBILITY = ['PUBLIC', 'COLLEGE', 'CLUB'];

module.exports = (sequelize) =>
  sequelize.define(
    'Event',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      collegeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }, // copied from the club, for fast access checks
      // PUBLIC: anyone (other colleges, guests). COLLEGE: verified students of this college only.
      // CLUB: approved members of this club only.
      visibility: { type: DataTypes.ENUM(...VISIBILITY), allowNull: false, defaultValue: 'PUBLIC' },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notNull: { msg: 'Title is required' }, notEmpty: { msg: 'Title is required' } },
      },
      description: DataTypes.TEXT,
      venue: { type: DataTypes.STRING(150), allowNull: false, validate: { notNull: { msg: 'Venue is required' }, notEmpty: { msg: 'Venue is required' } } },
      startsAt: { type: DataTypes.DATE, allowNull: false, validate: { notNull: { msg: 'Start date/time is required' } } },
      endsAt: DataTypes.DATE,
      capacity: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        validate: { notNull: { msg: 'Capacity is required' }, min: { args: [1], msg: 'Capacity must be at least 1' } },
      },
      guestPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: { args: [0], msg: 'Price cannot be negative' } },
        get() {
          return Number(this.getDataValue('guestPrice'));
        },
      },
      // Optional price for students of the same college who aren't club members (empty = guest price)
      collegePrice: {
        type: DataTypes.DECIMAL(10, 2),
        validate: { min: { args: [0], msg: 'Price cannot be negative' } },
        get() {
          const v = this.getDataValue('collegePrice');
          return v === null || v === undefined ? null : Number(v);
        },
      },
      registrationDeadline: DataTypes.DATE, // optional: no new registrations after this
      // Optional fixed member price; when empty, members get the guest price minus their plan's ticket discount
      memberPrice: {
        type: DataTypes.DECIMAL(10, 2),
        validate: { min: { args: [0], msg: 'Price cannot be negative' } },
        get() {
          const v = this.getDataValue('memberPrice');
          return v === null || v === undefined ? null : Number(v);
        },
      },
      volunteersNeeded: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, defaultValue: 0 }, // shown under "Helping Out"
      maxPerOrder: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 5, validate: { min: 1, max: 20 } },
      imageUrl: DataTypes.STRING(500),
      status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'DRAFT' },
      createdById: DataTypes.INTEGER.UNSIGNED,
    },
    {
      tableName: 'events',
      indexes: [{ fields: ['status', 'startsAt'] }, { fields: ['clubId'] }, { fields: ['collegeId', 'visibility'] }],
      validate: {
        endsAfterStart() {
          if (this.endsAt && this.startsAt && new Date(this.endsAt) < new Date(this.startsAt)) {
            throw new Error('End time must be after the start time');
          }
        },
      },
    }
  );

module.exports.STATUSES = STATUSES;
module.exports.VISIBILITY = VISIBILITY;
