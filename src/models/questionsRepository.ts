import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface Question {
  id: string;
  testTypeId: string;
  sectionId: string | null;
  categorySlug: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  estSeconds: number;
  position: number | null;
}

export interface QuestionCreateInput {
  id?: string;
  testTypeId: string;
  sectionId?: string | null;
  categorySlug: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  estSeconds: number;
  position?: number | null;
  createdAt: number;
}

export interface QuestionUpdateInput {
  testTypeId?: string;
  categorySlug?: string;
  prompt?: string;
  choices?: string[];
  correctIndex?: number;
  explanation?: string;
  estSeconds?: number;
  updatedAt: number;
}

export interface QuestionListOptions {
  testTypeId?: string;
  categorySlug?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface QuestionListResult {
  rows: Question[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

interface QuestionRow {
  id: string;
  test_type_id: string;
  section_id: string | null;
  category_slug: string;
  prompt: string;
  choices_json: string;
  correct_index: number;
  explanation: string;
  est_seconds: number;
  position: number | null;
}

function mapQuestion(row: QuestionRow): Question {
  let choices: string[] = [];
  try {
    const parsed = JSON.parse(row.choices_json);
    if (Array.isArray(parsed)) choices = parsed.map(String);
  } catch {
    choices = [];
  }
  return {
    id: row.id,
    testTypeId: row.test_type_id,
    sectionId: row.section_id,
    categorySlug: row.category_slug,
    prompt: row.prompt,
    choices,
    correctIndex: row.correct_index,
    explanation: row.explanation,
    estSeconds: row.est_seconds,
    position: row.position,
  };
}

/** The multiple-choice question bank for the practice tests. */
export class QuestionsRepository {
  constructor(private db: Database.Database) {}

  listForTestType(testTypeId: string): Question[] {
    const rows = this.db
      .prepare('SELECT * FROM questions WHERE test_type_id = ?')
      .all(testTypeId) as QuestionRow[];
    return rows.map(mapQuestion);
  }

  /**
   * List questions with optional filters (test type, category) and a free-text
   * search over the prompt. Returns the filtered page plus pagination metadata.
   */
  list({ testTypeId, categorySlug, query, limit = 20, offset = 0 }: QuestionListOptions): QuestionListResult {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (testTypeId) {
      conditions.push('test_type_id = ?');
      params.push(testTypeId);
    }
    if (categorySlug) {
      conditions.push('category_slug = ?');
      params.push(categorySlug);
    }
    if (query) {
      conditions.push('prompt LIKE ?');
      params.push(`%${query}%`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM questions ${whereClause}`)
      .get(...params) as { n: number };
    const rows = this.db
      .prepare(`SELECT * FROM questions ${whereClause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as QuestionRow[];
    const total = totalRow.n;
    return {
      rows: rows.map(mapQuestion),
      total,
      page: Math.floor(offset / limit) + 1,
      perPage: limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  findById(id: string): Question | null {
    const row = this.db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as
      | QuestionRow
      | undefined;
    return row ? mapQuestion(row) : null;
  }

  create({
    id = randomUUID(),
    testTypeId,
    sectionId = null,
    categorySlug,
    prompt,
    choices,
    correctIndex,
    explanation,
    estSeconds,
    position = null,
    createdAt,
  }: QuestionCreateInput): Question | null {
    this.db
      .prepare(
        `INSERT INTO questions (id, test_type_id, section_id, category_slug, prompt, choices_json, correct_index, explanation, est_seconds, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        testTypeId,
        sectionId,
        categorySlug,
        prompt,
        JSON.stringify(choices),
        correctIndex,
        explanation,
        estSeconds,
        position,
        createdAt,
        createdAt,
      );
    return this.findById(id);
  }

  update(
    id: string,
    { testTypeId, categorySlug, prompt, choices, correctIndex, explanation, estSeconds, updatedAt }: QuestionUpdateInput,
  ): Question | null {
    const existing = this.findById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE questions
         SET test_type_id = ?, category_slug = ?, prompt = ?, choices_json = ?,
             correct_index = ?, explanation = ?, est_seconds = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        testTypeId ?? existing.testTypeId,
        categorySlug ?? existing.categorySlug,
        prompt ?? existing.prompt,
        JSON.stringify(choices ?? existing.choices),
        correctIndex ?? existing.correctIndex,
        explanation ?? existing.explanation,
        estSeconds ?? existing.estSeconds,
        updatedAt,
        id,
      );
    return this.findById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM questions WHERE id = ?').run(id).changes > 0;
  }

  countForTestType(testTypeId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM questions WHERE test_type_id = ?')
      .get(testTypeId) as { n: number };
    return row.n;
  }
}