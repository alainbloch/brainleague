import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';
import type { AppConfig } from '../config.js';

const COOKIE_NAME = 'usertest_session';

const NOTICES: Record<string, string> = {
  'name-updated': 'Your name was updated.',
  'avatar-updated': 'Your profile photo was updated.',
  'email-sent': 'Check your new email address for a confirmation link.',
  'password-updated': 'Your password was updated. Other sessions were signed out.',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Account settings: edit display name, change email (verified), change
 * password (verified), and upload a profile avatar. Thin HTTP layer — all
 * domain rules live in the identity service and avatar storage adapter.
 */
export class SettingsController {
  identity: ContainerServices['identity'];
  sessions: ContainerServices['sessions'];
  config: AppConfig;

  constructor({ services, config }: { services: ContainerServices; config: AppConfig }) {
    this.identity = services.identity;
    this.sessions = services.sessions;
    this.config = config;
  }

  #ip(request: FastifyRequest): string {
    return request.ip || 'unknown';
  }

  #notice(request: FastifyRequest): { key: string; message: string } | null {
    const query = (request.query || {}) as { notice?: string };
    const key = query.notice;
    return key && NOTICES[key] ? { key, message: NOTICES[key] } : null;
  }

  #renderSettings(
    reply: FastifyReply,
    request: FastifyRequest,
    { error, values }: { error?: string; values?: { name?: string; email?: string } } = {},
  ): FastifyReply {
    const user = request.user!;
    return reply.view('settings', {
      pageTitle: 'Account settings',
      user,
      notice: this.#notice(request),
      error,
      values: values || { name: user.name, email: user.email },
    });
  }

  async showSettings(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return this.#renderSettings(reply, request);
  }

  async updateName(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as { name?: string };
    const { name } = body;
    try {
      this.identity.updateName(request.user!.id, name || '');
      return reply.redirect('/settings?notice=name-updated');
    } catch (error) {
      return this.#renderSettings(reply, request, {
        error: errorMessage(error),
        values: { name: name || '', email: request.user!.email },
      });
    }
  }

  async uploadAvatar(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const file = await request.file();
      if (!file) throw new Error('Choose an image file to upload.');
      const buffer = await file.toBuffer();
      await this.identity.updateAvatar(request.user!.id, {
        buffer,
        mimetype: file.mimetype,
      });
      return reply.redirect('/settings?notice=avatar-updated');
    } catch (error) {
      // Multipart errors surface as a failed request; re-render with the error.
      return this.#renderSettings(reply, request, {
        error: errorMessage(error),
      });
    }
  }

  async changeEmail(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as { email?: string; currentPassword?: string };
    const { email, currentPassword } = body;
    try {
      await this.identity.beginEmailChange(
        request.user!.id,
        { email: email || '', currentPassword },
        { ip: this.#ip(request) },
      );
      return reply.redirect('/settings?notice=email-sent');
    } catch (error) {
      return this.#renderSettings(reply, request, {
        error: errorMessage(error),
        values: { name: request.user!.name, email: email || '' },
      });
    }
  }

  async confirmEmailChange(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { token?: string };
    const { token } = query;
    const result = this.identity.confirmEmailChange({ token }, { ip: this.#ip(request) });
    if (!result.ok) {
      return reply.view('confirm-email-failed', {
        pageTitle: 'Email change not confirmed',
        error: result.reason,
      });
    }

    // The email change revoked every session; start one for this browser.
    const { token: sessionToken } = this.identity.createSession(result.userId);
    const maxAgeSeconds = this.config.sessionDurationMs / 1000;
    reply.header('Set-Cookie', this.sessions.cookieValue(sessionToken, maxAgeSeconds));
    return reply.view('confirm-email-done', {
      pageTitle: 'Email confirmed',
      user: this.identity.currentUser(sessionToken),
    });
  }

  async changePassword(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as {
      currentPassword?: string;
      newPassword?: string;
      passwordConfirm?: string;
    };
    const { currentPassword, newPassword, passwordConfirm } = body;
    if (newPassword !== passwordConfirm) {
      return this.#renderSettings(reply, request, {
        error: 'Passwords do not match.',
      });
    }
    try {
      await this.identity.changePassword(request.user!.id, {
        currentPassword,
        newPassword: newPassword || '',
      });
      // Sessions were revoked; start a fresh one for the current request.
      const { token } = this.identity.createSession(request.user!.id);
      const maxAgeSeconds = this.config.sessionDurationMs / 1000;
      reply.header('Set-Cookie', this.sessions.cookieValue(token, maxAgeSeconds));
      return reply.redirect('/settings?notice=password-updated');
    } catch (error) {
      return this.#renderSettings(reply, request, {
        error: errorMessage(error),
      });
    }
  }
}

export { COOKIE_NAME };
