// Database utility for authentication
// Supports multiple database types: PostgreSQL, MySQL, SQLite, MongoDB

interface User {
  id?: number | string;
  email: string;
  password: string; // In production, this should be hashed
  name?: string;
  role?: string;
  createdAt?: Date;
}

// Database connection configuration
// Set these in your .env file
const DB_TYPE = process.env.DB_TYPE || 'none'; // 'postgres', 'mysql', 'sqlite', 'mongodb', 'none'
const DB_URL = process.env.DATABASE_URL || '';

/**
 * Find user by email from database
 * This function supports multiple database types
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  if (DB_TYPE === 'none' || !DB_URL) {
    return null; // Database not configured
  }

  try {
    switch (DB_TYPE) {
      case 'postgres':
        return await findUserPostgres(email);
      case 'mysql':
        return await findUserMySQL(email);
      case 'sqlite':
        return await findUserSQLite(email);
      case 'mongodb':
        return await findUserMongoDB(email);
      default:
        console.warn(`Unsupported database type: ${DB_TYPE}`);
        return null;
    }
  } catch (error) {
    console.error('Database query error:', error);
    return null;
  }
}

/**
 * PostgreSQL implementation
 */
async function findUserPostgres(email: string): Promise<User | null> {
  // Example using pg library (install: npm install pg @types/pg)
  // Uncomment and configure when ready to use PostgreSQL
  
  /*
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DB_URL });
  
  const result = await pool.query(
    'SELECT id, email, password, name, role FROM users WHERE email = $1',
    [email]
  );
  
  if (result.rows.length === 0) return null;
  
  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    password: result.rows[0].password,
    name: result.rows[0].name,
    role: result.rows[0].role,
  };
  */
  
  return null; // Not implemented yet
}

/**
 * MySQL implementation
 */
async function findUserMySQL(email: string): Promise<User | null> {
  // Example using mysql2 library (install: npm install mysql2)
  // Uncomment and configure when ready to use MySQL
  
  /*
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection(DB_URL);
  
  const [rows] = await connection.execute(
    'SELECT id, email, password, name, role FROM users WHERE email = ?',
    [email]
  );
  
  await connection.end();
  
  if (rows.length === 0) return null;
  
  return {
    id: rows[0].id,
    email: rows[0].email,
    password: rows[0].password,
    name: rows[0].name,
    role: rows[0].role,
  };
  */
  
  return null; // Not implemented yet
}

/**
 * SQLite implementation
 */
async function findUserSQLite(email: string): Promise<User | null> {
  // Example using better-sqlite3 library (install: npm install better-sqlite3)
  // Uncomment and configure when ready to use SQLite
  
  /*
  const Database = require('better-sqlite3');
  const db = new Database(DB_URL);
  
  const user = db.prepare('SELECT id, email, password, name, role FROM users WHERE email = ?').get(email);
  
  if (!user) return null;
  
  return {
    id: user.id,
    email: user.email,
    password: user.password,
    name: user.name,
    role: user.role,
  };
  */
  
  return null; // Not implemented yet
}

/**
 * MongoDB implementation
 */
async function findUserMongoDB(email: string): Promise<User | null> {
  // Example using mongodb library (install: npm install mongodb)
  // Uncomment and configure when ready to use MongoDB
  
  /*
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(DB_URL);
  
  await client.connect();
  const db = client.db();
  const users = db.collection('users');
  
  const user = await users.findOne({ email });
  
  await client.close();
  
  if (!user) return null;
  
  return {
    id: user._id.toString(),
    email: user.email,
    password: user.password,
    name: user.name,
    role: user.role,
  };
  */
  
  return null; // Not implemented yet
}

/**
 * Verify password (in production, use bcrypt to compare hashed passwords)
 */
export function verifyPassword(inputPassword: string, storedPassword: string): boolean {
  // For now, simple comparison
  // In production, use: bcrypt.compare(inputPassword, storedPassword)
  return inputPassword === storedPassword;
}

/**
 * Hash password (use this when creating users)
 */
export async function hashPassword(password: string): Promise<string> {
  // In production, use bcrypt:
  // const bcrypt = require('bcrypt');
  // return await bcrypt.hash(password, 10);
  
  // For now, return as-is (NOT SECURE - only for development)
  return password;
}

