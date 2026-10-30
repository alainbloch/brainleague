import type { FastifyRequest, FastifyReply } from 'fastify';

/** Serves the authenticated account page and public landing/index page. */
export class PageController {
  showHome(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    return reply.view('index', {
      pageTitle: 'Brain League',
      user: request.user || null,
    });
  }

  showAccount(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    return reply.view('account', {
      pageTitle: 'Your account',
      user: request.user,
    });
  }
}
