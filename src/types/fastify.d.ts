import 'fastify';

/**
 * Type augmentation for the Fastify reply `view` decorator and request-scoped
 * auth/notification values. `request.user` is set by the auth middleware;
 * `unreadNotifications` by an on-request hook; `reply.view` renders Nunjucks.
 */
declare module 'fastify' {
  interface FastifyReply {
    view(name: string, ctx?: Record<string, unknown>, statusCode?: number): FastifyReply;
  }

  interface FastifyRequest {
    user?: import('../models/usersRepository.ts').PublicUser | null;
    unreadNotifications?: number;
  }
}
