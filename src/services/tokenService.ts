import { randomToken, digest } from './crypto.js';
import type { TokensRepository, TokenPurpose } from '../models/tokensRepository.js';

interface TokenServiceOptions {
  tokensRepo: TokensRepository;
  clock?: () => number;
  crypto?: { randomToken: () => string; digest: (value: string) => string };
}

/**
 * One-time magic-link tokens (email verification, password reset). Only the
 * digest is stored. A claim is single-use (row deleted on read). Expiry is
 * set by the caller via `ttl`.
 */
export class TokenService {
  readonly tokens: TokensRepository;
  readonly clock: () => number;
  readonly crypto: { randomToken: () => string; digest: (value: string) => string };

  constructor({
    tokensRepo,
    clock = () => Date.now(),
    crypto = { randomToken, digest },
  }: TokenServiceOptions) {
    this.tokens = tokensRepo;
    this.clock = clock;
    this.crypto = crypto;
  }

  /** Create a token for a purpose and return the plaintext value to email. */
  issue(userId: string, purpose: TokenPurpose, ttlMs: number): string {
    const token = this.crypto.randomToken();
    this.tokens.create(this.crypto.digest(token), userId, purpose, this.clock() + ttlMs);
    return token;
  }

  /** Consume a token; returns user id, or null if invalid/expired/already used. */
  redeem(token: string | null | undefined, purpose: TokenPurpose): string | null {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    return this.tokens.claim(this.crypto.digest(token), purpose, this.clock());
  }

  revokeAllForUser(userId: string): number {
    return this.tokens.deleteAllForUser(userId);
  }

  garbageCollect(): number {
    return this.tokens.deleteExpired(this.clock());
  }
}
