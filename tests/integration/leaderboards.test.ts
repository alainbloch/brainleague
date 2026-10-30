import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContainer } from '../../src/container.js';

/**
 * Seed a test type + category + questions, three users, attempts with chosen
 * scores, and an accepted friendship, then exercise ranking + friend scoping +
 * friend-score notification fan-out against a real in-memory container.
 */
function makeScenario() {
  let clock = 1_000_000;
  const container = buildContainer({ dbPath: ':memory:', clock: () => clock });
  const now = Date.now();

  container.db
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, credential_version, created_at, updated_at)
       VALUES ('alice', 'Alice', 'a@t.dev', 'x', 0, ?, ?),
              ('bob', 'Bob', 'b@t.dev', 'x', 0, ?, ?),
              ('carol', 'Carol', 'c@t.dev', 'x', 0, ?, ?)`,
    )
    .run(now, now, now, now, now, now);
  container.db
    .prepare(`INSERT INTO question_categories (slug, name) VALUES ('analogies', 'Analogies')`)
    .run();
  container.db
    .prepare(
      `INSERT INTO test_types (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
       VALUES ('t1', 'pi-cognitive-assessment', 'PI Cognitive Assessment', 'Predictive Index', 3, 720, 1, ?)`,
    )
    .run(now);
  for (let i = 0; i < 3; i++) {
    container.db
      .prepare(
        `INSERT INTO questions (id, test_type_id, section_id, category_slug, prompt, choices_json, correct_index, explanation, est_seconds, position, created_at, updated_at)
         VALUES (?, 't1', NULL, 'analogies', ?, '["a","b"]', 0, 'exp', 10, ?, ?, ?)`,
      )
      .run(`q${i}`, `Q${i}`, i, now, now);
  }

  // Bob and Carol are friends with Alice (accepted).
  for (const f of ['bob', 'carol']) {
    container.repos.friendships.createPending('alice', f, now);
    container.repos.friendships.accept('alice', f, now);
  }

  // Seed finished attempts with distinct scores.
  const attempts = [
    { user: 'alice', correct: 2, reached: 3, elapsed: 3000, status: 'submitted' },
    { user: 'bob', correct: 1, reached: 2, elapsed: 5000, status: 'submitted' },
    { user: 'carol', correct: 1, reached: 2, elapsed: 4000, status: 'timed_out' }, // same correct+reached, faster than bob
  ];
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const id = `att${i}`;
    container.db
      .prepare(
        `INSERT INTO attempts (id, user_id, test_type_id, section_id, started_at, finished_at, correct_count, reached_count, total_questions, elapsed_ms, status)
         VALUES (?, ?, 't1', NULL, ?, ?, ?, ?, 3, ?, ?)`,
      )
      .run(id, a.user, clock, clock + a.elapsed, a.correct, a.reached, a.elapsed, a.status);
  }

  return { container, byUser: { alice: 'att0', bob: 'att1', carol: 'att2' } };
}

test('leaderboards: global ranks by (correct DESC, reached DESC, elapsed ASC)', () => {
  const { container } = makeScenario();
  try {
    const board = container.services.leaderboards.global('pi-cognitive-assessment');
    // Ranking: Alice (2/3) first; Carol and Bob both 1/2 -> Carol (faster) before Bob.
    assert.deepEqual(
      board.entries.map((e) => e.userId),
      ['alice', 'carol', 'bob'],
    );
    assert.deepEqual(
      board.entries.map((e) => e.rank),
      [1, 2, 3],
    );
  } finally {
    container.close();
  }
});

test('leaderboards: friend scope excludes non-friends of the viewer', () => {
  const { container } = makeScenario();
  try {
    // Alice's friend leaderboard includes Carol and Bob but not Alice herself.
    const friends = container.services.leaderboards.friend('pi-cognitive-assessment', 'alice');
    assert.deepEqual(
      [...friends.entries.map((e) => e.userId)].sort(),
      ['bob', 'carol'],
    );
  } finally {
    container.close();
  }
});

test('leaderboards: notifyFriendScore fans out one per friend and none to actor', async () => {
  const { container, byUser } = makeScenario();
  try {
    const attempt = container.repos.attempts.findById(byUser.alice)!;
    const before = container.repos.notifications.listForUser('bob');
    const count = await container.services.leaderboards.notifyFriendScore(
      attempt,
      { correctCount: 2, reachedCount: 3, elapsedMs: 3000 },
      'alice',
    );
    assert.equal(count, 2); // bob + carol
    const bobNotifs = container.repos.notifications.listForUser('bob');
    assert.equal(bobNotifs.length, before.length + 1);
    assert.equal(bobNotifs[bobNotifs.length - 1].type, 'friend-score');
    assert.equal(bobNotifs[bobNotifs.length - 1].payload.userName, 'Alice');
    assert.equal(bobNotifs[bobNotifs.length - 1].payload.correctCount, 2);
    // Actor gets none.
    assert.equal(container.repos.notifications.listForUser('alice').length, 0);
  } finally {
    container.close();
  }
});