import type { TestsRepository, TestType } from '../models/testsRepository.js';
import type { QuestionsRepository, Question } from '../models/questionsRepository.js';
import type { AttemptsRepository, Attempt } from '../models/attemptsRepository.js';

interface QuizEngineOptions {
  testsRepo: TestsRepository;
  questionsRepo: QuestionsRepository;
  attemptsRepo: AttemptsRepository;
  clock?: () => number;
}

/** A question presented to the client — never includes the correct index. */
export interface PresentedQuestion {
  id: string;
  prompt: string;
  choices: string[];
  categorySlug: string;
  estSeconds: number;
}

export interface StartResult {
  attemptId: string;
  testTypeId: string;
  durationSeconds: number;
  startedAt: number;
  questions: PresentedQuestion[];
}

export interface SubmitAnswer {
  questionId: string;
  chosenIndex: number | null;
  timeMs: number | null;
}

export interface AttemptResult {
  attempt: Attempt;
  correctCount: number;
  reachedCount: number;
  elapsedMs: number;
  timedOut: boolean;
  questionCount: number;
}

/** One row of the result report, replayed from the recorded answer. */
export interface ReportQuestion {
  questionId: string;
  /** Presented (shuffled) position, matching how the user saw the deck. */
  index: number;
  prompt: string;
  choices: string[];
  categorySlug: string;
  correctIndex: number;
  explanation: string;
  chosenIndex: number | null;
  /** 1 when the answer was correct AND reached within the test budget. */
  isCorrect: number;
  /** Client-reported solve time, clamped by the engine at submit time. */
  timeMs: number;
  estSeconds: number;
  shouldHaveSkipped: boolean;
}

/** Full result-report payload: summary + per-question replay + test meta. */
export interface AttemptReport {
  attempt: Attempt;
  test: TestType;
  timedOut: boolean;
  elapsedMs: number;
  correctCount: number;
  reachedCount: number;
  questionCount: number;
  questions: ReportQuestion[];
}

const DEFAULT_BAND_SIZE = 10;

/**
 * Fisher-Yates shuffle (in place). Deterministic order isn't required for the
 * intra-band randomness, but each band is shuffled independently so higher
 * est_seconds bands stay later in the deck.
 */
function shuffleWithinBand<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Arrange questions "shuffled but harder toward the end". Sort by est_seconds
 * ascending, split into consecutive bands of ~BAND_SIZE, and shuffle within each
 * band. The concat preserves band order, so difficulty is non-decreasing across
 * bands while order within a band is random. There is no difficulty label — the
 * expected solve time IS the ordering key.
 */
export function arrangeQuestions(questions: Question[], bandSize = DEFAULT_BAND_SIZE): Question[] {
  if (questions.length === 0) return [];

  const sorted = [...questions].sort((a, b) => a.estSeconds - b.estSeconds);
  const bandCount = Math.max(1, Math.ceil(sorted.length / bandSize));
  const result: Question[] = [];

  for (let b = 0; b < bandCount; b++) {
    const start = b * bandSize;
    const band = sorted.slice(start, start + bandSize);
    result.push(...shuffleWithinBand(band));
  }
  return result;
}

/**
 * Core quiz engine. Owns the two authoritative rules of the platform:
 *   1. test assembly = banded shuffle (arrangeQuestions)
 *   2. grading = server clock + recorded answers only; answers past the deadline
 *      budget are not credited, and inputs are validated before any write so a
 *      bad submit can never leave a partially-graded attempt.
 * It is HTTP-free: callers pass userId explicitly and read results back.
 *
 * Abandoned tests self-complete: answers are persisted as the user answers, and
 * any in-progress attempt whose deadline has passed is finalized (timed_out) via
 * finalizeExpiredUntil. start() resumes an in-progress attempt that is still
 * within its deadline, or starts a fresh one after an earlier attempt expired.
 */
export class QuizEngine {
  tests: TestsRepository;
  questions: QuestionsRepository;
  attempts: AttemptsRepository;
  clock: () => number;

  constructor({ testsRepo, questionsRepo, attemptsRepo, clock = () => Date.now() }: QuizEngineOptions) {
    this.tests = testsRepo;
    this.questions = questionsRepo;
    this.attempts = attemptsRepo;
    this.clock = clock;
  }

  /**
   * Start (or resume) a timed attempt. Returns ordered questions WITHOUT their
   * correct indexes and the server-controlled deadline budget. If the user has
   * an in-progress attempt that is still within its deadline, resumes it; an
   * expired attempt is finalized as timed_out and a fresh one is started.
   */
  start(userId: string, testTypeSlug: string): StartResult {
    const test = this.tests.findBySlug(testTypeSlug);
    if (!test) throw new Error('Unknown test type.');
    if (this.questions.countForTestType(test.id) === 0) {
      throw new Error('This test has no questions yet.');
    }

    // Resume an in-progress attempt within its deadline. If the active attempt
    // has passed its deadline, finalize it (auto-complete) before starting fresh.
    const existing = this.attempts.findActiveForUser(userId, test.id);
    if (existing && this.clock() - existing.startedAt > test.durationSeconds * 1000) {
      this.finalizeAttempt(existing, test);
    }
    const stillActive = this.attempts.findActiveForUser(userId, test.id);
    const attempt =
      stillActive ??
      this.attempts.create({
        userId,
        testTypeId: test.id,
        totalQuestions: this.questions.countForTestType(test.id),
        startedAt: this.clock(),
      });

    const ordered = arrangeQuestions(this.questions.listForTestType(test.id));
    return {
      attemptId: attempt.id,
      testTypeId: test.id,
      durationSeconds: test.durationSeconds,
      startedAt: attempt.startedAt,
      questions: ordered.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        choices: q.choices,
        categorySlug: q.categorySlug,
        estSeconds: q.estSeconds,
      })),
    };
  }

  /**
   * Persist a user's answers live during a sitting, without finalizing the
   * attempt. Grading (correct/reached) is computed immediately so an abandoned
   * test can be auto-completed later. Ownership and the in_progress state are
   * enforced; a finished attempt cannot be re-saved.
   */
  saveProgress(attemptId: string, userId: string, answers: SubmitAnswer[]): void {
    const attempt = this.attempts.findByIdForUser(attemptId, userId);
    if (!attempt) throw new Error('Attempt not found for this user.');
    if (attempt.status !== 'in_progress') {
      throw new Error('This attempt has already finished.');
    }

    const test = this.tests.findById(attempt.testTypeId)!;
    const byQuestion = new Map(this.questions.listForTestType(attempt.testTypeId).map((q) => [q.id, q]));
    this.#validateAnswers(answers, byQuestion);

    const persisted = answers.map((a, _index) => {
      const q = byQuestion.get(a.questionId)!;
      return {
        attemptId,
        questionId: a.questionId,
        questionIndex: _index,
        chosenIndex: a.chosenIndex,
        isCorrect: a.chosenIndex !== null && a.chosenIndex === q.correctIndex ? 1 : 0,
        timeMs: Math.max(0, Math.min(a.timeMs ?? 0, test.durationSeconds * 1000)),
      };
    });
    this.attempts.replaceAnswers(attemptId, persisted);
  }

  /**
   * Grade and finalize an attempt. Timing is server-authoritative: the test has
   * a fixed budget (durationSeconds) and an answer is credited only if it was
   * reached within that budget — modeled by the cumulative client time spent up
   * to and including that question. Client time_ms is analytics-only and clamped.
   */
  submit(attemptId: string, userId: string, answers: SubmitAnswer[]): AttemptResult {
    const attempt = this.attempts.findByIdForUser(attemptId, userId);
    if (!attempt) throw new Error('Attempt not found for this user.');
    if (!this.attempts.hasAnswers(attemptId) && answers.length) {
      // A submit may arrive with the full answer set even if the client never
      // called saveProgress (e.g. the very first interaction is a submit).
      this.saveProgress(attemptId, userId, answers);
    }
    if (attempt.status !== 'in_progress') {
      throw new Error('This attempt was already submitted.');
    }

    const test = this.tests.findById(attempt.testTypeId)!;
    const byQuestion = new Map(this.questions.listForTestType(attempt.testTypeId).map((q) => [q.id, q]));

    const budgetMs = test.durationSeconds * 1000;
    const now = this.clock();
    const timedOut = now - attempt.startedAt > budgetMs;

    // Validate the whole payload first so a bad submit writes nothing.
    this.#validateAnswers(answers, byQuestion);

    // Grade, crediting only answers reached within the test budget. cumulativeMs
    // walks answer-by-answer; once it exceeds the budget, later answers are time
    // outs (recorded but not credited toward reached/correct).
    let correctCount = 0;
    let reachedCount = 0;
    let cumulativeMs = 0;

    answers.forEach((a) => {
      const q = byQuestion.get(a.questionId)!;
      const clampedTime = Math.max(0, Math.min(a.timeMs ?? 0, budgetMs));
      const withinBudget = cumulativeMs + clampedTime <= budgetMs;
      cumulativeMs += clampedTime;

      const isCorrect = a.chosenIndex !== null && a.chosenIndex === q.correctIndex;

      if (a.chosenIndex !== null && withinBudget) reachedCount += 1;
      if (isCorrect && withinBudget) correctCount += 1;
    });

    const elapsedMs = timedOut ? budgetMs : now - attempt.startedAt;
    const status = timedOut ? 'timed_out' : 'submitted';
    this.attempts.updateAnswers(attemptId, {
      correctCount,
      reachedCount,
      finishedAt: now,
      elapsedMs,
      status,
    });

    const updated = this.attempts.findById(attemptId)!;
    return {
      attempt: updated,
      correctCount,
      reachedCount,
      elapsedMs,
      timedOut,
      questionCount: test.questionCount,
    };
  }

  /**
   * Auto-complete every in-progress attempt whose deadline has passed by `now`.
   * Called on a timer in the server entrypoint and on report access so abandoned
   * tests wind up graded as timed_out instead of lingering in_progress forever.
   * Returns the number of attempts finalized.
   */
  finalizeExpiredUntil(now: number): number {
    const expired = this.attempts.listExpiredInProgress(now);
    for (const attempt of expired) {
      const test = this.tests.findById(attempt.testTypeId);
      if (test) this.finalizeAttempt(attempt, test);
    }
    return expired.length;
  }

  /**
   * Finalize a single in-progress attempt to timed_out based on the answers it
   * has recorded so far (reached/correct from persisted rows). The attempt's
   * own state is updated; caller decides when/why this runs.
   */
  private finalizeAttempt(attempt: Attempt, test: TestType): void {
    const answers = this.attempts.answersFor(attempt.id);
    const reached = answers.filter((a) => a.chosenIndex !== null).length;
    const correct = answers.filter((a) => a.isCorrect === 1).length;
    this.attempts.updateAnswers(attempt.id, {
      correctCount: correct,
      reachedCount: reached,
      finishedAt: attempt.startedAt + test.durationSeconds * 1000,
      elapsedMs: test.durationSeconds * 1000,
      status: 'timed_out',
    });
  }

  /**
   * Compose the result-report for a finished attempt. Ownership is enforced
   * (returns null for an attempt that is not the caller's or not submitted);
   * a 404 hides the attempt's existence from other users. The report replays
   * each recorded answer so the page can show right/wrong/skip and timeMs, and
   * flags answers where the user spent more than the expected solve time yet
   * still missed — the "should have skipped" coaching signal. This is a read
   * path only; it performs no writes.
   */
  report(attemptId: string, userId: string): AttemptReport | null {
    const attempt = this.attempts.findByIdForUser(attemptId, userId);
    if (!attempt) return null;

    // If the user abandoned an in-progress attempt whose deadline has passed,
    // finalize it before showing the report so they see a completed result.
    if (attempt.status === 'in_progress') {
      const test = this.tests.findById(attempt.testTypeId);
      if (!test) return null;
      // An in-progress attempt still within its deadline is not a finished
      // result yet — the owner should keep taking it, not read a report.
      if (this.clock() - attempt.startedAt <= test.durationSeconds * 1000) return null;
      // Otherwise the deadline has passed: auto-complete it now so the owner can
      // see their graded result instead of a redirect back into a dead attempt.
      this.finalizeAttempt(attempt, test);
      const updated = this.attempts.findById(attemptId);
      if (!updated || updated.status === 'in_progress') return null;
      attempt.finishedAt = updated.finishedAt;
      attempt.correctCount = updated.correctCount;
      attempt.reachedCount = updated.reachedCount;
      attempt.elapsedMs = updated.elapsedMs;
      attempt.status = updated.status;
    }

    const test = this.tests.findById(attempt.testTypeId)!;
    const byQuestion = new Map(
      this.questions.listForTestType(attempt.testTypeId).map((q) => [q.id, q]),
    );
    const answers = this.attempts.answersFor(attemptId);

    // Clamp time to the test budget the same way submit() did; isCorrect is the
    // already-graded value stored at submit time, so the report replays what was
    // actually credited rather than re-deriving it.
    const budgetMs = test.durationSeconds * 1000;
    const questions: ReportQuestion[] = answers.map((a) => {
      const q = byQuestion.get(a.questionId);
      const timeMs = a.timeMs == null ? 0 : Math.max(0, Math.min(a.timeMs, budgetMs));

      const estMs = (q?.estSeconds ?? 0) * 1000;
      // Spent longer than the expected solve time AND did not get it right.
      const shouldHaveSkipped = a.isCorrect === 0 && a.timeMs != null && a.timeMs > estMs;

      return {
        questionId: a.questionId,
        index: a.questionIndex,
        prompt: q?.prompt ?? '',
        choices: q?.choices ?? [],
        categorySlug: q?.categorySlug ?? '',
        correctIndex: q?.correctIndex ?? -1,
        explanation: q?.explanation ?? '',
        chosenIndex: a.chosenIndex,
        isCorrect: a.isCorrect,
        timeMs,
        estSeconds: q?.estSeconds ?? 0,
        shouldHaveSkipped,
      };
    });

    return {
      attempt,
      test,
      timedOut: attempt.status === 'timed_out',
      elapsedMs: attempt.elapsedMs ?? 0,
      correctCount: attempt.correctCount,
      reachedCount: attempt.reachedCount,
      questionCount: test.questionCount,
      questions,
    };
  }

  /** Validate the submitted answer set: all on-test, no duplicates. */
  #validateAnswers(
    answers: SubmitAnswer[],
    byQuestion: Map<string, Question>,
  ): void {
    const seen = new Set<string>();
    for (const a of answers) {
      if (!byQuestion.has(a.questionId)) {
        throw new Error('Answer references a question not on this test.');
      }
      if (seen.has(a.questionId)) {
        throw new Error('A question was answered more than once.');
      }
      seen.add(a.questionId);
    }
  }
}