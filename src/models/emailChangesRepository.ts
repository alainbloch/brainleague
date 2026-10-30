import type Database from 'better-sqlite3';

/**
 * Pending email-change confirmations. Only the SHA-256 digest of the
 * confirmation token is stored. Confirming is single-use (row deleted on
 * claim) and records the credential version so a stale link cannot be applied
 * after a password/email change (kamae pattern).
 */
export interface PendingEmailChange {
  userId: string;
  newEmail: string;
  credentialVersion: number;
}

export class EmailChangesRepository {
  constructor(private db: Database.Database) {}

  create({
    tokenHash,
    userId,
    newEmail,
    credentialVersion,
    expiresAt,
  }: {
    tokenHash: string;
    userId: string;
    newEmail: string;
    credentialVersion: number;
    expiresAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO email_changes (token_hash, user_id, new_email, credential_version, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(tokenHash, userId, newEmail, credentialVersion, expiresAt);
  }

  /** Atomic single-use claim. Returns the pending change or null. */
  claim(tokenHash: string, now: number): PendingEmailChange | null {
    const row = this.db
      .prepare(
        `DELETE FROM email_changes
         WHERE token_hash = ? AND expires_at > ?
         RETURNING user_id, new_email, credential_version`,
      )
      .get(tokenHash, now) as
      { user_id: string; new_email: string; credential_version: number } | undefined;
    if (!row) return null;
    return {
      userId: row.user_id,
      newEmail: row.new_email,
      credentialVersion: row.credential_version,
    };
  }

  deleteAllForUser(userId: string): number {
    return this.db.prepare('DELETE FROM email_changes WHERE user_id = ?').run(userId).changes;
  }

  deleteExpired(now: number): number {
    return this.db.prepare('DELETE FROM email_changes WHERE expires_at <= ?').run(now).changes;
  }
}
