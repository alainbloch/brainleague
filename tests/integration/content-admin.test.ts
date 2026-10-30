import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContainer } from '../../src/container.js';

/** Build a container with an admin user, a seed category, and a seed test type. */
function makeScenario() {
  const container = buildContainer({ dbPath: ':memory:', clock: () => Date.now() });
  const now = Date.now();
  container.db
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, credential_version, created_at, updated_at)
       VALUES ('admin', 'Admin', 'admin@t.dev', 'x', 0, ?, ?)`,
    )
    .run(now, now);
  container.db.prepare(`UPDATE users SET role = 'admin' WHERE id = 'admin'`).run();
  container.db
    .prepare(`INSERT INTO question_categories (slug, name) VALUES ('analogies', 'Analogies')`)
    .run();
  container.db
    .prepare(
      `INSERT INTO test_types (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
       VALUES ('t1', 'pi-cognitive-assessment', 'PI Cognitive Assessment', 'Predictive Index', 2, 720, 1, ?)`,
    )
    .run(now);
  return container;
}

const validQuestion = {
  testTypeId: 't1',
  categorySlug: 'analogies',
  prompt: 'Finger is to hand as leaf is to ______.',
  choices: ['branch', 'tree', 'green', 'fall'],
  correctIndex: 1,
  explanation: 'A leaf is a part of a tree.',
  estSeconds: 18,
};

test('content-admin: create question persists and appears in listing', () => {
  const container = makeScenario();
  try {
    const created = container.services.contentAdmin.createQuestion(validQuestion);
    assert.ok(created.id);
    const list = container.services.contentAdmin.listQuestions({});
    assert.equal(list.total, 1);
    assert.equal(list.rows[0].prompt, validQuestion.prompt);
    assert.deepEqual(list.rows[0].choices, validQuestion.choices);
  } finally {
    container.close();
  }
});

test('content-admin: rejects a malformed question without writing', () => {
  const container = makeScenario();
  try {
    // correctIndex out of range
    assert.throws(() =>
      container.services.contentAdmin.createQuestion({ ...validQuestion, correctIndex: 9 }),
      /valid choice index/,
    );
    // too few choices
    assert.throws(() =>
      container.services.contentAdmin.createQuestion({ ...validQuestion, choices: ['only'] }),
      /at least two/,
    );
    // unknown category
    assert.throws(() =>
      container.services.contentAdmin.createQuestion({ ...validQuestion, categorySlug: 'nope' }),
      /Unknown category/,
    );
    assert.equal(container.services.contentAdmin.listQuestions({}).total, 0);
  } finally {
    container.close();
  }
});

test('content-admin: refuses deleting a test type that still has questions', () => {
  const container = makeScenario();
  try {
    container.services.contentAdmin.createQuestion(validQuestion);
    assert.throws(() => container.services.contentAdmin.deleteTestType('t1'), /still has questions/);
  } finally {
    container.close();
  }
});

test('content-admin: refuses deleting a category still referenced by questions', () => {
  const container = makeScenario();
  try {
    container.services.contentAdmin.createQuestion(validQuestion);
    assert.throws(
      () => container.services.contentAdmin.deleteCategory('analogies'),
      /still has questions/,
    );
  } finally {
    container.close();
  }
});

test('content-admin: tutorial CRUD with slug uniqueness and category link', () => {
  const container = makeScenario();
  try {
    const t = container.services.contentAdmin.createTutorial({
      categorySlug: 'analogies',
      slug: 'analogy-tips',
      title: 'Analogy tips',
      body: 'Look for part/whole relationships.',
      sortOrder: 1,
    });
    assert.ok(t.id);
    assert.throws(
      () =>
        container.services.contentAdmin.createTutorial({
          categorySlug: 'analogies',
          slug: 'analogy-tips',
          title: 'Dup',
          body: 'x',
        }),
      /already in use/,
    );
    // Unknown category refused.
    assert.throws(
      () =>
        container.services.contentAdmin.createTutorial({
          categorySlug: 'missing',
          slug: 'x',
          title: 'y',
          body: 'z',
        }),
      /Unknown category/,
    );
  } finally {
    container.close();
  }
});

test('content-admin: plain users are not admins (route guard is role-aware)', () => {
  const container = makeScenario();
  try {
    const user = container.services.identity.createVerifiedUser({
      name: 'Plain',
      email: 'plain@t.dev',
      password: 'Change-me-123!',
      role: 'user',
    });
    const role = container.db
      .prepare('SELECT role FROM users WHERE id = ?')
      .get(user.id) as { role: string };
    assert.equal(role.role, 'user');
    const admin = container.db
      .prepare('SELECT role FROM users WHERE id = ?')
      .get('admin') as { role: string };
    assert.equal(admin.role, 'admin');
  } finally {
    container.close();
  }
});