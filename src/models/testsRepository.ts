import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface TestType {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  questionCount: number;
  durationSeconds: number;
  noGoingBack: boolean;
}

export interface TestTypeCreateInput {
  id?: string;
  slug: string;
  name: string;
  publisher: string;
  questionCount: number;
  durationSeconds: number;
  noGoingBack?: boolean;
  createdAt: number;
}

export interface TestTypeUpdateInput {
  slug?: string;
  name?: string;
  publisher?: string;
  questionCount?: number;
  durationSeconds?: number;
  noGoingBack?: boolean;
  updatedAt: number;
}

export interface TestSection {
  id: string;
  testTypeId: string;
  title: string;
  position: number;
  questionCount: number;
  durationSeconds: number | null;
}

interface TestTypeRow {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  question_count: number;
  duration_seconds: number;
  no_going_back: number;
}

interface SectionRow {
  id: string;
  test_type_id: string;
  title: string;
  position: number;
  question_count: number;
  duration_seconds: number | null;
}

function mapTestType(row?: TestTypeRow): TestType | null {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    publisher: row.publisher,
    questionCount: row.question_count,
    durationSeconds: row.duration_seconds,
    noGoingBack: row.no_going_back === 1,
  };
}

function mapSection(row: SectionRow): TestSection {
  return {
    id: row.id,
    testTypeId: row.test_type_id,
    title: row.title,
    position: row.position,
    questionCount: row.question_count,
    durationSeconds: row.duration_seconds,
  };
}

/** The catalog of timed practice tests and their (optional) timed sections. */
export class TestsRepository {
  constructor(private db: Database.Database) {}

  list(): TestType[] {
    const rows = this.db.prepare('SELECT * FROM test_types ORDER BY name').all() as TestTypeRow[];
    return rows.map((r) => mapTestType(r)!);
  }

  findBySlug(slug: string): TestType | null {
    const row = this.db
      .prepare('SELECT * FROM test_types WHERE slug = ?')
      .get(slug) as TestTypeRow | undefined;
    return mapTestType(row);
  }

  findById(id: string): TestType | null {
    const row = this.db.prepare('SELECT * FROM test_types WHERE id = ?').get(id) as
      | TestTypeRow
      | undefined;
    return mapTestType(row);
  }

  create({
    id = randomUUID(),
    slug,
    name,
    publisher,
    questionCount,
    durationSeconds,
    noGoingBack = true,
    createdAt,
  }: TestTypeCreateInput): TestType | null {
    this.db
      .prepare(
        `INSERT INTO test_types (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, slug, name, publisher, questionCount, durationSeconds, noGoingBack ? 1 : 0, createdAt);
    return this.findById(id);
  }

  update(
    id: string,
    { slug, name, publisher, questionCount, durationSeconds, noGoingBack }: TestTypeUpdateInput,
  ): TestType | null {
    const existing = this.findById(id);
    if (!existing) return null;
    this.db
      .prepare(
        'UPDATE test_types SET slug = ?, name = ?, publisher = ?, question_count = ?, duration_seconds = ?, no_going_back = ? WHERE id = ?',
      )
      .run(
        slug ?? existing.slug,
        name ?? existing.name,
        publisher ?? existing.publisher,
        questionCount ?? existing.questionCount,
        durationSeconds ?? existing.durationSeconds,
        noGoingBack === undefined ? (existing.noGoingBack ? 1 : 0) : noGoingBack ? 1 : 0,
        id,
      );
    // test_types has no updated_at column; created_at is untouched by design.
    return this.findById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM test_types WHERE id = ?').run(id).changes > 0;
  }

  countQuestions(id: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM questions WHERE test_type_id = ?')
      .get(id) as { n: number };
    return row.n;
  }

  sectionsFor(testTypeId: string): TestSection[] {
    const rows = this.db
      .prepare('SELECT * FROM sections WHERE test_type_id = ? ORDER BY position')
      .all(testTypeId) as SectionRow[];
    return rows.map(mapSection);
  }
}