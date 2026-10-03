const { DataTypes } = require('sequelize');

// A club's mailing list: sign-ups from the club's public page (people who may not have an account)
module.exports = (sequelize) =>
  sequelize.define(
    'Subscriber',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      email: {
        type: DataTypes.STRING(191),
        allowNull: false,
        validate: { notNull: { msg: 'Email is required' }, isEmail: { msg: 'Please enter a valid email' } },
        set(v) {
          this.setDataValue('email', typeof v === 'string' ? v.trim().toLowerCase() : v);
        },
      },
      name: DataTypes.STRING(100),
      isSubscribed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      unsubscribeToken: { type: DataTypes.STRING(64), allowNull: false, unique: 'subscribers_token_unique' },
    },
    { tableName: 'subscribers', indexes: [{ unique: true, fields: ['clubId', 'email'], name: 'subscribers_club_email_unique' }] }
  );
