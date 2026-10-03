const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

const { PLATFORM_ROLES } = require('../config/roles');

// NONE: no college (guest). PENDING: chose a college, waiting for a College Head.
// VERIFIED: counts as that college's student. REJECTED: College Head said no.
const COLLEGE_STATUSES = ['NONE', 'PENDING', 'VERIFIED', 'REJECTED'];

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: { notNull: { msg: 'Name is required' }, notEmpty: { msg: 'Name is required' } },
        set(v) {
          this.setDataValue('name', typeof v === 'string' ? v.trim() : v);
        },
      },
      email: {
        type: DataTypes.STRING(191),
        allowNull: false,
        unique: 'users_email_unique',
        validate: { notNull: { msg: 'Email is required' }, isEmail: { msg: 'Please enter a valid email' } },
        set(v) {
          this.setDataValue('email', typeof v === 'string' ? v.trim().toLowerCase() : v);
        },
      },
      password: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          notNull: { msg: 'Password is required' },
          len: { args: [8, 100], msg: 'Password must be at least 8 characters' },
        },
      },
      phone: DataTypes.STRING(30),
      studentId: DataTypes.STRING(50),
      // Platform-level only. College Heads and club roles live in college_admins / club_members.
      role: { type: DataTypes.ENUM(...PLATFORM_ROLES), allowNull: false, defaultValue: 'USER' },
      collegeId: DataTypes.INTEGER.UNSIGNED,
      collegeStatus: { type: DataTypes.ENUM(...COLLEGE_STATUSES), allowNull: false, defaultValue: 'NONE' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      emailOptIn: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // receives announcement emails
      lastLoginAt: DataTypes.DATE,
    },
    {
      tableName: 'users',
      // The password hash is never loaded unless a query asks for scope('withPassword')
      defaultScope: { attributes: { exclude: ['password'] } },
      scopes: { withPassword: { attributes: { include: ['password'] } } },
      indexes: [{ fields: ['role'] }, { fields: ['studentId'] }, { fields: ['collegeId', 'collegeStatus'] }],
    }
  );

  // Validation runs on the plain password first, then it's hashed before saving
  User.addHook('beforeSave', async (user) => {
    if (user.changed('password')) user.password = await bcrypt.hash(user.password, 12);
  });

  User.prototype.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.getDataValue('password'));
  };

  User.prototype.toJSON = function () {
    const values = { ...this.get() };
    delete values.password;
    return values;
  };

  User.ROLES = PLATFORM_ROLES;
  User.COLLEGE_STATUSES = COLLEGE_STATUSES;
  return User;
};
