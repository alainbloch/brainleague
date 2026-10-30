import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';

/** Notification inbox pages. The inbox itself is future-facing; today it shows
 * friend-request lifecycle events and a read/unread indicator. */
export class NotificationsController {
  notifications: ContainerServices['notifications'];

  constructor({ notifications }: { notifications: ContainerServices['notifications'] }) {
    this.notifications = notifications;
  }

  async showInbox(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const items = this.notifications.listForUser(request.user!.id);
    return reply.view('notifications', {
      pageTitle: 'Notifications',
      user: request.user,
      notifications: items,
    });
  }

  async markAllRead(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    this.notifications.markAllRead(request.user!.id);
    return reply.redirect('/notifications');
  }
}
