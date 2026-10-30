import { randomToken, digest } from './crypto.js';
import type { SessionsRepository } from '../models/sessionsRepository.js';

interface SessionServiceOptions {
  sessionsRepo: SessionsRepository;
  config: { sessionDurationMs: number; isProduction: boolean };
  clock?: () => number;
  crypto?: { randomToken: () => string; digest: (value: string) => string };
}

export interface CreatedSession {
  token: string;
  expiresAt: number;
}

/** Session lifecycle: issue opaque cookie tokens, resolve identities. */
export class SessionService {
  readonly sessions: SessionsRepository;
  readonly config: SessionServiceOptions['config'];
  readonly clock: () => number;
  readonly crypto: { randomToken: () => string; digest: (value: string) => string };

  constructor({
    sessionsRepo,
    config,
    clock = () => Date.now(),
    crypto = { randomToken, digest },
  }: SessionServiceOptions) {
    this.sessions = sessionsRepo;
    this.config = config;
    this.clock = clock;
    this.crypto = crypto;
  }

  /** Create a new session and return { token, expiresAt }. */
  createForUser(userId: string): CreatedSession {
    const token = this.crypto.randomToken();
    const tokenHash = this.crypto.digest(token);
    const expiresAt = this.clock() + this.config.sessionDurationMs;
    this.sessions.create(tokenHash, userId, expiresAt);
    return { token, expiresAt };
  }

  /**
   * Resolve a raw cookie token to a user id. Runs a lightweight digest match so
   * only valid-length tokens reach the database. Returns null when absent/expired.
   */
  resolve(token: string | null | undefined): string | null {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    return this.sessions.findUserId(this.crypto.digest(token), this.clock());
  }

  /** Build the Set-Cookie attributes shared by every session mutation. */
  cookieValue(token: string, maxAgeSeconds: number): string {
    const secure = this.config.isProduction ? '; Secure' : '';
    return `usertest_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  }

  destroy(token: string | null | undefined): boolean {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
    return this.sessions.delete(this.crypto.digest(token));
  }

  revokeAllForUser(userId: string): number {
    return this.sessions.deleteAllForUser(userId);
  }

  garbageCollect(): number {
    return this.sessions.deleteExpired(this.clock());
  }
}
