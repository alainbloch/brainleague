import { digest } from './crypto.js';
import type { RateLimitsRepository } from '../models/rateLimitsRepository.js';

interface RateLimitServiceOptions {
  rateLimitsRepo: RateLimitsRepository;
  config: { rateLimit: { windowMs: number; perIp: number; perEmail: number } };
  clock?: () => number;
  crypto?: { digest: (value: string) => string };
}

/**
 * Rate limiting for authentication endpoints (kamae pattern). Applies a
 * per-identity limit and a per-IP limit on each attempt. Identity-scoped limits
 * use a digest of the email so no PII is stored in the rate_limits table.
 */
export class RateLimitService {
  readonly rateLimits: RateLimitsRepository;
  readonly config: RateLimitServiceOptions['config'];
  readonly clock: () => number;
  readonly crypto: { digest: (value: string) => string };

  constructor({
    rateLimitsRepo,
    config,
    clock = () => Date.now(),
    crypto = { digest },
  }: RateLimitServiceOptions) {
    this.rateLimits = rateLimitsRepo;
    this.config = config;
    this.clock = clock;
    this.crypto = crypto;
  }

  /** Enforce limits; throws a friendly error when any limit is exceeded. */
  async check(action: string, { ip, email = '' }: { ip?: string; email?: string }): Promise<void> {
    const now = this.clock();
    const limits: Array<[string, number]> = [];
    if (ip) limits.push([`ip:${ip}`, this.config.rateLimit.perIp]);
    if (email) limits.push([`email:${this.crypto.digest(email)}`, this.config.rateLimit.perEmail]);

    for (const [scope, limit] of limits) {
      const key = this.crypto.digest(`${action}:${scope}`);
      const count = this.rateLimits.increment(key, now, this.config.rateLimit.windowMs);
      if (count > limit) {
        throw new Error('Too many attempts. Please try again in 15 minutes.');
      }
    }
    this.rateLimits.deleteExpired(now);
  }
}
