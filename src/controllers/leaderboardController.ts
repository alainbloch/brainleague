import type { FastifyRequest, FastifyReply } from 'fastify';
import type { LeaderboardService } from '../services/leaderboardService.js';
import type { TestsRepository } from '../models/testsRepository.js';

interface LeaderboardControllerOptions {
  leaderboard: LeaderboardService;
  testsRepo: TestsRepository;
}

function pageQuery(request: FastifyRequest): number {
  const query = (request.query || {}) as { page?: string };
  return Number(query.page) || 1;
}

/**
 * Leaderboard pages: an index of every test's leaderboard (global + friends)
 * and the per-test global/friends tabs. Thin HTTP layer: resolves the test from
 * the route slug and delegates ranking to the leaderboard service.
 */
export class LeaderboardController {
  leaderboard: LeaderboardService;
  tests: TestsRepository;

  constructor({ leaderboard, testsRepo }: LeaderboardControllerOptions) {
    this.leaderboard = leaderboard;
    this.tests = testsRepo;
  }

  /** Index page listing every test's global + friends leaderboard links. */
  showIndex(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    return reply.view('leaderboards', {
      pageTitle: 'Leaderboards',
      user: request.user,
      tests: this.tests.list(),
    });
  }

  showGlobal(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    const slug = (request.params as { slug?: string }).slug ?? '';
    const test = this.tests.findBySlug(slug);
    if (!test)
      return reply.code(404).view('not-found', { pageTitle: 'Not found', user: request.user });
    const board = this.leaderboard.global(test.id, { page: pageQuery(request), perPage: 20 });
    return reply.view('leaderboard', {
      pageTitle: `${test.name} · Leaderboard`,
      user: request.user,
      test,
      board,
      tab: 'global',
    });
  }

  showFriends(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    const slug = (request.params as { slug?: string }).slug ?? '';
    const test = this.tests.findBySlug(slug);
    if (!test)
      return reply.code(404).view('not-found', { pageTitle: 'Not found', user: request.user });
    const board = this.leaderboard.friend(test.id, request.user!.id, {
      page: pageQuery(request),
      perPage: 50,
    });
    return reply.view('leaderboard', {
      pageTitle: `${test.name} · Friends leaderboard`,
      user: request.user,
      test,
      board,
      tab: 'friends',
    });
  }
}