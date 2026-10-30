import type Database from 'better-sqlite3';

/**
 * Friendship edges. Pairs are stored canonically (user_id < friend_id) so there
 * is exactly one row per pair; requester_id records who sent the pending
 * request. Status: 'pending' | 'accepted'. Deleting a row removes the edge
 * (unfriend, cancel, or decline).
 */
export type FriendshipStatus = 'pending' | 'accepted';

export interface FriendshipEdge {
  userId: string;
  friendId: string;
  requesterId: string;
  status: FriendshipStatus;
  createdAt: number;
  respondedAt: number | null;
}

interface FriendshipRow {
  user_id: string;
  friend_id: string;
  requester_id: string;
  status: FriendshipStatus;
  created_at: number;
  responded_at: number | null;
}

export class FriendshipsRepository {
  constructor(private db: Database.Database) {}

  /** Canonicalize a pair to (user_id, friend_id) with user_id < friend_id. */
  private canonical(a: string, b: string): [string, string] {
    return a < b ? [a, b] : [b, a];
  }

  findBetween(a: string, b: string): FriendshipEdge | null {
    const [userId, friendId] = this.canonical(a, b);
    const row = this.db
      .prepare('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?')
      .get(userId, friendId) as FriendshipRow | undefined;
    if (!row) return null;
    return {
      userId: row.user_id,
      friendId: row.friend_id,
      requesterId: row.requester_id,
      status: row.status,
      createdAt: row.created_at,
      respondedAt: row.responded_at,
    };
  }

  createPending(requesterId: string, targetId: string, now: number): FriendshipEdge {
    const [userId, friendId] = this.canonical(requesterId, targetId);
    this.db
      .prepare(
        `INSERT INTO friendships (user_id, friend_id, requester_id, status, created_at)
         VALUES (?, ?, ?, 'pending', ?)`,
      )
      .run(userId, friendId, requesterId, now);
    return this.findBetween(requesterId, targetId)!;
  }

  accept(requesterId: string, targetId: string, now: number): FriendshipEdge {
    const [userId, friendId] = this.canonical(requesterId, targetId);
    this.db
      .prepare(
        `UPDATE friendships SET status = 'accepted', responded_at = ? WHERE user_id = ? AND friend_id = ?`,
      )
      .run(now, userId, friendId);
    return this.findBetween(requesterId, targetId)!;
  }

  remove(a: string, b: string): boolean {
    const [userId, friendId] = this.canonical(a, b);
    return (
      this.db
        .prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?')
        .run(userId, friendId).changes > 0
    );
  }

  /** Ids of every user joined to `userId` by an accepted edge. */
  friendIds(userId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT user_id, friend_id FROM friendships
         WHERE status = 'accepted' AND (user_id = ? OR friend_id = ?)`,
      )
      .all(userId, userId) as Array<{ user_id: string; friend_id: string }>;
    return rows.map((r) => (r.user_id === userId ? r.friend_id : r.user_id));
  }

  /** Pending edges where `userId` is the target of the request. */
  incomingIds(userId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT requester_id, user_id, friend_id FROM friendships
         WHERE status = 'pending' AND (user_id = ? OR friend_id = ?)`,
      )
      .all(userId, userId) as Array<{ requester_id: string; user_id: string; friend_id: string }>;
    return rows
      .filter((r) => r.requester_id !== userId)
      .map((r) => (r.user_id === userId ? r.friend_id : r.user_id));
  }

  countPendingIncoming(userId: string): number {
    return this.incomingIds(userId).length;
  }

  /** Total pending requests across the whole instance (admin stats). */
  countPending(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM friendships WHERE status = 'pending'")
      .get() as { n: number };
    return row.n;
  }
}
