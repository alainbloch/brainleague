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

  sectionsFor(testTypeId: string): TestSection[] {
    const rows = this.db
      .prepare('SELECT * FROM sections WHERE test_type_id = ? ORDER BY position')
      .all(testTypeId) as SectionRow[];
    return rows.map(mapSection);
  }
}