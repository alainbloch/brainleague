import type {
  AttemptsRepository,
  Attempt,
  AttemptStatus,
} from '../models/attemptsRepository.js';
import type { FriendshipsRepository } from '../models/friendshipsRepository.js';
import type { UsersRepository, User } from '../models/usersRepository.js';
import type { TestsRepository, TestType } from '../models/testsRepository.js';
import type { NotificationService } from './notificationService.js';

/** One ranked row: a user's best finished attempt on a test. */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  correctCount: number;
  reachedCount: number;
  totalQuestions: number;
  elapsedMs: number;
  attemptId: string;
  status: 'submitted' | 'timed_out';
  finishedAt: number | null;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

export interface RankOptions {
  page?: number;
  perPage?: number;
}

/** The graded result the finish orchestrator passes when notifying friends. */
export interface NotifyResult {
  correctCount: number;
  reachedCount: number;
  elapsedMs: number;
}

interface LeaderboardServiceOptions {
  attemptsRepo: AttemptsRepository;
  friendshipsRepo: FriendshipsRepository;
  usersRepo: UsersRepository;
  testsRepo: TestsRepository;
  notifications: NotificationService;
  clock?: () => number;
}

/**
 * Leaderboard use cases: who did best on a test. Owns the two ranking rules of
 * the platform — best attempt per user, and the (correct DESC, reached DESC,
 * elapsed ASC) sort — plus the friend-result notification fan-out. HTTP-free:
 * callers pass ids/selectors explicitly.
 */
export class LeaderboardService {
  attempts: AttemptsRepository;
  friendships: FriendshipsRepository;
  users: UsersRepository;
  tests: TestsRepository;
  notifications: NotificationService;
  clock: () => number;

  constructor({
    attemptsRepo,
    friendshipsRepo,
    usersRepo,
    testsRepo,
    notifications,
    clock = () => Date.now(),
  }: LeaderboardServiceOptions) {
    this.attempts = attemptsRepo;
    this.friendships = friendshipsRepo;
    this.users = usersRepo;
    this.tests = testsRepo;
    this.notifications = notifications;
    this.clock = clock;
  }

  /**
   * Global leaderboard for a test. `selector` is a test-type slug (preferred)
   * or id. Pages over the ranked finishers; `total`/`pages` describe the full
   * ranking so the view can render pagination around the current page.
   */
  global(selector: string, { page = 1, perPage = 20 }: RankOptions = {}): Leaderboard {
    const test = this.#resolveTest(selector);
    const { entries, total } = this.#ranked(test.id);
    return this.#paginate(entries, total, page, perPage);
  }

  /**
   * Friend leaderboard for a test: the same ranking restricted to `userId`'s
   * accepted friends (the user themself is not included). Defaults to a larger
   * page because friend circles are small.
   */
  friend(selector: string, userId: string, { page = 1, perPage = 50 }: RankOptions = {}): Leaderboard {
    const test = this.#resolveTest(selector);
    const friendSet = new Set(this.friendships.friendIds(userId));
    const full = this.#ranked(test.id);
    const entries = full.entries.filter((e) => friendSet.has(e.userId));
    return this.#paginate(entries, entries.length, page, perPage);
  }

  /**
   * Fan out one 'friend-score' notification to every accepted friend of
   * `actorUserId` after a gradeable result exists. Reads the actor's name and
   * the attempt's test type from the repositories so callers pass only the
   * attempt and its result. Returns the number of friends notified.
   */
  async notifyFriendScore(
    attempt: Attempt,
    result: NotifyResult,
    actorUserId: string,
  ): Promise<number> {
    const actor = this.users.findById(actorUserId);
    if (!actor) throw new Error('User not found.');
    const test = this.tests.findById(attempt.testTypeId);
    if (!test) throw new Error('Unknown test type.');

    const friendIds = this.friendships.friendIds(actorUserId);
    const payload = this.#scorePayload(attempt, result, actor, test);
    for (const friendId of friendIds) {
      await this.notifications.notify({
        userId: friendId,
        type: 'friend-score',
        payload,
        createdAt: this.clock(),
      });
    }
    return friendIds.length;
  }

  #scorePayload(
    attempt: Attempt,
    result: NotifyResult,
    actor: User,
    test: TestType,
  ): Record<string, unknown> {
    return {
      userName: actor.name,
      testTypeSlug: test.slug,
      testTypeName: test.name,
      correctCount: result.correctCount,
      totalQuestions: attempt.totalQuestions,
      reachedCount: result.reachedCount,
      elapsedMs: result.elapsedMs,
      attemptId: attempt.id,
    };
  }

  #resolveTest(selector: string): TestType {
    const test = this.tests.findBySlug(selector) ?? this.tests.findById(selector);
    if (!test) throw new Error('Unknown test type.');
    return test;
  }

  /**
   * Rank finishers: keep only each user's best attempt (the first occurrence in
   * the repository's sorted stream) and assign competition ranks, where an exact
   * tie on (correct, reached, elapsed) shares a rank and the next distinct score
   * skips ahead (standard 1,2,2,4 ranking).
   */
  #ranked(testTypeId: string): { entries: LeaderboardEntry[]; total: number } {
    const finishers = this.attempts.listFinishedForTest(testTypeId);

    const best = new Map<string, Attempt>();
    for (const attempt of finishers) {
      if (!best.has(attempt.userId)) best.set(attempt.userId, attempt);
    }

    const users = new Map<string, User>();
    for (const id of best.keys()) {
      const user = this.users.findById(id);
      if (user) users.set(id, user);
    }

    const tieKey = (a: Attempt) => `${a.correctCount}|${a.reachedCount}|${a.elapsedMs}`;
    const ordered = [...best.values()];
    const entries: LeaderboardEntry[] = [];
    let rank = 0;

    ordered.forEach((attempt, index) => {
      if (index === 0 || tieKey(attempt) !== tieKey(ordered[index - 1])) {
        rank = index + 1;
      }
      entries.push({
        rank,
        userId: attempt.userId,
        name: users.get(attempt.userId)?.name ?? 'Unknown',
        correctCount: attempt.correctCount,
        reachedCount: attempt.reachedCount,
        totalQuestions: attempt.totalQuestions,
        elapsedMs: attempt.elapsedMs ?? 0,
        attemptId: attempt.id,
        status: attempt.status as Exclude<AttemptStatus, 'in_progress'>,
        finishedAt: attempt.finishedAt,
      });
    });

    return { entries, total: entries.length };
  }

  #paginate(
    entries: LeaderboardEntry[],
    total: number,
    page: number,
    perPage: number,
  ): Leaderboard {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safePer = Math.min(100, Math.max(1, Math.floor(perPage) || 20));
    const offset = (safePage - 1) * safePer;
    return {
      entries: entries.slice(offset, offset + safePer),
      total,
      page: safePage,
      perPage: safePer,
      pages: Math.max(1, Math.ceil(total / safePer)),
    };
  }
}

export type { Attempt };