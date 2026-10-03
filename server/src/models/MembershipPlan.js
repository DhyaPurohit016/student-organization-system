const { DataTypes } = require('sequelize');
const { jsonText, money } = require('./helpers');

const percent = { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0, validate: { min: 0, max: 100 } };

module.exports = (sequelize) =>
  sequelize.define(
    'MembershipPlan',
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      clubId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: { notNull: { msg: 'Plan name is required' }, notEmpty: { msg: 'Plan name is required' } },
      },
      description: DataTypes.STRING(500),
      price: { ...money('price'), validate: { notNull: { msg: 'Price is required' }, min: { args: [0], msg: 'Price cannot be negative' } } },
      // YEAR_END: valid until 31 Dec of the year it starts in ("memberships run out at the end of the year")
      // MONTHS:   valid for durationMonths from the start date
      durationType: { type: DataTypes.ENUM('YEAR_END', 'MONTHS'), allowNull: false, defaultValue: 'YEAR_END' },
      durationMonths: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, defaultValue: 12, validate: { min: 1, max: 60 } },
      ticketDiscountPercent: { ...percent },
      merchDiscountPercent: { ...percent },
      perks: jsonText('perks', []), // free-text extras, e.g. "Voting rights"
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // inactive = not for sale

      // API shape: { ticketDiscountPercent, merchDiscountPercent, perks }
      benefits: {
        type: DataTypes.VIRTUAL,
        get() {
          return {
            ticketDiscountPercent: this.ticketDiscountPercent,
            merchDiscountPercent: this.merchDiscountPercent,
            perks: this.perks,
          };
        },
        set(b = {}) {
          if (b.ticketDiscountPercent !== undefined) this.setDataValue('ticketDiscountPercent', b.ticketDiscountPercent);
          if (b.merchDiscountPercent !== undefined) this.setDataValue('merchDiscountPercent', b.merchDiscountPercent);
          if (b.perks !== undefined) this.perks = b.perks;
        },
      },
    },
    { tableName: 'membership_plans', indexes: [{ unique: true, fields: ['clubId', 'name'], name: 'plans_club_name_unique' }] }
  );
