import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface Tutorial {
  id: string;
  categorySlug: string;
  slug: string;
  title: string;
  body: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface TutorialRow {
  id: string;
  category_slug: string;
  slug: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface TutorialCreateInput {
  categorySlug: string;
  slug: string;
  title: string;
  body: string;
  sortOrder?: number;
  createdAt: number;
}

/** Category-keyed tips that the result report links to (see tutorials table). */
export class TutorialsRepository {
  constructor(private db: Database.Database) {}

  list(): Tutorial[] {
    const rows = this.db
      .prepare('SELECT * FROM tutorials ORDER BY sort_order ASC, title ASC')
      .all() as TutorialRow[];
    return rows.map(mapTutorial);
  }

  findBySlug(slug: string): Tutorial | null {
    const row = this.db.prepare('SELECT * FROM tutorials WHERE slug = ?').get(slug) as
      | TutorialRow
      | undefined;
    return row ? mapTutorial(row) : null;
  }

  findById(id: string): Tutorial | null {
    const row = this.db.prepare('SELECT * FROM tutorials WHERE id = ?').get(id) as
      | TutorialRow
      | undefined;
    return row ? mapTutorial(row) : null;
  }

  create({
    categorySlug,
    slug,
    title,
    body,
    sortOrder = 0,
    createdAt,
    id = randomUUID(),
  }: TutorialCreateInput & { id?: string }): Tutorial {
    this.db
      .prepare(
        `INSERT INTO tutorials (id, category_slug, slug, title, body, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, categorySlug, slug, title, body, sortOrder, createdAt, createdAt);
    return this.findById(id)!;
  }

  update(
    id: string,
    {
      categorySlug,
      slug,
      title,
      body,
      sortOrder,
      updatedAt,
    }: {
      categorySlug?: string;
      slug?: string;
      title?: string;
      body?: string;
      sortOrder?: number;
      updatedAt: number;
    },
  ): Tutorial | null {
    const existing = this.findById(id);
    if (!existing) return null;
    this.db
      .prepare(
        `UPDATE tutorials
         SET category_slug = ?, slug = ?, title = ?, body = ?, sort_order = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        categorySlug ?? existing.categorySlug,
        slug ?? existing.slug,
        title ?? existing.title,
        body ?? existing.body,
        sortOrder ?? existing.sortOrder,
        updatedAt,
        id,
      );
    return this.findById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM tutorials WHERE id = ?').run(id).changes > 0;
  }
}

function mapTutorial(row: TutorialRow): Tutorial {
  return {
    id: row.id,
    categorySlug: row.category_slug,
    slug: row.slug,
    title: row.title,
    body: row.body,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}