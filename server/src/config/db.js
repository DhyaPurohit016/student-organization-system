const mysql = require('mysql2/promise');
const { sequelize } = require('../models');

// Creates the database if it doesn't exist, connects, and creates any missing tables.
// Set DB_SYNC_ALTER=true once after a phase adds new columns to existing tables.
async function connectDB() {
  const { DB_HOST = '127.0.0.1', DB_PORT = 3306, DB_USER = 'root', DB_PASSWORD = '', DB_NAME = 'student_org' } = process.env;

  const conn = await mysql.createConnection({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();

  await sequelize.authenticate();
  await sequelize.sync({ alter: process.env.DB_SYNC_ALTER === 'true' });
  console.log(`MySQL connected: ${DB_NAME}@${DB_HOST}:${DB_PORT}`);
}

module.exports = connectDB;
