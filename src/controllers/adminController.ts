import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Admin-only user management: dashboard stats, full searchable user list, role
 * changes, account deletion, user editing, and broadcasts. All guards live in
 * the admin service.
 */
export class AdminController {
  admin: ContainerServices['admin'];

  constructor({ admin }: { admin: ContainerServices['admin'] }) {
    this.admin = admin;
  }

  async dashboard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const stats = this.admin.stats();
    return reply.view('admin/dashboard', {
      pageTitle: 'Admin',
      user: request.user,
      stats,
      adminPending: stats.pendingFriendRequests,
    });
  }

  async listUsers(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { q?: string; page?: string; notice?: string };
    const q = query.q ?? '';
    const data = this.admin.listUsers({
      query: q,
      page: Number(query.page) || 1,
      perPage: 20,
    });
    const notices: Record<string, string> = { updated: 'The user was updated.' };
    const notice = query.notice ? notices[query.notice] : undefined;
    return reply.view('admin/users', {
      pageTitle: 'Manage users',
      user: request.user,
      data,
      q: String(q),
      notice: notice || null,
    });
  }

  async changeRole(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as { role?: string };
    const params = request.params as { id?: string };
    const query = (request.query || {}) as { q?: string };
    const { role } = body;
    try {
      this.admin.changeRole(request.user!.id, params.id!, role || '');
      return reply.redirect(`/admin/users?q=${encodeURIComponent(query.q || '')}`);
    } catch (error) {
      return reply.view('admin/users', {
        pageTitle: 'Manage users',
        user: request.user,
        data: this.admin.listUsers({ query: query.q || '' }),
        q: query.q || '',
        error: errorMessage(error),
      });
    }
  }

  async deleteUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id?: string };
    const query = (request.query || {}) as { q?: string };
    try {
      this.admin.deleteUser(request.user!.id, params.id!);
      return reply.redirect(`/admin/users?q=${encodeURIComponent(query.q || '')}`);
    } catch (error) {
      return reply.view('admin/users', {
        pageTitle: 'Manage users',
        user: request.user,
        data: this.admin.listUsers({ query: query.q || '' }),
        q: query.q || '',
        error: errorMessage(error),
      });
    }
  }

  /** Edit a user's name/email/password (admin vouches, no email verification). */
  async editUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id?: string };
    const target = this.admin.getUser(params.id!);
    if (!target) return reply.redirect('/admin/users');
    return reply.view('admin/edit-user', {
      pageTitle: `Edit ${target.name}`,
      user: request.user,
      target,
      values: { name: target.name, email: target.email },
    });
  }

  async updateUser(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { id?: string };
    const body = (request.body || {}) as { name?: string; email?: string; password?: string };
    const { name, email, password } = body;
    try {
      this.admin.updateUser(params.id!, { name, email, password });
      return reply.redirect(`/admin/users?q=${encodeURIComponent(name || '')}&notice=updated`);
    } catch (error) {
      const target = this.admin.getUser(params.id!);
      return reply.view('admin/edit-user', {
        pageTitle: target ? `Edit ${target.name}` : 'Edit user',
        user: request.user,
        target,
        values: { name: name || '', email: email || '' },
        error: errorMessage(error),
      });
    }
  }

  /** Broadcast page: sends a system notification to every user. */
  async showBroadcast(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('admin/broadcast', {
      pageTitle: 'Broadcast notification',
      user: request.user,
      stats: this.admin.stats(),
      values: { message: '' },
    });
  }

  async sendBroadcast(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as { message?: string };
    const { message } = body;
    try {
      const { recipients } = this.admin.broadcast(request.user!.id, message || '');
      return reply.view('admin/broadcast', {
        pageTitle: 'Broadcast notification',
        user: request.user,
        stats: this.admin.stats(),
        notice: `Notification sent to ${recipients} user${recipients === 1 ? '' : 's'}.`,
        values: { message: '' },
      });
    } catch (error) {
      return reply.view('admin/broadcast', {
        pageTitle: 'Broadcast notification',
        user: request.user,
        stats: this.admin.stats(),
        error: errorMessage(error),
        values: { message: message || '' },
      });
    }
  }
}
