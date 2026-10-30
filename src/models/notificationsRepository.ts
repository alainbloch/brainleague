import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

/**
 * Notification inbox (built ahead of any UI consumers): typed messages with a
 * JSON payload, read-state, and per-user listing. The payload shape is free so
 * new notification types don't require a migration.
 */
export type NotificationType = 'friend-request' | 'friend-accepted' | 'system';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt: number | null;
  createdAt: number;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: string;
  read_at: number | null;
  created_at: number;
}

export class NotificationsRepository {
  constructor(private db: Database.Database) {}

  create({
    id = randomUUID(),
    userId,
    type,
    payload = {},
    createdAt,
  }: {
    id?: string;
    userId: string;
    type: NotificationType;
    payload?: Record<string, unknown>;
    createdAt: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO notifications (id, user_id, type, payload, read_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      )
      .run(id, userId, type, JSON.stringify(payload), createdAt);
  }

  listForUser(userId: string, { limit = 50 } = {}): Notification[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM notifications WHERE user_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(userId, limit) as NotificationRow[]
    ).map(mapNotification);
  }

  unreadCount(userId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(userId) as { n: number };
    return row.n;
  }

  markAllRead(userId: string, readAt: number): number {
    return this.db
      .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
      .run(readAt, userId).changes;
  }

  /**
   * Fan out one notification row to EVERY user in one statement (admin
   * broadcast). Each recipient gets an independently existing row so unread
   * counts and mark-as-read work per user without special-casing a broadcast.
   */
  createForAllUsers({
    type,
    payload,
    createdAt,
  }: {
    type: NotificationType;
    payload: Record<string, unknown>;
    createdAt: number;
  }): number {
    return this.db
      .prepare(
        `INSERT INTO notifications (id, user_id, type, payload, read_at, created_at)
         SELECT lower(hex(randomblob(16))), id, ?, ?, NULL, ?
         FROM users`,
      )
      .run(type, JSON.stringify(payload), createdAt).changes;
  }

  deleteAllForUser(userId: string): number {
    return this.db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId).changes;
  }
}

function mapNotification(row: NotificationRow): Notification {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    payload,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
