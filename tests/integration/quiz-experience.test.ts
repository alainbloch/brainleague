import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { createTestContainer } from '../helpers.js';
import { seedContent } from '../../scripts/content/seed.js';
import { quizCoaching } from '../../src/services/quizCoaching.js';

test('final review replaces partial autosave and category totals match graded answers', async () => {
  const { container } = createTestContainer({ clock: () => 1000 });
  try {
    seedContent(container.db);
    container.db
      .prepare(
        "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES ('u', 'User', 'u@example.test', 'x', 1, 1)",
      )
      .run();
    const started = container.services.quizzes.start('u', 'numerical-workout');
    const questions = container.services.quizzes.questions.listForTestType(started.testTypeId);
    const answers = questions
      .slice(0, 3)
      .map((q) => ({ questionId: q.id, chosenIndex: q.correctIndex, timeMs: 2000 }));
    container.services.quizzes.saveProgress(started.attemptId, 'u', answers.slice(0, 1));
    const result = container.services.quizzes.submit(started.attemptId, 'u', answers);
    const report = container.services.quizzes.report(started.attemptId, 'u')!;
    assert.equal(report.questions.length, 3);
    assert.equal(
      report.questions.reduce((sum, q) => sum + q.isCorrect, 0),
      result.correctCount,
    );
    const coaching = quizCoaching(report, container.services.quizzes.tests.list());
    assert.equal(
      coaching.categories.reduce((sum, c) => sum + c.correct, 0),
      3,
    );
    assert.equal(
      coaching.categories.reduce((sum, c) => sum + c.seconds, 0),
      6,
    );
    assert.throws(
      () => container.services.quizzes.saveProgress(started.attemptId, 'u', answers.slice(0, 1)),
      /already finished/,
    );
  } finally {
    container.close();
  }
});

test('HTTP take and results include visuals, unique controls, category metrics and recommendations', async () => {
  const { container } = createTestContainer();
  seedContent(container.db);
  container.db
    .prepare(
      "INSERT INTO users (id, name, email, password_hash, email_verified_at, created_at, updated_at) VALUES ('u', 'User', 'u@example.test', 'x', 1, 1, 1)",
    )
    .run();
  const app = await buildApp({ container });
  // Use the actual middleware session cookie, not a public or bypass route.
  const session = container.services.sessions.createForUser('u');
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/tests/pattern-workout/take',
      headers: { cookie: `usertest_session=${session.token}` },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Which row completes the pattern grid/);
    assert.equal((response.body.match(/id="skip-btn"/g) ?? []).length, 1);
    assert.match(response.body, /aria-keyshortcuts="4"/);
    assert.match(response.body, /Questions completed/);
    const attempt = container.services.quizzes.attempts.findActiveForUser('u', 'pattern-workout')!;
    const q = container.services.quizzes.questions
      .listForTestType('pattern-workout')
      .find((q) => q.categorySlug === 'figure-series')!;
    container.services.quizzes.submit(attempt.id, 'u', [
      { questionId: q.id, chosenIndex: null, timeMs: 12000 },
    ]);
    const result = await app.inject({
      method: 'GET',
      url: `/tests/${attempt.id}/result`,
      headers: { cookie: `usertest_session=${session.token}` },
    });
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /Your category breakdown/);
    assert.match(result.body, /1 skipped/);
    assert.match(result.body, /Next up: figure series/);
    assert.match(result.body, /reasoning-diagram/);
    assert.match(result.body, /Why:/);
  } finally {
    await app.close();
    container.close();
  }
});

test('late answers receive the same credit in the score and category review; unknown time stays unknown', () => {
  const { container } = createTestContainer({ clock: () => 1000 });
  try {
    seedContent(container.db);
    container.db
      .prepare(
        "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES ('u', 'User', 'u@example.test', 'x', 1, 1)",
      )
      .run();
    const started = container.services.quizzes.start('u', 'numerical-workout');
    const questions = container.services.quizzes.questions.listForTestType(started.testTypeId);
    const answers = questions
      .slice(0, 3)
      .map((q, i) => ({
        questionId: q.id,
        chosenIndex: q.correctIndex,
        timeMs: i === 0 ? null : 400000,
      }));
    const result = container.services.quizzes.submit(started.attemptId, 'u', answers);
    const report = container.services.quizzes.report(started.attemptId, 'u')!;
    assert.equal(result.correctCount, 2);
    assert.deepEqual(
      report.questions.map((q) => q.isCorrect),
      [1, 1, 0],
    );
    assert.equal(report.questions[0].hasRecordedTime, false);
    const coaching = quizCoaching(report, container.services.quizzes.tests.list());
    assert.equal(
      coaching.categories.reduce((sum, c) => sum + c.correct, 0),
      2,
    );
    assert.equal(
      coaching.categories.reduce((sum, c) => sum + c.timedQuestions, 0),
      2,
    );
  } finally {
    container.close();
  }
});
