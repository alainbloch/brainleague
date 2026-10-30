import { hashPassword, passwordMatches, randomToken, digest } from './crypto.js';
import type { UsersRepository, User } from '../models/usersRepository.js';
import type { EmailChangesRepository } from '../models/emailChangesRepository.js';
import type { SessionService } from './sessionService.js';
import type { TokenService } from './tokenService.js';
import type { RateLimitService } from './rateLimitService.js';
import type { MailService } from './mailService.js';
import type { AvatarStorage } from './avatarStorage.js';

interface AppConfigLike {
  appUrl: string;
  mail?: { transport: string };
}

/** Any object that can deliver a magic link (real SMTP-aware service or spy). */
interface MailLike {
  sendLink: (input: { email: string; subject: string; url: string }) => Promise<{ ok: boolean }>;
}

/** Structural type for an avatar storage adapter or test stub. */
interface AvatarStubLike {
  save: (buffer: Uint8Array, input: { mimetype: string }) => Promise<string>;
  remove: (relative: string | null | undefined) => Promise<void>;
}

export interface IdentityServiceOptions {
  usersRepo: UsersRepository;
  emailChangesRepo: EmailChangesRepository;
  tokens: TokenService;
  sessions: SessionService;
  mailer: MailService | MailLike;
  rateLimiter: RateLimitService;
  avatarStorage: AvatarStorage | AvatarStubLike;
  config: AppConfigLike;
  clock?: () => number;
  crypto?: {
    hashPassword: typeof hashPassword;
    passwordMatches: typeof passwordMatches;
    randomToken: () => string;
    digest: (value: string) => string;
  };
}

export interface AuthContext {
  ip?: string;
  email?: string;
}

export type MagicLinkPurpose = 'verify' | 'reset' | 'change-email';

/**
 * Domain rules for account creation and authentication. This service is
 * HTTP-free and depends on injected collaborators (repositories, session/token
 * services, hashing, clock, mailer) so it is fully unit-testable.
 *
 * It reproduces the kamae account model: email-verified registration, opaque
 * hashed sessions, single-use magic-link tokens, and credential-version
 * revocation on any password/credential change. Enumerability is avoided by
 * returning the same message whether or not an address already exists.
 */
export class IdentityService {
  users: UsersRepository;
  emailChanges: EmailChangesRepository;
  tokens: TokenService;
  sessions: SessionService;
  mailer: MailService | MailLike;
  rateLimiter: RateLimitService;
  avatarStorage: AvatarStorage | AvatarStubLike;
  config: AppConfigLike;
  clock: () => number;
  crypto: NonNullable<IdentityServiceOptions['crypto']>;

  constructor({
    usersRepo,
    emailChangesRepo,
    tokens,
    sessions,
    mailer,
    rateLimiter,
    avatarStorage,
    config,
    clock = () => Date.now(),
    crypto = { hashPassword, passwordMatches, randomToken, digest },
  }: IdentityServiceOptions) {
    this.users = usersRepo;
    this.emailChanges = emailChangesRepo;
    this.tokens = tokens;
    this.sessions = sessions;
    this.mailer = mailer;
    this.rateLimiter = rateLimiter;
    this.avatarStorage = avatarStorage;
    this.config = config;
    this.clock = clock;
    this.crypto = crypto;
  }

  /** Validate and normalize an email address. Throws with a user-facing message. */
  #email(value: unknown): string {
    const email = String(value || '')
      .trim()
      .toLowerCase();
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error('Enter a valid email address.');
    }
    return email;
  }

  /** Enforce a minimum password length. Kept simple and dependency-free. */
  #password(value: unknown): string {
    if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
      throw new Error('Password must be 8–128 characters.');
    }
    return value;
  }

  #name(value: unknown): string {
    const name = String(value || '').trim();
    if (!name || name.length > 120) throw new Error('Name is required (max 120 characters).');
    return name;
  }

  async #checkRateLimit(
    action: string,
    { ip, email }: { ip?: string; email?: string },
  ): Promise<void> {
    await this.rateLimiter.check(action, { ip, email });
  }

  /**
   * Register (or re-send verification for) an account. To avoid leaking which
   * addresses exist, the outward result is identical whether a new user was
   * created or an existing account received a fresh verification link.
   */
  async register(
    { name, email, password }: { name: string; email: string; password: string },
    { ip }: AuthContext,
  ): Promise<{ ok: true; isNew: boolean; verificationRequired: boolean }> {
    const normalizedEmail = this.#email(email);
    await this.#checkRateLimit('register', { ip, email: normalizedEmail });

    // Hash first so a thrown validation error does not reveal account state.
    const hash = this.crypto.hashPassword(this.#password(password));

    let user = this.users.findByEmail(normalizedEmail);
    const isNew = !user;
    if (isNew) {
      user = this.users.create({
        name: this.#name(name),
        email: normalizedEmail,
        passwordHash: hash,
        createdAt: this.clock(),
      });
    }
    // TypeScript cannot narrow `user` through the closure above; both branches
    // guarantee a value (existing row, or the row just created).
    const account = user!;

    const verificationRequired = this.config.mail?.transport !== 'console';
    if (!account.emailVerifiedAt) {
      if (verificationRequired) {
        await this.#sendMagicLink(account, 'verify');
      } else if (isNew) {
        this.users.verifyEmail(account.id, this.clock());
      }
      // Existing accounts are verified only after password authentication at login.
    }
    return { ok: true, isNew, verificationRequired };
  }

  /**
   * Create an account that is immediately verified, skipping email
   * confirmation. Used for seeds and admin-created accounts where the operator
   * already vouches for the identity. Validation and hashing match register().
   * Returns the created user (mapped).
   */
  createVerifiedUser({
    name,
    email,
    password,
    role = 'user',
  }: {
    name: string;
    email: string;
    password: string;
    role?: 'admin' | 'user';
  }): User {
    const normalizedEmail = this.#email(email);
    const hash = this.crypto.hashPassword(this.#password(password));
    const user = this.users.create({
      name: this.#name(name),
      email: normalizedEmail,
      passwordHash: hash,
      role,
      createdAt: this.clock(),
    });
    // Mark verified after insert; bumps credential_version but no sessions exist yet.
    this.users.verifyEmail(user.id, this.clock());
    return this.users.findById(user.id)!;
  }

  /** Send a verification link for an unverified account. Used for resend. */
  async resendVerification(
    { email }: { email: string },
    { ip }: AuthContext,
  ): Promise<{ ok: true }> {
    const normalizedEmail = this.#email(email);
    await this.#checkRateLimit('resend', { ip, email: normalizedEmail });
    const user = this.users.findByEmail(normalizedEmail);
    if (user && !user.emailVerifiedAt) await this.#sendMagicLink(user, 'verify');
    return { ok: true };
  }

  /**
   * Redeem a verification token, mark the account verified, start a session.
   * Returns { ok, userId } or { ok: false, reason }.
   */
  verify(
    { token }: { token?: string },
    { ip: _ip }: AuthContext,
  ): { ok: true; userId: string } | { ok: false; reason: string } {
    const userId = this.#redeem(token, 'verify');
    if (!userId) return { ok: false, reason: 'This link is invalid or has expired.' };

    const user = this.users.findById(userId);
    if (!user) return { ok: false, reason: 'This link is invalid or has expired.' };
    if (!user.emailVerifiedAt) this.users.verifyEmail(userId, this.clock());
    this.tokens.revokeAllForUser(userId);

    return { ok: true, userId };
  }

  /**
   * Authenticate with email + password. Only verified accounts may sign in.
   * Returns { ok, userId } on success or { ok: false, reason }.
   */
  async login(
    { email, password }: { email: string; password: string },
    { ip }: AuthContext,
  ): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
    const normalizedEmail = this.#email(email);
    await this.#checkRateLimit('login', { ip, email: normalizedEmail });

    const user = this.users.findByEmail(normalizedEmail);
    // Run a dummy compare when the user is missing so timing stays uniform.
    const match = this.crypto.passwordMatches(password || '', user?.passwordHash);
    if (!user || !match) return { ok: false, reason: 'Email or password is incorrect.' };
    if (!user.emailVerifiedAt) {
      if (this.config.mail?.transport !== 'console') {
        return { ok: false, reason: 'Verify your email before signing in.' };
      }
      // Console mail cannot reach an inbox. Authenticate first, then unblock
      // accounts registered before console-mode automatic verification existed.
      this.users.verifyEmail(user.id, this.clock());
      this.tokens.revokeAllForUser(user.id);
    }
    return { ok: true, userId: user.id };
  }

  /** Send a password-reset link if the address belongs to a verified account. */
  async forgotPassword({ email }: { email: string }, { ip }: AuthContext): Promise<{ ok: true }> {
    const normalizedEmail = this.#email(email);
    await this.#checkRateLimit('forgot', { ip, email: normalizedEmail });
    const user = this.users.findByEmail(normalizedEmail);
    if (user?.emailVerifiedAt) await this.#sendMagicLink(user, 'reset');
    return { ok: true };
  }

  /**
   * Redeem a reset token and set a new password, revoking all existing sessions.
   * Returns { ok, userId } or { ok: false, reason }.
   */
  resetPassword(
    { email, token, password }: { email?: string; token?: string; password: string },
    { ip: _ip }: AuthContext,
  ): { ok: true; userId: string } | { ok: false; reason: string } {
    const userId = this.#redeem(token, 'reset');
    if (!userId) return { ok: false, reason: 'This reset link is invalid or has expired.' };

    const user = this.users.findById(userId);
    if (!user || (email && user.email !== this.#email(email))) {
      return { ok: false, reason: 'This reset link is invalid or has expired.' };
    }

    const hash = this.crypto.hashPassword(this.#password(password));
    this.users.replacePassword(userId, hash, this.clock());
    // A changed credential invalidates every existing session (kamae pattern).
    this.sessions.revokeAllForUser(userId);
    this.tokens.revokeAllForUser(userId);
    return { ok: true, userId };
  }

  /** Update the display name. Returns the updated user. */
  updateName(userId: string, name: string): User {
    return this.users.updateName(userId, this.#name(name), this.clock());
  }

  /**
   * Replace (or set) the profile avatar. The storage adapter persists the file
   * first; only after a successful write is the old file removed and the user
   * row updated, so a failed upload cannot destroy the current avatar.
   * Returns the updated user.
   */
  async updateAvatar(
    userId: string,
    { buffer, mimetype }: { buffer: Uint8Array; mimetype: string },
  ): Promise<User> {
    const user = this.users.findById(userId);
    if (!user) throw new Error('User not found.');

    const relative = await this.avatarStorage.save(buffer, { mimetype });
    const previous = user.avatarPath;
    const updated = this.users.updateAvatar(userId, relative, this.clock());
    if (previous) await this.avatarStorage.remove(previous);
    return updated;
  }

  /**
   * Request an email change. Requires the current password, the new address
   * must differ from the current one and not belong to another account, and a
   * confirmation link is emailed to the NEW address (proving ownership). The
   * pending change snapshots the credential version so a stale link cannot be
   * applied after other credential changes.
   */
  async beginEmailChange(
    userId: string,
    { email, currentPassword }: { email: string; currentPassword?: string },
    { ip }: AuthContext,
  ): Promise<{ ok: true }> {
    const user = this.users.findById(userId);
    if (!user) throw new Error('User not found.');

    await this.#checkRateLimit('change-email', { ip, email });

    if (!this.crypto.passwordMatches(currentPassword || '', user.passwordHash)) {
      throw new Error('Your current password is incorrect.');
    }

    const newEmail = this.#email(email);
    if (newEmail === user.email) {
      throw new Error('Enter a different email address.');
    }
    if (this.users.findByEmail(newEmail)) {
      throw new Error('That email address is not available.');
    }

    const token = this.crypto.randomToken();
    this.emailChanges.create({
      tokenHash: this.crypto.digest(token),
      userId,
      newEmail,
      credentialVersion: user.credentialVersion,
      expiresAt: this.clock() + 30 * 60 * 1000,
    });

    await this.#sendMagicLink({ id: userId, email: newEmail }, 'change-email', token);
    return { ok: true };
  }

  /**
   * Confirm a pending email change. Single-use: the pending row is claimed
   * (deleted) on success and the credential version must match the snapshot.
   * The account email updates and all sessions are revoked. Returns
   * { ok, userId } or { ok: false, reason }.
   */
  confirmEmailChange(
    { token }: { token?: string },
    { ip: _ip }: AuthContext = {},
  ): { ok: true; userId: string } | { ok: false; reason: string } {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return { ok: false, reason: 'This confirmation link is invalid or has expired.' };
    }

    const pending = this.emailChanges.claim(this.crypto.digest(token), this.clock());
    if (!pending) return { ok: false, reason: 'This confirmation link is invalid or has expired.' };

    const user = this.users.findById(pending.userId);
    if (!user || pending.credentialVersion !== user.credentialVersion) {
      this.emailChanges.deleteAllForUser(pending.userId);
      return { ok: false, reason: 'This confirmation link is invalid or has expired.' };
    }
    if (this.users.findByEmail(pending.newEmail)) {
      this.emailChanges.deleteAllForUser(pending.userId);
      return { ok: false, reason: 'That email address is not available.' };
    }

    this.users.changeEmail(pending.userId, pending.newEmail, this.clock());
    // A changed credential invalidates every existing session (kamae pattern).
    this.sessions.revokeAllForUser(pending.userId);
    this.tokens.revokeAllForUser(pending.userId);
    this.emailChanges.deleteAllForUser(pending.userId);
    return { ok: true, userId: pending.userId };
  }

  /**
   * Change the password after verifying the current one. All existing sessions
   * are revoked; the caller should issue a fresh session for the current user.
   */
  changePassword(
    userId: string,
    { currentPassword, newPassword }: { currentPassword?: string; newPassword: string },
  ): { ok: true; userId: string } {
    const user = this.users.findById(userId);
    if (!user) throw new Error('User not found.');

    if (!this.crypto.passwordMatches(currentPassword || '', user.passwordHash)) {
      throw new Error('Your current password is incorrect.');
    }

    const hash = this.crypto.hashPassword(this.#password(newPassword));
    this.users.replacePassword(userId, hash, this.clock());
    this.sessions.revokeAllForUser(userId);
    this.tokens.revokeAllForUser(userId);
    return { ok: true, userId };
  }

  /** Issue a session for a user; returns token + cookie value. */
  createSession(userId: string): { token: string; expiresAt: number } {
    return this.sessions.createForUser(userId);
  }

  /** Resolve a session cookie to a user, or null. */
  currentUser(token: string | null | undefined): User | null {
    const userId = this.sessions.resolve(token);
    return userId ? this.users.findById(userId) : null;
  }

  destroySession(token: string | null | undefined): boolean {
    return this.sessions.destroy(token);
  }

  /**
   * Email a magic link. Purposes:
   *  - 'verify'        confirm account email (tokens table, 24h, /auth/verify)
   *  - 'reset'         reset password (tokens table, 30m, /auth/reset)
   *  - 'change-email'  confirm a new address (email_changes row already issued
   *    by beginEmailChange; link goes to the NEW address at /settings/confirm-email)
   */
  async #sendMagicLink(
    user: { id: string; email: string },
    purpose: MagicLinkPurpose,
    preIssuedToken?: string,
  ): Promise<void> {
    let token: string;
    let path: string;
    let subject: string;
    const email = user.email;
    if (purpose === 'change-email') {
      token = preIssuedToken!;
      path = '/settings/confirm-email';
      subject = 'Confirm your new Brain League email';
      // Recipient is the NEW address; the caller passes it as user.email.
    } else {
      const ttl = purpose === 'verify' ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
      token = this.tokens.issue(user.id, purpose, ttl);
      path = purpose === 'verify' ? '/auth/verify' : '/auth/reset';
      subject =
        purpose === 'verify'
          ? 'Verify your Brain League account'
          : 'Reset your Brain League password';
    }
    const base = new URL(this.config.appUrl);
    const url = `${base.origin}${path}?token=${token}&email=${encodeURIComponent(email)}`;
    // Fail loudly rather than drop a message the user is waiting for.
    await this.mailer.sendLink({ email, subject, url });
  }

  /** Redeem a single-use magic-link token, returning a user id or null. */
  #redeem(token: string | null | undefined, purpose: 'verify' | 'reset'): string | null {
    return this.tokens.redeem(token, purpose);
  }
}
