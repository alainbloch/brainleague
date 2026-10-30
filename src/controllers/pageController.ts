import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TestsRepository } from '../models/testsRepository.js';

interface PageControllerOptions {
  testsRepo: TestsRepository;
}

/**
 * Serves the public landing/splash page and the authenticated account page.
 * The splash lists the available practice tests so visitors can jump straight
 * into the first one.
 */
export class PageController {
  tests: TestsRepository;

  constructor({ testsRepo }: PageControllerOptions) {
    this.tests = testsRepo;
  }

  showHome(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    return reply.view('index', {
      pageTitle: 'Brain League',
      user: request.user || null,
      tests: this.tests.list(),
    });
  }

  showAccount(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    return reply.view('account', {
      pageTitle: 'Your account',
      user: request.user,
    });
  }
}