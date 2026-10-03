const { DataTypes } = require('sequelize');

// A college on the platform. Every club and (optionally) every student belongs to one.
module.exports = (sequelize) =>
  sequelize.define(
    'College',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: { notNull: { msg: 'College name is required' }, notEmpty: { msg: 'College name is required' } },
      },
      // Short code shown in membership numbers, e.g. LDCE
      code: {
        type: DataTypes.STRING(12),
        allowNull: false,
        unique: 'colleges_code_unique',
        validate: { notNull: { msg: 'College code is required' }, is: { args: /^[A-Z0-9]{2,12}$/, msg: 'Code must be 2–12 letters or digits' } },
        set(v) {
          this.setDataValue('code', typeof v === 'string' ? v.trim().toUpperCase() : v);
        },
      },
      city: DataTypes.STRING(80),
      address: DataTypes.STRING(300),
      email: { type: DataTypes.STRING(191), validate: { isEmail: { msg: 'Please enter a valid email' } } },
      phone: DataTypes.STRING(30),
      // ON: students who choose this college stay "pending" until a College Head approves them.
      // OFF: choosing the college is trusted straight away.
      approveStudents: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
      createdById: DataTypes.INTEGER.UNSIGNED,
    },
    { tableName: 'colleges' }
  );
