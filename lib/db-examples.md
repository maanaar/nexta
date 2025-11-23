# Database Authentication Setup Guide

This guide shows how to configure database authentication for different database types.

## Supported Databases

- PostgreSQL
- MySQL
- SQLite
- MongoDB

## Setup Instructions

### 1. PostgreSQL

**Install dependencies:**
```bash
npm install pg @types/pg
```

**Update `.env`:**
```
DB_TYPE=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

**Create users table:**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Uncomment PostgreSQL code in `lib/db.ts`** (lines marked with `/* */`)

---

### 2. MySQL

**Install dependencies:**
```bash
npm install mysql2
```

**Update `.env`:**
```
DB_TYPE=mysql
DATABASE_URL=mysql://user:password@localhost:3306/dbname
```

**Create users table:**
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Uncomment MySQL code in `lib/db.ts`**

---

### 3. SQLite

**Install dependencies:**
```bash
npm install better-sqlite3
```

**Update `.env`:**
```
DB_TYPE=sqlite
DATABASE_URL=./database.db
```

**Create users table:**
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Uncomment SQLite code in `lib/db.ts`**

---

### 4. MongoDB

**Install dependencies:**
```bash
npm install mongodb
```

**Update `.env`:**
```
DB_TYPE=mongodb
DATABASE_URL=mongodb://localhost:27017/dbname
```

**Create users collection** (MongoDB creates collections automatically):
```javascript
// Users will be stored in 'users' collection with this structure:
{
  _id: ObjectId,
  email: String,
  password: String,
  name: String,
  role: String,
  createdAt: Date
}
```

**Uncomment MongoDB code in `lib/db.ts`**

---

## Password Hashing (IMPORTANT)

For production, you should hash passwords using bcrypt:

**Install bcrypt:**
```bash
npm install bcrypt @types/bcrypt
```

**Update `lib/db.ts`** to use bcrypt:
```typescript
import bcrypt from 'bcrypt';

export function verifyPassword(inputPassword: string, storedPassword: string): boolean {
  return bcrypt.compareSync(inputPassword, storedPassword);
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}
```

**When creating users**, hash the password before storing:
```typescript
const hashedPassword = await hashPassword('userpassword');
// Store hashedPassword in database
```

---

## Testing

1. Set `DB_TYPE=none` in `.env` to use hardcoded credentials
2. Set `DB_TYPE` to your database type and configure `DATABASE_URL`
3. Uncomment the appropriate database code in `lib/db.ts`
4. Create a user in your database
5. Test login with database credentials

---

## Fallback Behavior

If database is not configured (`DB_TYPE=none`), the system will:
- Use hardcoded credentials as fallback
- Allow login with: `admin@nexta.com` / `admin123` or `user@nexta.com` / `user123`

