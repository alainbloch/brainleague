import type { FriendshipsRepository } from '../models/friendshipsRepository.js';
import type { UsersRepository, User } from '../models/usersRepository.js';
import type { NotificationService } from './notificationService.js';

interface FriendshipServiceOptions {
  friendshipsRepo: FriendshipsRepository;
  usersRepo: UsersRepository;
  notifications: NotificationService;
  clock?: () => number;
}

export type RelationshipStatus = 'self' | 'none' | 'outgoing' | 'incoming' | 'friends';

export type FriendActionResult =
  { status: 'unchanged' } | { status: 'accepted' } | { status: 'pending' } | { status: 'none' };

/**
 * Friendship use cases. Owns the state machine:
 *   none -> pending (by requester) -> accepted
 * Edges are stored canonically in the repository; this service decides which
 * transitions are legal and emits notifications on each side effect.
 */
export class FriendshipService {
  friendships: FriendshipsRepository;
  users: UsersRepository;
  notifications: NotificationService;
  clock: () => number;

  constructor({
    friendshipsRepo,
    usersRepo,
    notifications,
    clock = () => Date.now(),
  }: FriendshipServiceOptions) {
    this.friendships = friendshipsRepo;
    this.users = usersRepo;
    this.notifications = notifications;
    this.clock = clock;
  }

  /**
   * The relationship of `viewerId` toward `targetId` from the viewer's
   * perspective: 'self' | 'none' | 'outgoing' (viewer requested) |
   * 'incoming' (target requested) | 'friends'.
   */
  statusBetween(viewerId: string, targetId: string): RelationshipStatus {
    if (viewerId === targetId) return 'self';
    const edge = this.friendships.findBetween(viewerId, targetId);
    if (!edge) return 'none';
    if (edge.status === 'accepted') return 'friends';
    return edge.requesterId === viewerId ? 'outgoing' : 'incoming';
  }

  friendIds(userId: string): string[] {
    return this.friendships.friendIds(userId);
  }

  countFriends(userId: string): number {
    return this.friendships.friendIds(userId).length;
  }

  incomingCount(userId: string): number {
    return this.friendships.countPendingIncoming(userId);
  }

  /**
   * Send a friend request from `fromId` to `toId`. Idempotent per current
   * state: re-requesting is a no-op, and if the target already requested us,
   * this flips the pair to accepted. Emits a 'friend-request' notification.
   */
  async request(fromId: string, toId: string): Promise<FriendActionResult> {
    if (fromId === toId) throw new Error('You cannot friend yourself.');
    const target = this.users.findById(toId);
    if (!target) throw new Error('User not found.');

    const status = this.statusBetween(fromId, toId);
    if (status === 'friends' || status === 'outgoing') {
      return { status: 'unchanged' };
    }
    if (status === 'incoming') {
      this.friendships.accept(toId, fromId, this.clock());
      await this.notifications.notify({
        userId: fromId,
        type: 'friend-accepted',
        payload: { friendId: toId, friendName: target.name },
        createdAt: this.clock(),
      });
      return { status: 'accepted' };
    }

    this.friendships.createPending(fromId, toId, this.clock());
    await this.notifications.notify({
      userId: toId,
      type: 'friend-request',
      payload: { requesterId: fromId, requesterName: this.users.findById(fromId)?.name },
      createdAt: this.clock(),
    });
    return { status: 'pending' };
  }

  /** Accept an incoming request. Emits a 'friend-accepted' notification. */
  async accept(userId: string, otherId: string): Promise<FriendActionResult> {
    if (this.statusBetween(userId, otherId) !== 'incoming') {
      throw new Error('No pending request from this user.');
    }
    this.friendships.accept(userId, otherId, this.clock());
    await this.notifications.notify({
      userId: otherId,
      type: 'friend-accepted',
      payload: { friendId: userId, friendName: this.users.findById(userId)?.name },
      createdAt: this.clock(),
    });
    return { status: 'accepted' };
  }

  /** Remove an edge: unfriends, cancels an outgoing request, or declines. */
  remove(userId: string, otherId: string): FriendActionResult {
    if (this.statusBetween(userId, otherId) === 'none') {
      throw new Error('Not connected to this user.');
    }
    this.friendships.remove(userId, otherId);
    return { status: 'none' };
  }
}

export type { User };
