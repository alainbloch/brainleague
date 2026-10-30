import type Database from 'better-sqlite3';

/**
 * Sliding-window rate limiting persisted in SQLite (kamae pattern). The window
 * is refreshed when it has elapsed, otherwise the counter increments. Keys are
 * scoped by action + identity (per-IP and per-email).
 */
export class RateLimitsRepository {
  constructor(private db: Database.Database) {}

  /**
   * Increment the counter for `key` within [windowStart, windowStart + windowMs].
   * Returns the new count. Uses an atomic upsert so concurrent attempts cannot
   * double-create duplicates.
   */
  increment(key: string, now: number, windowMs: number): number {
    const row = this.db
      .prepare(
        `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN expires_at <= ? THEN 1 ELSE count + 1 END,
           expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
         RETURNING count`,
      )
      .get(key, now + windowMs, now, now) as { count: number } | undefined;
    return row ? row.count : 1;
  }

  deleteExpired(now: number): number {
    return this.db.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').run(now).changes;
  }

  reset(key: string): number {
    return this.db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key).changes;
  }
}
