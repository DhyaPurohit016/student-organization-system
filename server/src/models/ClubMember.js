const { DataTypes } = require('sequelize');

const CLUB_ROLES = ['MANAGER', 'TREASURER', 'VOLUNTEER', 'MEMBER'];
// PENDING: asked to join, waiting for the manager. ACTIVE: in the club.
const STATUSES = ['PENDING', 'ACTIVE', 'REJECTED', 'REMOVED', 'LEFT'];

// A person's place in a club: their role there and whether they've been let in.
// One person can have different roles in different clubs.
module.exports = (sequelize) => {
  const ClubMember = sequelize.define(
    'ClubMember',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      role: { type: DataTypes.ENUM(...CLUB_ROLES), allowNull: false, defaultValue: 'MEMBER' },
      status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'PENDING' },
      message: DataTypes.STRING(300), // the student's note when asking to join
      decisionNote: DataTypes.STRING(300), // why a request was rejected
      decidedById: DataTypes.INTEGER.UNSIGNED,
      decidedAt: DataTypes.DATE,
      joinedAt: DataTypes.DATE,
      // Member card: assigned when first let in, e.g. LDCE-CODE-0007, plus the secret in its QR code
      memberNumber: { type: DataTypes.STRING(40), unique: 'club_members_number_unique' },
      qrToken: { type: DataTypes.STRING(64), unique: 'club_members_qr_unique' },
    },
    {
      tableName: 'club_members',
      indexes: [{ unique: true, fields: ['clubId', 'userId'], name: 'club_members_unique' }, { fields: ['userId', 'status'] }, { fields: ['clubId', 'status', 'role'] }],
    }
  );
  ClubMember.ROLES = CLUB_ROLES;
  ClubMember.STATUSES = STATUSES;
  return ClubMember;
};
