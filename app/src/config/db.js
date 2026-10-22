const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'mysql',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'attendance_user',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'attendance_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00',
  charset: 'utf8mb4',
  dateStrings: true
};

const pool = mysql.createPool(dbConfig);

// Helper for testing DB connection with retries on startup
async function waitForDatabase(retries = 20, delayMs = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const connection = await pool.getConnection();
      // Ensure session is utf8mb4
      await connection.query("SET NAMES utf8mb4;");
      console.log(`[Database] Successfully connected to MySQL at ${dbConfig.host}:${dbConfig.port} (charset: utf8mb4)`);
      connection.release();
      return true;
    } catch (err) {
      console.warn(`[Database] Connection attempt ${i}/${retries} failed: ${err.message}. Retrying in ${delayMs / 1000}s...`);
      if (i === retries) {
        throw new Error(`Unable to connect to database after ${retries} attempts.`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = {
  pool,
  waitForDatabase
};
