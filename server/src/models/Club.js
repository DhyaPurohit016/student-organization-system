const { DataTypes } = require('sequelize');

// A club inside a college. Events, shop, money, announcements and fundraisers all belong to a club.
module.exports = (sequelize) =>
  sequelize.define(
    'Club',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      collegeId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: { notNull: { msg: 'Club name is required' }, notEmpty: { msg: 'Club name is required' } },
      },
      // Short code used in membership numbers, e.g. CODE → LDCE-CODE-2026-0001
      code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { notNull: { msg: 'Club code is required' }, is: { args: /^[A-Z0-9]{2,10}$/, msg: 'Code must be 2–10 letters or digits' } },
        set(v) {
          this.setDataValue('code', typeof v === 'string' ? v.trim().toUpperCase() : v);
        },
      },
      description: DataTypes.TEXT,
      logoUrl: DataTypes.STRING(500),
      // When ON, approved members must also pay the club's membership plan to count as members
      requiresDues: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.ENUM('ACTIVE', 'ARCHIVED'), allowNull: false, defaultValue: 'ACTIVE' },
      createdById: DataTypes.INTEGER.UNSIGNED,
    },
    {
      tableName: 'clubs',
      indexes: [
        { unique: true, fields: ['collegeId', 'code'], name: 'clubs_college_code_unique' },
        { unique: true, fields: ['collegeId', 'name'], name: 'clubs_college_name_unique' },
      ],
    }
  );
