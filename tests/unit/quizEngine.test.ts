import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContainer } from '../../src/container.js';
import type { Question } from '../../src/models/questionsRepository.js';
import { arrangeQuestions } from '../../src/services/quizEngine.js';

/**
 * Build an in-memory container with a small seeded test and run engine scenarios
 * against it. Controlled clock lets us test deadline behavior deterministically.
 */
function makeContainer(clock: () => number, questionCount = 4) {
  const container = buildContainer({
    dbPath: ':memory:',
    clock,
    overrides: {},
  });
  const now = Date.now();
  // attempts.user_id has an FK to users, so seed valid users for the scenarios.
  container.db
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, credential_version, created_at, updated_at)
       VALUES ('user-1', 'One', 'one@test.dev', 'x', 0, ?, ?),
              ('user-2', 'Two', 'two@test.dev', 'x', 0, ?, ?)`,
    )
    .run(now, now, now, now);
  container.db
    .prepare(
      `INSERT INTO test_types (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
       VALUES ('t1', 'mini', 'Mini Test', 'Test', ?, 60, 1, ?)`,
    )
    .run(questionCount, now);
  container.db
    .prepare("INSERT INTO question_categories (slug, name) VALUES ('analogies', 'Analogies')")
    .run();
  for (let i = 0; i < questionCount; i++) {
    container.db
      .prepare(
        `INSERT INTO questions (id, test_type_id, section_id, category_slug, prompt, choices_json, correct_index, explanation, est_seconds, position, created_at, updated_at)
         VALUES (?, 't1', NULL, 'analogies', ?, '["a","b","c"]', 1, 'exp', ?, ?, ?, ?)`,
      )
      .run(`q${i}`, `Q${i}`, 10 + i * 5, i, now, now);
  }
  return container;
}


test('arrangeQuestions: every question appears exactly once', () => {
  const base = [
    { estSeconds: 30 },
    { estSeconds: 10 },
    { estSeconds: 20 },
    { estSeconds: 40 },
  ] as Question[];
  const arranged = arrangeQuestions(base);
  const ids = arranged.map((q) => q.estSeconds);
  assert.deepEqual([...ids].sort(), [10, 20, 30, 40]);
});

test('arrangeQuestions: est_seconds non-decreasing across band boundaries', () => {
  // Build 25 questions with increasing est_seconds so bands are meaningful.
  const base: Question[] = Array.from({ length: 25 }, (_, i) => ({
    estSeconds: 10 + i,
  } as Question));
  const arranged = arrangeQuestions(base);
  const band = Math.max(1, Math.ceil(25 / 10));
  // Within each band boundary, the max before must be <= min after.
  for (let b = 1; b < band; b++) {
    const before = arranged.slice(0, b * 10).map((q) => q.estSeconds);
    const after = arranged.slice(b * 10).map((q) => q.estSeconds);
    const maxBefore = Math.max(...before);
    const minAfter = Math.min(...after);
    assert.ok(maxBefore <= minAfter, `band ${b}: ${maxBefore} should be <= ${minAfter}`);
  }
});

test('arrangeQuestions: shuffles within a band (different orders over runs)', () => {
  const base: Question[] = Array.from({ length: 20 }, (_, i) => ({
    estSeconds: 10 + (i % 4), // 4 equal tiers -> shuffling is visible in run-to-run
  } as Question));
  const orders = new Set<string>();
  for (let run = 0; run < 30; run++) {
    orders.add(JSON.stringify(arrangeQuestions(base).map((q) => q.estSeconds)));
  }
  assert.ok(orders.size > 1, 'expected more than one distinct order across runs');
});

test('start: does not leak correct_index to the client', () => {
  const container = makeContainer(() => 1000);
  try {
    const started = container.services.quizzes.start('user-1', 'mini');
    assert.ok(started.questions.length > 0);
    for (const q of started.questions) {
      assert.ok(!('correctIndex' in q));
      assert.ok(!('explanation' in q));
    }
    assert.equal(started.durationSeconds, 60);
  } finally {
    container.close();
  }
});

test('submit: grades correctly under normal time', () => {
  let t = 1000;
  const container = makeContainer(() => t);
  try {
    const started = container.services.quizzes.start('user-1', 'mini');
    // Deadline = startedAt + 60_000 = 61_000. Client answers 2 correct in time.
    t = 60_000;
    const answers = [
      { questionId: started.questions[0].id, chosenIndex: 1, timeMs: 4000 },
      { questionId: started.questions[2].id, chosenIndex: 0, timeMs: 5000 },
    ];
    const result = container.services.quizzes.submit(started.attemptId, 'user-1', answers);
    // Mini seed: all questions have correct_index = 1.
    const expectedCorrect = answers.filter((a) => a.chosenIndex === 1).length;
    assert.equal(result.correctCount, expectedCorrect);
    assert.equal(result.reachedCount, 2);
    assert.equal(result.timedOut, false);
    assert.equal(result.elapsedMs, 59_000);
  } finally {
    container.close();
  }
});

test('submit: deadline-clamped — answers beyond the budget are not credited', () => {
  let clock = 1000;
  // Use a clock we can advance past the elapsed budget.
  const container = makeContainer(() => clock);
  try {
    const started = container.services.quizzes.start('user-1', 'mini');
    // Advance server clock past the 60s budget so the attempt is timed_out.
    clock = 1000 + 61_000;
    // First answer fits in the 60s budget; the second pushes cumulative time over.
    const answers = [
      { questionId: started.questions[0].id, chosenIndex: 1, timeMs: 40_000 },
      { questionId: started.questions[1].id, chosenIndex: 1, timeMs: 40_000 },
    ];
    const result = container.services.quizzes.submit(started.attemptId, 'user-1', answers);
    assert.equal(result.timedOut, true);
    // Only the first answer is within the 60s budget.
    assert.equal(result.reachedCount, 1);
    assert.equal(result.correctCount, 1); // q0 correct_index=1, chosen=1
    assert.equal(result.elapsedMs, 60_000);
  } finally {
    container.close();
  }
});

test('submit: duplicate answer / question not on test is rejected', () => {
  const container = makeContainer(() => 1000);
  try {
    const started = container.services.quizzes.start('user-1', 'mini');
    const q0 = started.questions[0].id;
    const a1 = { questionId: q0, chosenIndex: 1, timeMs: 1000 };

    // Same question twice in one submit -> PK collision (attempt_id, question_id).
    assert.throws(() =>
      container.services.quizzes.submit(started.attemptId, 'user-1', [
        a1,
        { questionId: q0, chosenIndex: 0, timeMs: 1100 },
      ]),
    );

    // Non-test question id rejected.
    const bad = { questionId: 'foreign-question', chosenIndex: 1, timeMs: 1000 };
    assert.throws(() =>
      container.services.quizzes.submit(started.attemptId, 'user-1', [bad]),
    );

    // A valid submit succeeds, then a second submit of the same attempt is rejected.
    const ok = container.services.quizzes.submit(started.attemptId, 'user-1', [
      { questionId: q0, chosenIndex: 1, timeMs: 1000 },
    ]);
    assert.equal(ok.correctCount, 1);
    assert.throws(() =>
      container.services.quizzes.submit(started.attemptId, 'user-1', [a1]),
    );
  } finally {
    container.close();
  }
});

test('submit: cannot submit another user\'s attempt', () => {
  const container = makeContainer(() => 1000);
  try {
    const started = container.services.quizzes.start('user-1', 'mini');
    assert.throws(() =>
      container.services.quizzes.submit(started.attemptId, 'user-2', []),
    );
  } finally {
    container.close();
  }
});

test('saveProgress persists answers; submit grades from them', () => {
  let t = 1000;
  const container = makeContainer(() => t);
  try {
    const started = container.services.quizzes.start('user-1', 'mini');
    const answers = [
      { questionId: started.questions[0].id, chosenIndex: 1, timeMs: 4000 },
      { questionId: started.questions[2].id, chosenIndex: 0, timeMs: 5000 },
    ];
    container.services.quizzes.saveProgress(started.attemptId, 'user-1', answers);
    assert.equal(container.repos.attempts.answersFor(started.attemptId).length, 2);
    t = 10_000; // still within deadline
    const result = container.services.quizzes.submit(started.attemptId, 'user-1', answers);
    assert.equal(result.correctCount, 1); // q0 correct (index 1)
    assert.equal(result.reachedCount, 2);
    assert.equal(result.timedOut, false);
  } finally { container.close(); }
});

test('auto-complete: finalizeExpiredUntil grades an abandoned attempt as timed_out', () => {
  let t = 1000;
  const container = makeContainer(() => t);
  try {
    const started = container.services.quizzes.start('user-1', 'mini');
    container.services.quizzes.saveProgress(started.attemptId, 'user-1', [
      { questionId: started.questions[0].id, chosenIndex: 1, timeMs: 5000 },
    ]);
    t = 1000 + 61_000;
    const count = container.services.quizzes.finalizeExpiredUntil(t);
    assert.equal(count, 1);
    const stored = container.repos.attempts.findById(started.attemptId)!;
    assert.equal(stored.status, 'timed_out');
    assert.equal(stored.correctCount, 1);
    assert.equal(stored.reachedCount, 1);
    assert.ok(stored.finishedAt);
  } finally { container.close(); }
});

test('start resumes an in-progress attempt within its deadline', () => {
  let t = 1000;
  const container = makeContainer(() => t);
  try {
    const first = container.services.quizzes.start('user-1', 'mini');
    t = 1000 + 30_000;
    const second = container.services.quizzes.start('user-1', 'mini');
    assert.equal(second.attemptId, first.attemptId);
    assert.equal(second.startedAt, first.startedAt);
  } finally { container.close(); }
});

test('start after deadline finalizes the old attempt and starts a fresh one', () => {
  let t = 1000;
  const container = makeContainer(() => t);
  try {
    const first = container.services.quizzes.start('user-1', 'mini');
    container.services.quizzes.saveProgress(first.attemptId, 'user-1', [
      { questionId: first.questions[0].id, chosenIndex: 1, timeMs: 5000 },
    ]);
    t = 1000 + 61_000;
    const second = container.services.quizzes.start('user-1', 'mini');
    assert.notEqual(second.attemptId, first.attemptId);
    assert.equal(second.startedAt, t);
    const old = container.repos.attempts.findById(first.attemptId)!;
    assert.equal(old.status, 'timed_out');
    assert.equal(old.correctCount, 1);
  } finally { container.close(); }
});
