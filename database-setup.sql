-- Database Setup Examples for Authentication
-- Choose the appropriate SQL for your database type

-- ============================================
-- PostgreSQL Example
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert example user (password: 'admin123' - in production, use hashed password)
-- INSERT INTO users (email, password, name, role) 
-- VALUES ('admin@nexta.com', 'admin123', 'Admin User', 'admin');

-- ============================================
-- MySQL Example
-- ============================================
-- CREATE TABLE IF NOT EXISTS users (
--   id INT AUTO_INCREMENT PRIMARY KEY,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   password VARCHAR(255) NOT NULL,
--   name VARCHAR(255),
--   role VARCHAR(50) DEFAULT 'user',
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- ============================================
-- SQLite Example
-- ============================================
-- CREATE TABLE IF NOT EXISTS users (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   email TEXT UNIQUE NOT NULL,
--   password TEXT NOT NULL,
--   name TEXT,
--   role TEXT DEFAULT 'user',
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

