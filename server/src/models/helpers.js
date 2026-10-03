const { DataTypes } = require('sequelize');

// A TEXT column holding JSON. Works the same on MySQL and MariaDB
// (MariaDB's JSON type comes back as a string through the mysql driver).
function jsonText(field, fallback) {
  return {
    type: DataTypes.TEXT, // MySQL doesn't allow defaults on TEXT, so NULL reads back as `fallback`
    allowNull: true,
    get() {
      const raw = this.getDataValue(field);
      try {
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(value) {
      this.setDataValue(field, JSON.stringify(value ?? fallback));
    },
  };
}

// DECIMAL columns come back from mysql2 as strings; return numbers instead
function money(field) {
  return {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    get() {
      const v = this.getDataValue(field);
      return v === null || v === undefined ? v : Number(v);
    },
  };
}

// Dates are stored in UTC, but Sequelize formats Date values in raw-SQL replacements
// in the server's local time. Always pass dates to raw queries through utc().
function utc(date) {
  return new Date(date).toISOString().slice(0, 23).replace('T', ' ');
}

module.exports = { jsonText, money, utc };
