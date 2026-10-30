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

  findById(id: string): Question | null {
    const row = this.db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as
      | QuestionRow
      | undefined;
    return row ? mapQuestion(row) : null;
  }

  countForTestType(testTypeId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM questions WHERE test_type_id = ?')
      .get(testTypeId) as { n: number };
    return row.n;
  }
}