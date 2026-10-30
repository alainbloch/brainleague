import type { IdentityService } from '../services/identityService.js';
import type { User } from '../models/usersRepository.js';

/**
 * Session helpers for the MCP server. Tools receive an opaque `sessionToken`
 * (the same cookie value the web app issues); resolving it goes through the
 * identity service so digests, expiry, and revocation all apply unchanged.
 */

/** Resolve a session token to its user, or null if invalid/expired/revoked. */
export function userFromToken(
  identity: IdentityService,
  token: string | null | undefined,
): User | null {
  return identity.currentUser(token);
}

/** Resolve and require an authenticated user; throws with a client-facing message. */
export function requireUser(identity: IdentityService, token: string | null | undefined): User {
  const user = userFromToken(identity, token);
  if (!user)
    throw new Error(
      'Not authenticated: provide a valid sessionToken (obtain one via authenticate).',
    );
  return user;
}

/** Require an authenticated admin; throws unless the session user has the admin role. */
export function requireAdmin(identity: IdentityService, token: string | null | undefined): User {
  const user = requireUser(identity, token);
  if (user.role !== 'admin') throw new Error('Forbidden: this tool requires the admin role.');
  return user;
}

/** Public user shape exposed through MCP tool results (no auth internals). */
export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarPath: user.avatarPath,
    emailVerified: !!user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}
