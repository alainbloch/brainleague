/**
 * Admin user-management use cases. Guards: an admin cannot delete their own
 * account, and the last admin cannot be demoted or deleted, so a deployment
 * can never lose all administrative access (mirrors the last-admin lock
 * pattern used in related projects).
 */
import { hashPassword } from './crypto.js';
import type { UsersRepository, User } from '../models/usersRepository.js';
import type { FriendshipsRepository } from '../models/friendshipsRepository.js';
import type { NotificationsRepository } from '../models/notificationsRepository.js';
import type { SessionsRepository } from '../models/sessionsRepository.js';

interface AdminServiceOptions {
  usersRepo: UsersRepository;
  friendshipsRepo: FriendshipsRepository;
  notificationsRepo: NotificationsRepository;
  sessionsRepo: SessionsRepository;
  clock?: () => number;
  crypto?: { hashPassword: typeof hashPassword };
}

export interface AdminUserList {
  users: User[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

export interface AdminStats {
  users: number;
  admins: number;
  pendingFriendRequests: number;
}

export class AdminService {
  users: UsersRepository;
  friendships: FriendshipsRepository;
  notifications: NotificationsRepository;
  sessions: SessionsRepository;
  clock: () => number;
  crypto: { hashPassword: typeof hashPassword };

  constructor({
    usersRepo,
    friendshipsRepo,
    notificationsRepo,
    sessionsRepo,
    clock = () => Date.now(),
    crypto = { hashPassword },
  }: AdminServiceOptions) {
    this.users = usersRepo;
    this.friendships = friendshipsRepo;
    this.notifications = notificationsRepo;
    this.sessions = sessionsRepo;
    this.clock = clock;
    this.crypto = crypto;
  }

  listUsers({ query = '', page = 1, perPage = 20 } = {}): AdminUserList {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePer = Math.min(100, Math.max(1, Math.floor(perPage) || 20));
    const { rows, total } = this.users.list({
      query,
      limit: safePer,
      offset: (safePage - 1) * safePer,
    });
    return {
      users: rows,
      total,
      page: safePage,
      perPage: safePer,
      pages: Math.max(1, Math.ceil(total / safePer)),
    };
  }

  stats(): AdminStats {
    const { total } = this.users.list({ limit: 1 });
    return {
      users: total,
      admins: this.users.countAdmins(),
      pendingFriendRequests: this.friendships.countPending(),
    };
  }

  /**
   * Send a 'system' notification to every account on the instance. One row per
   * user is created so existing inbox/unread tooling needs no changes. Returns
   * the number of recipients.
   */
  broadcast(actorId: string, message: string): { recipients: number } {
    const text = String(message || '').trim();
    if (!text) throw new Error('Message is required.');
    if (text.length > 2000) throw new Error('Message must be 2000 characters or fewer.');
    const actor = this.users.findById(actorId);
    return {
      recipients: this.notifications.createForAllUsers({
        type: 'system',
        payload: { message: text, broadcastBy: actor?.name || 'Admin' },
        createdAt: this.clock(),
      }),
    };
  }

  /**
   * Edit a user's name/email/password as an administrator. Unlike the
   * self-service flows no verification link or current-password proof is
   * required (the admin vouches). Email/password changes bump
   * credential_version, which signs the target out of existing sessions.
   * `password` is optional — omit or leave blank to keep the current password.
   */
  updateUser(
    targetId: string,
    { name, email, password }: { name?: string; email?: string; password?: string },
  ): User | null {
    const target = this.users.findById(targetId);
    if (!target) throw new Error('User not found.');

    const cleanName = String(name || '').trim();
    if (!cleanName || cleanName.length > 120) {
      throw new Error('Name is required (max 120 characters).');
    }
    const cleanEmail = String(email || '')
      .trim()
      .toLowerCase();
    if (cleanEmail.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      throw new Error('Enter a valid email address.');
    }
    const existing = this.users.findByEmail(cleanEmail);
    if (existing && existing.id !== targetId) {
      throw new Error('That email address is not available.');
    }
    if (password !== undefined && password !== '') {
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        throw new Error('Password must be 8–128 characters.');
      }
    }

    const timestamp = this.clock();
    if (cleanEmail !== target.email) {
      // Change the email through the shared path so credential_version bumps
      // and every existing session is revoked (kamae pattern).
      this.users.changeEmail(targetId, cleanEmail, timestamp);
      this.sessions.deleteAllForUser(targetId);
    }
    if (cleanName !== target.name) {
      this.users.updateName(targetId, cleanName, timestamp);
    }
    if (password !== undefined && password !== '') {
      this.users.replacePassword(targetId, this.crypto.hashPassword(password), timestamp);
      this.sessions.deleteAllForUser(targetId);
    }
    return this.users.findById(targetId);
  }

  /** Fetch one user by id (for the edit page), or null. */
  getUser(targetId: string): User | null {
    return this.users.findById(targetId);
  }

  /** Promote/demote a user. Throws when the target is the last admin. */
  changeRole(actorId: string, targetId: string, role: string): User | null {
    if (targetId === actorId) throw new Error('You cannot change your own role.');
    if (role !== 'user' && role !== 'admin') throw new Error('Invalid role.');
    const target = this.users.findById(targetId);
    if (!target) throw new Error('User not found.');
    if (target.role === 'admin' && role === 'user' && this.users.countAdmins() <= 1) {
      throw new Error('Cannot demote the last administrator.');
    }
    return this.users.changeRole(targetId, role, this.clock());
  }

  deleteUser(actorId: string, targetId: string): boolean {
    if (targetId === actorId) throw new Error('You cannot delete your own account.');
    const target = this.users.findById(targetId);
    if (!target) throw new Error('User not found.');
    if (target.role === 'admin' && this.users.countAdmins() <= 1) {
      throw new Error('Cannot delete the last administrator.');
    }
    // Cascading FKs remove sessions, tokens, friendships, and notifications.
    return this.users.delete(targetId);
  }
}
