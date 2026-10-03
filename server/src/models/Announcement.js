const { DataTypes } = require('sequelize');

// Club posts:    PUBLIC (website, everyone) · COLLEGE (verified students of the college) ·
//                MEMBERS (club members + club staff) · STAFF (club manager, treasurer, volunteers)
// College posts: clubId is empty; PUBLIC or COLLEGE, written by a College Head
const AUDIENCES = ['PUBLIC', 'COLLEGE', 'MEMBERS', 'STAFF'];

module.exports = (sequelize) => {
  const Announcement = sequelize.define(
    'Announcement',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      collegeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      clubId: DataTypes.INTEGER.UNSIGNED, // empty = a college-wide announcement
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        validate: { notNull: { msg: 'Title is required' }, notEmpty: { msg: 'Title is required' } },
      },
      body: { type: DataTypes.TEXT, allowNull: false, validate: { notNull: { msg: 'Message is required' }, notEmpty: { msg: 'Message is required' } } },
      audience: { type: DataTypes.ENUM(...AUDIENCES), allowNull: false, defaultValue: 'PUBLIC' },
      status: { type: DataTypes.ENUM('DRAFT', 'PUBLISHED'), allowNull: false, defaultValue: 'DRAFT' },
      pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      publishedAt: DataTypes.DATE,
      authorId: DataTypes.INTEGER.UNSIGNED,
      emailRequested: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      emailedAt: DataTypes.DATE,
      emailedCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'announcements', indexes: [{ fields: ['status', 'audience', 'publishedAt'] }, { fields: ['clubId'] }, { fields: ['collegeId'] }] }
  );
  Announcement.AUDIENCES = AUDIENCES;
  return Announcement;
};
