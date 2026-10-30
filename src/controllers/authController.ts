import config from '../config.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';

const COOKIE_NAME = 'usertest_session';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Thin HTTP layer for authentication. Controllers only parse the request,
 * call a service, and translate the result into a response — no domain logic.
 */
export class AuthController {
  identity: ContainerServices['identity'];
  sessions: ContainerServices['sessions'];
  config: typeof config;

  constructor({
    services,
    config: cfg = config,
  }: {
    services: ContainerServices;
    config?: typeof config;
  }) {
    this.identity = services.identity;
    this.sessions = services.sessions;
    this.config = cfg;
  }

  #ip(request: FastifyRequest): string {
    return request.ip || 'unknown';
  }

  #readToken(request: FastifyRequest): string | null {
    return request.cookies?.[COOKIE_NAME] || null;
  }

  #setSessionCookie(reply: FastifyReply, token: string): void {
    const maxAgeSeconds = this.config.sessionDurationMs / 1000;
    reply.header('Set-Cookie', this.sessions.cookieValue(token, maxAgeSeconds));
  }

  #clearSessionCookie(reply: FastifyReply): void {
    reply.header('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  async register(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as { name?: string; email?: string; password?: string };
    const { name, email, password } = body;
    try {
      const result = await this.identity.register(
        { name: name || '', email: email || '', password: password || '' },
        { ip: this.#ip(request) },
      );
      return reply.view('auth/sent', {
        pageTitle: result.verificationRequired ? 'Check your email' : 'Ready to sign in',
        message: !result.verificationRequired
          ? 'Email confirmation is not required. Sign in with your email and password.'
          : 'If this address is available, a verification email has been sent. ' +
            'Open the link in your email to confirm your account.',
      });
    } catch (error) {
      reply.code(400);
      return reply.view('auth/register', {
        pageTitle: 'Create account',
        error: errorMessage(error),
        values: { name: name || '', email: email || '' },
      });
    }
  }

  async showRegister(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('auth/register', {
      pageTitle: 'Create account',
      values: { name: '', email: '' },
    });
  }

  async login(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as { email?: string; password?: string };
    const { email, password } = body;
    try {
      const result = await this.identity.login(
        { email: email || '', password: password || '' },
        { ip: this.#ip(request) },
      );
      if (!result.ok) {
        reply.code(401);
        return reply.view('auth/login', {
          pageTitle: 'Sign in',
          error: result.reason,
          values: { email: email || '' },
        });
      }
      const { token } = this.identity.createSession(result.userId);
      this.#setSessionCookie(reply, token);
      return reply.redirect('/account');
    } catch (error) {
      reply.code(400);
      return reply.view('auth/login', {
        pageTitle: 'Sign in',
        error: errorMessage(error),
        values: { email: email || '' },
      });
    }
  }

  async showLogin(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    if (request.user) return reply.redirect('/account');
    return reply.view('auth/login', { pageTitle: 'Sign in', values: { email: '' } });
  }

  async verify(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { token?: string };
    const { token } = query;
    const result = this.identity.verify({ token }, { ip: this.#ip(request) });
    if (!result.ok) {
      return reply.view('auth/verify-failed', {
        pageTitle: 'Verification failed',
        error: result.reason,
      });
    }
    const session = this.identity.createSession(result.userId);
    this.#setSessionCookie(reply, session.token);
    return reply.redirect('/account');
  }

  async forgotGet(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    return reply.view('auth/forgot', { pageTitle: 'Forgot password', values: { email: '' } });
  }

  async forgotPost(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as { email?: string };
    const { email } = body;
    try {
      await this.identity.forgotPassword({ email: email || '' }, { ip: this.#ip(request) });
      return reply.view('auth/sent', {
        pageTitle: 'Check your email',
        message: 'If a verified account uses this address, a password-reset link has been sent.',
      });
    } catch (error) {
      reply.code(400);
      return reply.view('auth/forgot', {
        pageTitle: 'Forgot password',
        error: errorMessage(error),
        values: { email: email || '' },
      });
    }
  }

  async resetGet(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const query = (request.query || {}) as { token?: string; email?: string };
    const { token, email } = query;
    return reply.view('auth/reset', {
      pageTitle: 'Reset password',
      values: { token: token || '', email: email || '' },
    });
  }

  async resetPost(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const body = (request.body || {}) as {
      token?: string;
      email?: string;
      password?: string;
      passwordConfirm?: string;
    };
    const { token, email, password, passwordConfirm } = body;
    if (password !== passwordConfirm) {
      reply.code(400);
      return reply.view('auth/reset', {
        pageTitle: 'Reset password',
        error: 'Passwords do not match.',
        values: { token: token || '', email: email || '' },
      });
    }
    const result = this.identity.resetPassword(
      { email, token, password: password || '' },
      { ip: this.#ip(request) },
    );
    if (!result.ok) {
      reply.code(400);
      return reply.view('auth/reset', {
        pageTitle: 'Reset password',
        error: result.reason,
        values: { token: token || '', email: email || '' },
      });
    }
    this.#clearSessionCookie(reply);
    return reply.view('auth/reset-done', {
      pageTitle: 'Password updated',
      message: 'Your password has been updated. Sign in with your new password.',
    });
  }

  async logout(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const token = this.#readToken(request);
    if (token) this.identity.destroySession(token);
    this.#clearSessionCookie(reply);
    return reply.redirect('/login');
  }
}
