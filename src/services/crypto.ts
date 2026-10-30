import crypto from 'node:crypto';

/** Constant-time helpers shared by the auth services. */

/** Random 32-byte token encoded as hex (64 chars). */
export function randomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hex digest. Used to store only the digest of opaque tokens. */
export function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Encode base64 without padding so hashes/salts never contain '=' or '/',
 * which complicates delimiter-splitting of stored hashes.
 */
function toBase64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64url(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export interface ScryptOptions {
  salt?: string;
  N?: number;
  r?: number;
  p?: number;
}

/**
 * Hash a password with scrypt (memory-hard KDF from node:crypto, no native deps).
 * Format: scrypt$N$r$p$salt$key — parameters stored alongside so they can be
 * raised over time and old hashes still validate.
 */
export function hashPassword(
  password: string,
  { salt = randomToken(), N = 16384, r = 8, p = 1 }: ScryptOptions = {},
): string {
  const key = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt}$${toBase64url(key)}`;
}

/**
 * Verify a password against a stored hash. For malformed/foreign hashes, still
 * run a hashing work so timing does not reveal whether an account exists or has
 * a legacy format. Comparison is constant-time.
 */
export function passwordMatches(password: string, stored: string | null | undefined): boolean {
  // Parse the stored hash. For malformed/foreign hashes we still run an
  // equivalent scrypt work factor against a fixed dummy so that timing does not
  // reveal whether an account exists or which hashing scheme it uses.
  let salt: string;
  let N: number;
  let r: number;
  let p: number;
  let expected: Buffer;
  const parts = String(stored || '').split('$');
  const [scheme, Nstr, rstr, pstr] = parts;
  if (parts.length === 6 && scheme === 'scrypt') {
    salt = parts[4];
    N = Number.parseInt(Nstr, 10) || 16384;
    r = Number.parseInt(rstr, 10) || 8;
    p = Number.parseInt(pstr, 10) || 1;
    expected = fromBase64url(parts[5]);
  } else {
    // Dummy parameters match the work of the default hash.
    salt = '0'.repeat(64);
    N = 16384;
    r = 8;
    p = 1;
    expected = Buffer.alloc(64);
  }

  const actual = crypto.scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 128 * 1024 * 1024,
  });
  return constantTimeEqual(actual, expected);
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
