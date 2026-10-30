import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IdentityService } from '../services/identityService.js';

/**
 * Request-bound authentication middleware. Resolves the session cookie to a
 * user and attaches it to `request.user`. `requireAuth` redirects anonymous
 * visitors to the login page; it is applied to protected routes.
 */
export function resolveUser(identity: IdentityService) {
  return async (request: FastifyRequest): Promise<void> => {
    const token = request.cookies?.usertest_session;
    if (token) request.user = identity.currentUser(token);
  };
}

export function requireAuth(identity: IdentityService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.cookies?.usertest_session;
    request.user = token ? identity.currentUser(token) : null;
    if (!request.user) await reply.redirect('/login');
  };
}

/** Require an authenticated session AND the admin role; otherwise 403. */
export function requireAdmin(identity: IdentityService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = request.cookies?.usertest_session;
    request.user = token ? identity.currentUser(token) : null;
    if (!request.user) {
      await reply.redirect('/login');
      return;
    }
    if (request.user.role !== 'admin') {
      await reply.code(403).send({ error: 'Admin access required.' });
    }
  };
}
