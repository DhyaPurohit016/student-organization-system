require('dotenv').config({ quiet: true });
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_NAME || 'student_org', process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
  logging: process.env.DB_LOG === 'true' ? console.log : false,
  timezone: '+00:00', // store all dates in UTC
  define: { underscored: false, freezeTableName: false },
  pool: { max: 10, min: 0, idle: 10000 },
});

module.exports = sequelize;
