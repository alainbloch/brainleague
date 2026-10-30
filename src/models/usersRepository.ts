import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

/** Mapped user row exposed across services/controllers (never the raw row). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  avatarPath: string | null;
  passwordHash: string;
  credentialVersion: number;
  emailVerifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_path: string | null;
  password_hash: string;
  credential_version: number;
  email_verified_at: number | null;
  created_at: number;
  updated_at: number;
}

/** A minimal row mapper shared by repositories. Keeps column access explicit. */
export function mapUser(row: UserRow | undefined): User | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === 'admin' ? 'admin' : 'user',
    avatarPath: row.avatar_path || null,
    passwordHash: row.password_hash,
    credentialVersion: row.credential_version,
    emailVerifiedAt: row.email_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateUserInput {
  id?: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  role?: 'admin' | 'user';
}

export interface ListUsersOptions {
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ListUsersResult {
  rows: User[];
  total: number;
}

/**
 * Persistence layer for user accounts. Owns SQL for the users table only;
 * domain rules (password policy, revocation semantics) live in services.
 */
export class UsersRepository {
  constructor(private db: Database.Database) {}

  findByEmail(email: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      UserRow | undefined;
    return mapUser(row);
  }

  findById(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return mapUser(row);
  }

  create({
    id = randomUUID(),
    name,
    email,
    passwordHash,
    createdAt,
    role = 'user',
  }: CreateUserInput): User {
    this.db
      .prepare(
        `INSERT INTO users (id, name, email, password_hash, credential_version, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      )
      .run(id, name, email, passwordHash, role, createdAt, createdAt);
    return this.findById(id)!;
  }

  /** Mark an account email-verified and bump credential_version at the same time. */
  verifyEmail(id: string, verifiedAt: number): User {
    this.db
      .prepare(
        `UPDATE users
         SET email_verified_at = ?, updated_at = ?, credential_version = credential_version + 1
         WHERE id = ?`,
      )
      .run(verifiedAt, verifiedAt, id);
    return this.findById(id)!;
  }

  replacePassword(id: string, passwordHash: string, timestamp: number): User {
    this.db
      .prepare(
        `UPDATE users
         SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?),
             credential_version = credential_version + 1, updated_at = ?
         WHERE id = ?`,
      )
      .run(passwordHash, timestamp, timestamp, id);
    return this.findById(id)!;
  }

  updateName(id: string, name: string, timestamp: number): User {
    this.db
      .prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
      .run(name, timestamp, id);
    return this.findById(id)!;
  }

  updateAvatar(id: string, avatarPath: string, timestamp: number): User {
    this.db
      .prepare('UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?')
      .run(avatarPath, timestamp, id);
    return this.findById(id)!;
  }

  /**
   * Change the account email and bump credential_version so all existing
   * sessions are revoked. Callers must guard against replay (see the
   * email-change service flow: pending link + credential-version match).
   */
  changeEmail(id: string, email: string, timestamp: number): User {
    this.db
      .prepare(
        `UPDATE users
         SET email = ?, updated_at = ?, credential_version = credential_version + 1
         WHERE id = ?`,
      )
      .run(email, timestamp, id);
    return this.findById(id)!;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
  }

  /** Update an account's role. Returns the updated user or null. */
  changeRole(id: string, role: 'admin' | 'user', timestamp: number): User | null {
    this.db
      .prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
      .run(role, timestamp, id);
    return this.findById(id);
  }

  /**
   * Page through accounts (all roles). `query` filters by name/email substring
   * (case-insensitive). Returns { rows, total } using LIMIT/OFFSET so the
   * directory and admin list share one implementation.
   */
  list({ query = '', limit = 20, offset = 0 }: ListUsersOptions = {}): ListUsersResult {
    const q = `%${String(query).trim()}%`;
    const where = q === '%%' ? '' : 'WHERE lower(name) LIKE lower(?) OR lower(email) LIKE lower(?)';
    const params: string[] = q === '%%' ? [] : [q, q];
    const rows = (
      this.db
        .prepare(`SELECT * FROM users ${where} ORDER BY lower(name) ASC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as UserRow[]
    ).map((r) => mapUser(r)!);
    const total = (
      (this.db.prepare(`SELECT COUNT(*) AS n FROM users ${where}`).get(...params) as
        { n: number } | undefined) || { n: 0 }
    ).n;
    return { rows, total };
  }

  countAdmins(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as {
      n: number;
    };
    return row.n;
  }
}
