import type { UsersRepository, User } from '../models/usersRepository.js';
import type { FriendshipService, RelationshipStatus } from './friendshipService.js';
import type { NotificationService } from './notificationService.js';

interface DirectoryServiceOptions {
  usersRepo: UsersRepository;
  friendships: FriendshipService;
  notifications: NotificationService;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatarPath: string | null;
  role: 'admin' | 'user';
  emailVerified: boolean;
  createdAt: number;
}

export interface ListUsersOptions {
  query?: string;
  page?: number;
  perPage?: number;
}

export interface UserDirectory {
  users: PublicUser[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

export interface UserProfile {
  user: PublicUser;
  friends: PublicUser[];
  relationship: RelationshipStatus | 'self';
  unreadNotifications: number;
}

/**
 * Public user directory: paginated user list and profile lookup. Returns
 * public profile data only (never password hashes or auth internals).
 */
export class DirectoryService {
  users: UsersRepository;
  friendships: FriendshipService;
  notifications: NotificationService;

  constructor({ usersRepo, friendships, notifications }: DirectoryServiceOptions) {
    this.users = usersRepo;
    this.friendships = friendships;
    this.notifications = notifications;
  }

  listUsers({ query = '', page = 1, perPage = 20 }: ListUsersOptions = {}): UserDirectory {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePer = Math.min(50, Math.max(1, Math.floor(perPage) || 20));
    const { rows, total } = this.users.list({
      query,
      limit: safePer,
      offset: (safePage - 1) * safePer,
    });
    return {
      users: rows.map((u) => this.#publicUser(u)),
      total,
      page: safePage,
      perPage: safePer,
      pages: Math.max(1, Math.ceil(total / safePer)),
    };
  }

  /** Public profile of a user plus the signed-in viewer's friend state. */
  getProfile(viewerId: string, userId: string): UserProfile | null {
    const user = this.users.findById(userId);
    if (!user) return null;
    const friendIds = this.friendships.friendIds(userId);
    return {
      user: this.#publicUser(user),
      friends: friendIds
        .map((id) => this.users.findById(id))
        .filter((f): f is User => f !== null)
        .map((f) => this.#publicUser(f)),
      relationship: viewerId === userId ? 'self' : this.friendships.statusBetween(viewerId, userId),
      unreadNotifications: this.notifications.unreadCount(viewerId),
    };
  }

  #publicUser(user: User): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarPath: user.avatarPath,
      role: user.role,
      emailVerified: !!user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }
}
