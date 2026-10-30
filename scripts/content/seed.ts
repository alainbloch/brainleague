import type Database from 'better-sqlite3';
import { categories, practiceTests } from './catalog.js';
import { LEGACY_TUTORIALS } from './legacy.js';
import { tutorials } from './tutorials.js';

export interface SeedSummary {
  testsAdded: number;
  questionsAdded: number;
  tutorialsAdded: number;
  tutorialsUpdated: number;
}

/**
 * Add the shipped catalog to an already migrated database, atomically.
 * Stable question keys preserve saved attempts. Only exact, untouched legacy
 * tutorials are upgraded; admin edits and custom records always survive reruns.
 * SQL errors roll back the whole content update and propagate to the caller.
 */
export function seedContent(db: Database.Database, now = Date.now()): SeedSummary {
  return db.transaction(() => {
    const summary: SeedSummary = {
      testsAdded: 0,
      questionsAdded: 0,
      tutorialsAdded: 0,
      tutorialsUpdated: 0,
    };
    for (const [slug, name] of categories) {
      db.prepare('INSERT OR IGNORE INTO question_categories (slug, name) VALUES (?, ?)').run(
        slug,
        name,
      );
    }
    for (const test of practiceTests) {
      summary.testsAdded += db
        .prepare(
          `INSERT OR IGNORE INTO test_types
        (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .run(
          test.id,
          test.id,
          test.name,
          test.publisher,
          test.questions.length,
          test.durationSeconds,
          now,
        ).changes;
      const existing = db.prepare('SELECT id FROM test_types WHERE slug = ?').get(test.id) as {
        id: string;
      };
      const insert = db.prepare(`INSERT OR IGNORE INTO questions
        (id, test_type_id, section_id, category_slug, prompt, choices_json, correct_index, explanation, est_seconds, position, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const [index, question] of test.questions.entries()) {
        summary.questionsAdded += insert.run(
          `${test.id}-${question.key}`,
          existing.id,
          question.category,
          question.prompt,
          JSON.stringify(question.choices),
          question.correct,
          question.explanation,
          question.estSeconds,
          index + 1,
          now,
          now,
        ).changes;
      }
    }
    for (const tutorial of tutorials) {
      summary.tutorialsAdded += db
        .prepare(
          `INSERT OR IGNORE INTO tutorials
        (id, category_slug, slug, title, body, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `tutorial-${tutorial.slug}`,
          tutorial.category,
          tutorial.slug,
          tutorial.title,
          tutorial.body,
          tutorial.order,
          now,
          now,
        ).changes;
      const legacy = LEGACY_TUTORIALS.find((item) => item.slug === tutorial.slug);
      if (legacy) {
        summary.tutorialsUpdated += db
          .prepare(
            `UPDATE tutorials SET title = ?, body = ?, sort_order = ?, updated_at = ?
          WHERE id = ? AND slug = ? AND category_slug = ? AND title = ? AND body = ? AND sort_order = ?`,
          )
          .run(
            tutorial.title,
            tutorial.body,
            tutorial.order,
            now,
            `tutorial-${legacy.slug}`,
            legacy.slug,
            legacy.category,
            legacy.title,
            legacy.body,
            legacy.order,
          ).changes;
      }
    }
    return summary;
  })();
}
