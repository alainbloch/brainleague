import type Database from 'better-sqlite3';

/**
 * Session persistence. Only the SHA-256 digest of a session token is stored,
 * so a database leak does not expose usable session cookies (kamae pattern).
 * A session row exists to be matched, deleted, and garbage-collected.
 */
export class SessionsRepository {
  constructor(private db: Database.Database) {}

  create(tokenHash: string, userId: string, expiresAt: number): void {
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, userId, expiresAt);
  }

  /** Return the user id if the session is present and not yet expired. */
  findUserId(tokenHash: string, now: number): string | null {
    const row = this.db
      .prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(tokenHash, now) as { user_id: string } | undefined;
    return row ? row.user_id : null;
  }

  delete(tokenHash: string): boolean {
    return this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash).changes > 0;
  }

  deleteAllForUser(userId: string): number {
    return this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
  }

  deleteExpired(now: number): number {
    return this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes;
  }
}
