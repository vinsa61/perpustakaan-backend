require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runMigrations() {
  let connection;
  
  try {
    console.log('🚀 Starting database migrations...');
    
    // Connect to database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'perpustakaan',
      multipleStatements: true
    });
    
    console.log('✅ Connected to database');
    
    // Read and execute the main schema file
    const schemaPath = path.join(__dirname, 'Perpustakaan_FP_MBD_create2.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('📝 Executing main schema...');
      const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
      await connection.query(schemaSQL);
      console.log('✅ Main schema executed'); 
    }
    
    // Read and execute sample data
    const sampleDataPath = path.join(__dirname, 'migrations', 'sample_data.sql');
    if (fs.existsSync(sampleDataPath)) {
      console.log('📝 Inserting sample data...');
      const sampleSQL = fs.readFileSync(sampleDataPath, 'utf8');
      await connection.query(sampleSQL);
      console.log('✅ Sample data inserted');
    }
    
    console.log('🎉 All migrations completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigrations();