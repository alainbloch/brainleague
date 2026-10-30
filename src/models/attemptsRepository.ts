import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type AttemptStatus = 'in_progress' | 'submitted' | 'timed_out';

export interface Attempt {
  id: string;
  userId: string;
  testTypeId: string;
  sectionId: string | null;
  startedAt: number;
  finishedAt: number | null;
  correctCount: number;
  reachedCount: number;
  totalQuestions: number;
  elapsedMs: number | null;
  status: AttemptStatus;
}

export interface AttemptAnswer {
  attemptId: string;
  questionId: string;
  questionIndex: number;
  chosenIndex: number | null;
  isCorrect: number; // 0 | 1
  timeMs: number | null;
}

interface AttemptRow {
  id: string;
  user_id: string;
  test_type_id: string;
  section_id: string | null;
  started_at: number;
  finished_at: number | null;
  correct_count: number;
  reached_count: number;
  total_questions: number;
  elapsed_ms: number | null;
  status: AttemptStatus;
}

interface AnswerRow {
  attempt_id: string;
  question_id: string;
  question_index: number;
  chosen_index: number | null;
  is_correct: number;
  time_ms: number | null;
}

const ATTEMPT_COLUMNS = `id, user_id, test_type_id, section_id, started_at, finished_at,
  correct_count, reached_count, total_questions, elapsed_ms, status`;

function mapAttempt(row?: AttemptRow): Attempt | null {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    testTypeId: row.test_type_id,
    sectionId: row.section_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    correctCount: row.correct_count,
    reachedCount: row.reached_count,
    totalQuestions: row.total_questions,
    elapsedMs: row.elapsed_ms,
    status: row.status,
  };
}

function mapAnswer(row: AnswerRow): AttemptAnswer {
  return {
    attemptId: row.attempt_id,
    questionId: row.question_id,
    questionIndex: row.question_index,
    chosenIndex: row.chosen_index,
    isCorrect: row.is_correct,
    timeMs: row.time_ms,
  };
}

/** Persistence for a single timed-test sitting and its per-question answers. */
export class AttemptsRepository {
  constructor(private db: Database.Database) {}

  create({
    id = randomUUID(),
    userId,
    testTypeId,
    sectionId = null,
    totalQuestions,
    startedAt,
  }: {
    id?: string;
    userId: string;
    testTypeId: string;
    sectionId?: string | null;
    totalQuestions: number;
    startedAt: number;
  }): Attempt {
    this.db
      .prepare(
        `INSERT INTO attempts (id, user_id, test_type_id, section_id, started_at,
             correct_count, reached_count, total_questions, status)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, 'in_progress')`,
      )
      .run(id, userId, testTypeId, sectionId, startedAt, totalQuestions);
    return this.findById(id)!;
  }

  findById(id: string): Attempt | null {
    const row = this.db.prepare(`SELECT ${ATTEMPT_COLUMNS} FROM attempts WHERE id = ?`).get(id) as
      | AttemptRow
      | undefined;
    return mapAttempt(row);
  }

  findActiveForUser(userId: string, testTypeId: string): Attempt | null {
    const row = this.db
      .prepare(
        `SELECT ${ATTEMPT_COLUMNS} FROM attempts
         WHERE user_id = ? AND test_type_id = ? AND status = 'in_progress'
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(userId, testTypeId) as AttemptRow | undefined;
    return mapAttempt(row);
  }

  findByIdForUser(id: string, userId: string): Attempt | null {
    const row = this.db
      .prepare(`SELECT ${ATTEMPT_COLUMNS} FROM attempts WHERE id = ? AND user_id = ?`)
      .get(id, userId) as AttemptRow | undefined;
    return mapAttempt(row);
  }

  updateAnswers(
    id: string,
    {
      correctCount,
      reachedCount,
      finishedAt,
      elapsedMs,
      status,
    }: {
      correctCount: number;
      reachedCount: number;
      finishedAt: number;
      elapsedMs: number;
      status: 'submitted' | 'timed_out';
    },
  ): void {
    this.db
      .prepare(
        `UPDATE attempts SET correct_count = ?, reached_count = ?, finished_at = ?,
           elapsed_ms = ?, status = ? WHERE id = ?`,
      )
      .run(correctCount, reachedCount, finishedAt, elapsedMs, status, id);
  }

  insertAnswer(answer: AttemptAnswer): void {
    this.db
      .prepare(
        `INSERT INTO attempt_answers (attempt_id, question_id, question_index, chosen_index, is_correct, time_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        answer.attemptId,
        answer.questionId,
        answer.questionIndex,
        answer.chosenIndex,
        answer.isCorrect,
        answer.timeMs,
      );
  }

  /** All recorded answers for an attempt, in presented order. */
  answersFor(attemptId: string): AttemptAnswer[] {
    const rows = this.db
      .prepare(
        `SELECT attempt_id, question_id, question_index, chosen_index, is_correct, time_ms
         FROM attempt_answers WHERE attempt_id = ? ORDER BY question_index`,
      )
      .all(attemptId) as AnswerRow[];
    return rows.map(mapAnswer);
  }

  hasAnswers(attemptId: string): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM attempt_answers WHERE attempt_id = ?')
      .get(attemptId) as { n: number };
    return row.n > 0;
  }
}