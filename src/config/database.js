const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', // XAMPP default is empty password
  database: process.env.DB_NAME || 'perpustakaan',
  port: process.env.DB_PORT || 3306, // XAMPP MySQL default port
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

let pool;

const connectToDatabase = async () => {
  try {
    console.log('🔌 Attempting to connect to MySQL database...');
    console.log(`📍 Host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`👤 User: ${dbConfig.user}`);
    console.log(`🗄️  Database: ${dbConfig.database}`);
    
    // First connect without database to create it if it doesn't exist
    const tempConfig = { ...dbConfig };
    delete tempConfig.database;
    
    const tempConnection = await mysql.createConnection(tempConfig);
    console.log('✅ Connected to MySQL server');
    
    // Create database if it doesn't exist
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    console.log(`✅ Database '${dbConfig.database}' is ready`);
    await tempConnection.end();
    
    // Now create the pool with the database
    pool = mysql.createPool(dbConfig);
    
    // Test the connection
    const connection = await pool.getConnection();
    console.log('✅ Database connection pool created successfully');
    console.log(`📊 Connected to database: ${dbConfig.database}`);
    
    // Test a simple query
    const [rows] = await connection.query('SELECT 1 as test');
    console.log('✅ Database query test successful');
    
    connection.release();
    
    return pool;
  } catch (error) {
    console.error('❌ Error connecting to MySQL database:', error.message);
    console.error('💡 Make sure XAMPP MySQL is running and credentials are correct');
    throw error;
  }
};

const getPool = () => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call connectToDatabase() first.');
  }
  return pool;
};

// Function to execute queries safely
const executeQuery = async (query, params = []) => {
  try {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(query, params);
      return rows;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Query execution error:', error.message);
    console.error('🔍 Query:', query);
    console.error('📋 Params:', params);
    throw error;
  }
};

// Function to execute queries with transaction
const executeTransaction = async (queries) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const results = [];
    for (const { query, params } of queries) {
      const [rows] = await connection.query(query, params || []);
      results.push(rows);
    }
    
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    console.error('❌ Transaction error:', error.message);
    throw error;
  } finally {
    connection.release();
  }
};

// Function to check if database exists
const checkDatabaseExists = async () => {
  try {
    const [rows] = await executeQuery(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [dbConfig.database]
    );
    return rows.length > 0;
  } catch (error) {
    console.error('❌ Error checking database existence:', error.message);
    return false;
  }
};

// Function to get database statistics
const getDatabaseStats = async () => {
  try {
    const tables = await executeQuery(`
      SELECT 
        TABLE_NAME, 
        TABLE_ROWS 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ?
    `, [dbConfig.database]);
    
    return tables;
  } catch (error) {
    console.error('❌ Error getting database stats:', error.message);
    return [];
  }
};

// Function to close the connection
const closeDatabase = async () => {
  if (pool) {
    await pool.end();
    console.log('✅ Database connection closed');
    pool = null;
  }
};

// Health check function
const healthCheck = async () => {
  try {
    const [rows] = await executeQuery('SELECT 1 as health');
    return {
      status: 'healthy',
      database: dbConfig.database,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

module.exports = {
  connectToDatabase,
  getPool,
  executeQuery,
  executeTransaction,
  checkDatabaseExists,
  getDatabaseStats,
  closeDatabase,
  healthCheck,
  dbConfig
};