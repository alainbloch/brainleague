import type Database from 'better-sqlite3';

export interface QuestionCategory {
  slug: string;
  name: string;
}

interface CategoryRow {
  slug: string;
  name: string;
}

export interface CategoryCreateInput {
  slug: string;
  name: string;
}

/** The taxonomy of question categories that questions and tutorials reference. */
export class QuestionCategoriesRepository {
  constructor(private db: Database.Database) {}

  list(): QuestionCategory[] {
    const rows = this.db
      .prepare('SELECT * FROM question_categories ORDER BY name')
      .all() as CategoryRow[];
    return rows.map(mapCategory);
  }

  findBySlug(slug: string): QuestionCategory | null {
    const row = this.db
      .prepare('SELECT * FROM question_categories WHERE slug = ?')
      .get(slug) as CategoryRow | undefined;
    return row ? mapCategory(row) : null;
  }

  create({ slug, name }: CategoryCreateInput): QuestionCategory {
    this.db.prepare('INSERT INTO question_categories (slug, name) VALUES (?, ?)').run(slug, name);
    return this.findBySlug(slug)!;
  }

  updateName(slug: string, name: string): QuestionCategory | null {
    this.db.prepare('UPDATE question_categories SET name = ? WHERE slug = ?').run(name, slug);
    return this.findBySlug(slug);
  }

  delete(slug: string): boolean {
    return this.db.prepare('DELETE FROM question_categories WHERE slug = ?').run(slug).changes > 0;
  }

  /** Number of questions that reference this category (blocks deletion). */
  countQuestions(slug: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM questions WHERE category_slug = ?')
      .get(slug) as { n: number };
    return row.n;
  }

  /** Number of tutorials that reference this category (blocks deletion). */
  countTutorials(slug: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM tutorials WHERE category_slug = ?')
      .get(slug) as { n: number };
    return row.n;
  }
}

function mapCategory(row: CategoryRow): QuestionCategory {
  return { slug: row.slug, name: row.name };
}