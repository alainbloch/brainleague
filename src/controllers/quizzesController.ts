import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ContainerServices } from '../container.js';
import { reasoningVisual } from '../ui/reasoningVisuals.js';
import { quizCoaching } from '../services/quizCoaching.js';
import type { SubmitAnswer } from '../services/quizEngine.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface QuizzesControllerOptions {
  quizzes: ContainerServices['quizzes'];
  leaderboards: ContainerServices['leaderboards'];
}

/**
 * Thin HTTP layer for the test-taking flow: a catalog of practice tests, a
 * server-timed take page, the submit endpoint that hands answers to the quiz
 * engine, and the result report. The quiz engine owns start/submit/report;
 * this controller only validates request shape and translates outcome into a
 * rendered page or redirect.
 */
export class QuizzesController {
  quizzes: ContainerServices['quizzes'];
  leaderboards: ContainerServices['leaderboards'];

  constructor({ quizzes, leaderboards }: QuizzesControllerOptions) {
    this.quizzes = quizzes;
    this.leaderboards = leaderboards;
  }

  /** Catalog of available practice test types. */
  async showCatalog(
    request: FastifyRequest,
    reply: FastifyReply,
    context: { error?: string } = {},
  ): Promise<FastifyReply> {
    return reply.view('quizzes/catalog', {
      pageTitle: 'Practice tests',
      user: request.user,
      tests: this.quizzes.tests.list(),
      error: context.error,
    });
  }

  /** Start (or resume) a test and render the timed take page. */
  async takeTest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { slug?: string };
    try {
      const started = this.quizzes.start(request.user!.id, params.slug!);
      // Anchor the client countdown on the server clock so a skewed browser
      // clock cannot add time. deadline = startedAt + budget (server authority).
      return reply.view('quizzes/take', {
        pageTitle: 'Test in progress',
        user: request.user,
        attemptId: started.attemptId,
        testTypeId: started.testTypeId,
        durationSeconds: started.durationSeconds,
        startedAt: started.startedAt,
        serverNow: Date.now(),
        deadlineMs: started.startedAt + started.durationSeconds * 1000,
        questions: started.questions.map((q) => ({ ...q, visual: reasoningVisual(q) })),
        noGoingBack: true,
      });
    } catch (error) {
      return this.showCatalog(request, reply, { error: errorMessage(error) });
    }
  }

  /**
   * Persist answers during a sitting (debounced by the client) so an abandoned
   * test can still be graded when its deadline passes. Does not finalize.
   */
  async saveProgress(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { attemptId?: string };
    const body = (request.body || {}) as { answers?: unknown };
    let answers: SubmitAnswer[];
    try {
      answers = parseAnswers(body.answers);
      this.quizzes.saveProgress(params.attemptId!, request.user!.id, answers);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  }

  /** Accept recorded answers, grade via the engine, notify friends, and land on the report. */
  async submitTest(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { attemptId?: string };
    const body = (request.body || {}) as { answers?: unknown };

    let answers: SubmitAnswer[];
    try {
      answers = parseAnswers(body.answers);
    } catch (error) {
      return this.showCatalog(request, reply, { error: errorMessage(error) });
    }

    try {
      const actorId = request.user!.id;
      const result = this.quizzes.submit(params.attemptId!, actorId, answers);
      // Fan out a friend-score notification to the actor's accepted friends.
      await this.leaderboards.notifyFriendScore(result.attempt, result, actorId);
      return reply.redirect(`/tests/${params.attemptId}/result`);
    } catch (error) {
      return this.showCatalog(request, reply, { error: errorMessage(error) });
    }
  }

  /** Render the result report for a finished attempt (owner-only). */
  async showResult(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const params = request.params as { attemptId?: string };
    const report = this.quizzes.report(params.attemptId!, request.user!.id);
    if (!report)
      return reply.code(404).view('not-found', { pageTitle: 'Not found', user: request.user });

    const reached = Math.max(report.reachedCount, 1);
    const accuracy = Math.round((report.correctCount / reached) * 100);
    const avgSecondsPerQuestion = report.elapsedMs / 1000 / reached;

    return reply.view('quizzes/result', {
      pageTitle: 'Result',
      user: request.user,
      report: {
        ...report,
        questions: report.questions.map((q) => ({ ...q, visual: reasoningVisual(q) })),
      },
      coaching: quizCoaching(report, this.quizzes.tests.list()),
      accuracy,
      avgSecondsPerQuestion,
    });
  }
}

/** Validate one decoded submit answer entry into the engine's shape. */
function parseAnswer(raw: unknown): SubmitAnswer {
  if (!raw || typeof raw !== 'object') throw new Error('One of the answers was malformed.');

  const { questionId, chosenIndex, timeMs } = raw as Record<string, unknown>;
  if (typeof questionId !== 'string' || !questionId)
    throw new Error('An answer is missing its question.');

  const chosen = chosenIndex === undefined || chosenIndex === null ? null : Number(chosenIndex);
  if (chosen !== null && (!Number.isInteger(chosen) || chosen < 0))
    throw new Error('An answer has an invalid choice.');

  const time = timeMs === undefined || timeMs === null ? null : Number(timeMs);
  if (time !== null && Number.isNaN(time)) throw new Error('An answer has an invalid time.');

  return { questionId, chosenIndex: chosen, timeMs: time };
}

/** Decode the JSON-encoded answers payload posted by the take page. */
function parseAnswers(raw: unknown): SubmitAnswer[] {
  if (typeof raw !== 'string') throw new Error('No answers were submitted.');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Answers payload must be a list.');
  return parsed.map(parseAnswer);
}
