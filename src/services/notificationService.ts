import type {
  NotificationsRepository,
  Notification,
  NotificationType,
} from '../models/notificationsRepository.js';

interface NotificationServiceOptions {
  notificationsRepo: NotificationsRepository;
  clock?: () => number;
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  payload?: Record<string, unknown>;
  createdAt?: number;
}

/**
 * Notification inbox use cases. Prepared for a future notification UI: every
 * friendship side effect funnels through here, and consumers can list unread
 * counts / mark-as-read today.
 */
export class NotificationService {
  readonly repo: NotificationsRepository;
  readonly clock: () => number;

  constructor({ notificationsRepo, clock = () => Date.now() }: NotificationServiceOptions) {
    this.repo = notificationsRepo;
    this.clock = clock;
  }

  notify({ userId, type, payload, createdAt }: NotifyInput): { ok: boolean } {
    this.repo.create({
      userId,
      type,
      payload: payload || {},
      createdAt: createdAt ?? this.clock(),
    });
    return { ok: true };
  }

  listForUser(userId: string, { limit = 50 } = {}): Notification[] {
    return this.repo.listForUser(userId, { limit });
  }

  unreadCount(userId: string): number {
    return this.repo.unreadCount(userId);
  }

  markAllRead(userId: string): number {
    return this.repo.markAllRead(userId, this.clock());
  }
}
