// Users who can log in, and signed login sessions. Passwords are stored as
// scrypt hashes (Node's built-in crypto, no extra packages).
import crypto from "crypto";
import { stmt } from "@/lib/nexta-db";

export type Role = "admin" | "staff";

export type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  created_at: string;
};

type UserRow = User & { password_hash: string };

export class UserError extends Error {}

const SESSION_DAYS = 7;
const MIN_PASSWORD = 8;

// ---------------------------------------------------------------- passwords

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function passwordMatches(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------- users

const g = globalThis as typeof globalThis & { __nextaUsersSeeded?: boolean };

/**
 * First start with user accounts: create the two logins Nexta used to have
 * hard-coded, so nobody is locked out. They can be deleted once real accounts exist.
 */
function ensureSeeded() {
  if (g.__nextaUsersSeeded) return;
  const { n } = stmt("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n === 0) {
    insertUser({ email: "admin@nexta.com", name: "Administrator", role: "admin", password: "admin123" });
    insertUser({ email: "user@nexta.com", name: "Staff", role: "staff", password: "user123" });
    console.log("Created the default logins admin@nexta.com and user@nexta.com; replace them under Users");
  }
  g.__nextaUsersSeeded = true;
}

function insertUser(u: { email: string; name: string; role: Role; password: string }) {
  return stmt(
    "INSERT INTO users (email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(u.email, u.name, u.role, hashPassword(u.password), new Date().toISOString());
}

const publicUser = ({ password_hash: _, ...user }: UserRow): User => user;

export function listUsers(): User[] {
  ensureSeeded();
  return (stmt("SELECT * FROM users ORDER BY role, name, email").all() as UserRow[]).map(publicUser);
}

function getUserRow(id: number) {
  ensureSeeded();
  return stmt("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) {
    throw new UserError(`The password must be at least ${MIN_PASSWORD} characters`);
  }
  return password;
}

export function createUser(input: { email?: unknown; name?: unknown; role?: unknown; password?: unknown }): User {
  ensureSeeded();
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new UserError("Enter a valid email address");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new UserError("Enter a name");
  const role: Role = input.role === "admin" ? "admin" : "staff";
  const password = validatePassword(input.password);

  if (stmt("SELECT 1 FROM users WHERE email = ?").get(email)) {
    throw new UserError("A user with this email already exists");
  }
  const { lastInsertRowid } = insertUser({ email, name, role, password });
  return publicUser(getUserRow(Number(lastInsertRowid))!);
}

function adminCount() {
  return (stmt("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n;
}

export function deleteUser(id: number, actingUserId: number) {
  const user = getUserRow(id);
  if (!user) throw new UserError("User not found");
  if (id === actingUserId) throw new UserError("You can't delete your own account");
  if (user.role === "admin" && adminCount() <= 1) throw new UserError("You can't delete the last admin");
  stmt("DELETE FROM users WHERE id = ?").run(id);
}

/** Admin changes a user's role and/or sets a new password. A new password logs that user out everywhere. */
export function updateUser(id: number, actingUserId: number, input: { role?: unknown; password?: unknown }): User {
  const user = getUserRow(id);
  if (!user) throw new UserError("User not found");

  if (input.role !== undefined) {
    const role: Role = input.role === "admin" ? "admin" : "staff";
    if (user.role === "admin" && role !== "admin") {
      if (id === actingUserId) throw new UserError("You can't remove your own admin rights");
      if (adminCount() <= 1) throw new UserError("You can't remove the last admin");
    }
    stmt("UPDATE users SET role = ? WHERE id = ?").run(role, id);
  }
  if (input.password !== undefined) {
    stmt("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(validatePassword(input.password)), id);
  }
  return publicUser(getUserRow(id)!);
}

/** The user for an email + password, or null. Takes the same time whether or not the email exists. */
export function verifyLogin(email: string, password: string): User | null {
  ensureSeeded();
  const user = stmt("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as UserRow | undefined;
  // Hash anyway for unknown emails, so response time doesn't reveal which emails exist
  const ok = passwordMatches(password, user?.password_hash ?? `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`);
  return user && ok ? publicUser(user) : null;
}

// ---------------------------------------------------------------- sessions

/** Secret that signs session cookies: NEXTA_SECRET, else one generated once and kept in nexta.db. */
function sessionSecret(): string {
  if (process.env.NEXTA_SECRET) return process.env.NEXTA_SECRET;
  const row = stmt("SELECT value FROM settings WHERE key = '__session_secret'").get() as { value: string } | undefined;
  if (row) return row.value;
  const secret = crypto.randomBytes(32).toString("hex");
  stmt("INSERT OR IGNORE INTO settings (key, value) VALUES ('__session_secret', ?)").run(secret);
  return (stmt("SELECT value FROM settings WHERE key = '__session_secret'").get() as { value: string }).value;
}

// Part of the password hash is signed in too, so setting a new password ends old sessions
function sign(userId: number, expires: number, passwordHash: string) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(`${userId}.${expires}.${passwordHash.slice(-16)}`)
    .digest("base64url");
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

export function createSessionToken(user: User): string {
  const row = getUserRow(user.id)!;
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  return `${user.id}.${expires}.${sign(user.id, expires, row.password_hash)}`;
}

/** The logged-in user for a session cookie value, or null if it's forged, expired, or the user was deleted. */
export function userFromSessionToken(token: string | undefined): User | null {
  if (!token) return null;
  const [id, expires, signature] = token.split(".");
  const userId = Number(id);
  const expiresAt = Number(expires);
  if (!Number.isInteger(userId) || !Number.isFinite(expiresAt) || !signature || expiresAt < Date.now()) return null;

  const row = getUserRow(userId);
  if (!row) return null;
  const expected = Buffer.from(sign(userId, expiresAt, row.password_hash));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  return publicUser(row);
}
