import type Database from 'better-sqlite3';

/**
 * Single-purpose, expiring tokens used for email verification and password
 * reset. Only the SHA-256 digest is stored. Claiming is single-use: the row
 * is deleted when returned, so a link cannot be replayed (kamae pattern).
 */
export type TokenPurpose = 'verify' | 'reset';

export class TokensRepository {
  constructor(private db: Database.Database) {}

  create(tokenHash: string, userId: string, purpose: TokenPurpose, expiresAt: number): void {
    this.db
      .prepare('INSERT INTO tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)')
      .run(tokenHash, userId, purpose, expiresAt);
  }

  /** Atomic single-use claim. Returns user id or null. */
  claim(tokenHash: string, purpose: TokenPurpose, now: number): string | null {
    const row = this.db
      .prepare(
        `DELETE FROM tokens
         WHERE token_hash = ? AND purpose = ? AND expires_at > ?
         RETURNING user_id`,
      )
      .get(tokenHash, purpose, now) as { user_id: string } | undefined;
    return row ? row.user_id : null;
  }

  deleteAllForUser(userId: string): number {
    return this.db.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId).changes;
  }

  deleteExpired(now: number): number {
    return this.db.prepare('DELETE FROM tokens WHERE expires_at <= ?').run(now).changes;
  }
}
