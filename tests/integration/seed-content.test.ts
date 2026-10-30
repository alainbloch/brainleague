import { test } from 'node:test';
import type { Environment } from 'nunjucks';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/models/database.js';
import { seedContent } from '../../scripts/content/seed.js';
import { practiceTests, categories } from '../../scripts/content/catalog.js';
import { LEGACY_TEST, LEGACY_TUTORIALS } from '../../scripts/content/legacy.js';
import { tutorials } from '../../scripts/content/tutorials.js';
import { createTestContainer } from '../helpers.js';
import { buildApp } from '../../src/app.js';

function count(db: ReturnType<typeof openDatabase>, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

test('catalog contains complete banks with valid choices, explanations and category tutorials', () => {
  assert.deepEqual(
    practiceTests.map((t) => t.questions.length),
    [50, 20, 20, 20],
  );
  const categorySlugs = new Set(categories.map(([slug]) => slug));
  for (const bank of practiceTests) {
    assert.equal(new Set(bank.questions.map((q) => q.key)).size, bank.questions.length);
    assert.equal(new Set(bank.questions.map((q) => q.prompt)).size, bank.questions.length);
    for (const question of bank.questions) {
      assert.ok(categorySlugs.has(question.category as (typeof categories)[number][0]));
      assert.equal(question.choices.length, 4);
      assert.equal(new Set(question.choices).size, 4);
      assert.ok(
        Number.isInteger(question.correct) && question.correct >= 0 && question.correct < 4,
      );
      assert.ok(question.estSeconds > 0 && Number.isFinite(question.estSeconds));
      assert.ok(question.explanation.length > 20);
      assert.ok(tutorials.some((t) => t.category === question.category));
    }
  }
  for (const tutorial of tutorials) {
    assert.match(tutorial.body, /WORKED EXAMPLE/);
    assert.match(tutorial.body, /TRY IT/);
    assert.match(tutorial.body, /CHECK YOUR ANSWER/);
    assert.ok(!tutorial.body.includes('$X$'));
  }
});

test('fresh install and rerun add content only once, with no timestamp churn', () => {
  const db = openDatabase(':memory:');
  try {
    assert.deepEqual(seedContent(db, 1000), {
      testsAdded: 4,
      questionsAdded: 110,
      tutorialsAdded: 12,
      tutorialsUpdated: 0,
    });
    const before = db.prepare('SELECT * FROM tutorials ORDER BY id').all();
    assert.deepEqual(seedContent(db, 2000), {
      testsAdded: 0,
      questionsAdded: 0,
      tutorialsAdded: 0,
      tutorialsUpdated: 0,
    });
    assert.equal(count(db, 'questions'), 110);
    assert.equal(count(db, 'question_categories'), 9);
    assert.deepEqual(db.prepare('SELECT * FROM tutorials ORDER BY id').all(), before);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  } finally {
    db.close();
  }
});

test('legacy install upgrades untouched tutorials but preserves custom edits and original question IDs', () => {
  const db = openDatabase(':memory:');
  try {
    seedContent(db, 1000);
    // Recreate the old installation, with two admin edits and one added tutorial.
    db.prepare(
      "DELETE FROM questions WHERE id NOT GLOB 'pi-cognitive-assessment-q[0-9][0-9][0-9]'",
    ).run();
    db.prepare('DELETE FROM test_types WHERE id != ?').run(LEGACY_TEST.id);
    db.prepare('DELETE FROM tutorials').run();
    const insert = db.prepare('INSERT INTO tutorials VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of LEGACY_TUTORIALS)
      insert.run(`tutorial-${t.slug}`, t.category, t.slug, t.title, t.body, t.order, 100, 100);
    db.prepare("UPDATE tutorials SET body = 'My custom lesson' WHERE slug = 'analogies'").run();
    db.prepare(
      "UPDATE tutorials SET title = 'My arithmetic title' WHERE slug = 'arithmetic'",
    ).run();
    insert.run('custom', 'analogies', 'custom-lesson', 'Custom lesson', 'Keep this', 50, 100, 100);
    db.prepare(
      "UPDATE questions SET explanation = 'Admin explanation' WHERE id = 'pi-cognitive-assessment-q001'",
    ).run();
    const oldQuestions = db.prepare('SELECT * FROM questions ORDER BY id').all();
    const result = seedContent(db, 2000);
    assert.equal(result.testsAdded, 3);
    assert.equal(result.questionsAdded, 94);
    assert.equal(result.tutorialsUpdated, 6);
    assert.equal(result.tutorialsAdded, 4);
    assert.deepEqual(
      db
        .prepare(
          "SELECT * FROM questions WHERE id GLOB 'pi-cognitive-assessment-q[0-9][0-9][0-9]' ORDER BY id",
        )
        .all(),
      oldQuestions,
    );
    assert.deepEqual(db.prepare("SELECT body FROM tutorials WHERE slug = 'analogies'").get(), {
      body: 'My custom lesson',
    });
    assert.deepEqual(db.prepare("SELECT title FROM tutorials WHERE slug = 'arithmetic'").get(), {
      title: 'My arithmetic title',
    });
    assert.deepEqual(db.prepare("SELECT body FROM tutorials WHERE id = 'custom'").get(), {
      body: 'Keep this',
    });
    assert.equal(count(db, 'tutorials'), 13);
    assert.equal(seedContent(db, 3000).tutorialsUpdated, 0);
  } finally {
    db.close();
  }
});

test('a failed content import rolls back all inserted records', () => {
  const db = openDatabase(':memory:');
  try {
    db.exec(
      "CREATE TRIGGER reject_question BEFORE INSERT ON questions BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;",
    );
    assert.throws(() => seedContent(db), /simulated failure/);
    assert.equal(count(db, 'questions'), 0);
    assert.equal(count(db, 'test_types'), 0);
    assert.equal(count(db, 'question_categories'), 0);
  } finally {
    db.close();
  }
});

test('all shipped tests can be taken, graded and reviewed without exposing answers at start', async () => {
  const { container } = createTestContainer();
  const app = await buildApp({ container });
  try {
    seedContent(container.db);
    const user = container.db
      .prepare(`INSERT INTO users (id, email, name, password_hash, email_verified_at, created_at, updated_at)
      VALUES ('content-player', 'content@example.test', 'Player', 'unused', 1, 1, 1)`);
    user.run();
    for (const testType of practiceTests) {
      const started = container.services.quizzes.start('content-player', testType.id);
      assert.equal(started.questions.length, testType.questions.length);
      assert.ok(started.questions.every((q) => !('correctIndex' in q) && !('explanation' in q)));
      const expected = new Map(testType.questions.map((q) => [`${testType.id}-${q.key}`, q]));
      const result = container.services.quizzes.submit(
        started.attemptId,
        'content-player',
        started.questions.map((q) => ({
          questionId: q.id,
          chosenIndex: expected.get(q.id)!.correct,
          timeMs: 1,
        })),
      );
      assert.equal(result.correctCount, testType.questions.length);
      const report = container.services.quizzes.report(started.attemptId, 'content-player')!;
      assert.equal(report.questions.length, testType.questions.length);
      const resultHtml = app.getDecorator<Environment>('viewEngine').render('quizzes/result.njk', {
        report,
        accuracy: 100,
        avgSecondsPerQuestion: 0,
      });
      assert.match(resultHtml, /<strong>Why:<\/strong>/);
      assert.ok(
        resultHtml.includes(
          report.questions[0].explanation
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;'),
        ),
      );

      assert.ok(
        report.questions.every((q) => q.explanation === expected.get(q.questionId)!.explanation),
      );
    }
    // Public rendering is exercised by the existing authenticated HTTP suite;
    // render these views directly to check the full seeded teaching material.
    await app.ready();
    for (const tutorial of tutorials) {
      const html = app.getDecorator<Environment>('viewEngine').render('tutorial.njk', {
        tutorial: { ...tutorial, categorySlug: tutorial.category },
      });
      assert.match(html, /CHECK YOUR ANSWER/);
      assert.match(html, /Try a practice test/);
    }
  } finally {
    await app.close();
    container.close();
  }
});
