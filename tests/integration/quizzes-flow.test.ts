import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { buildApp } from '../../src/app.js';
import { createTestContainer, tokenFromUrl, type TestContainer } from '../helpers.js';

let app: FastifyInstance;
let container: TestContainer;

/** A fixed, small solo test bank so the flow can assert exact grades. */
function seedTestData(): void {
  const now = Date.now();
  container.db
    .prepare(
      `INSERT INTO test_types (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
       VALUES ('t1', 'mini', 'Mini Test', 'Tester', 3, 60, 1, ?)`,
    )
    .run(now);
  container.db
    .prepare("INSERT INTO question_categories (slug, name) VALUES ('analogies', 'Analogies')")
    .run();
  const insert = container.db.prepare(
    `INSERT INTO questions (id, test_type_id, section_id, category_slug, prompt, choices_json, correct_index, explanation, est_seconds, position, created_at, updated_at)
     VALUES (?, 't1', NULL, 'analogies', ?, ?, ?, 'exp', 15, ?, ?, ?)`,
  );
  // All questions have correct_index = 1 ("b").
  insert.run('q0', 'capital of x', '["a","b","c"]', 1, 0, now, now);
  insert.run('q1', 'second prompt', '["a","b","c"]', 1, 1, now, now);
  insert.run('q2', 'third prompt', '["a","b","c"]', 1, 2, now, now);
}

before(async () => {
  ({ container } = createTestContainer());
  seedTestData();
  app = await buildApp({ container });
  await app.ready();
});

after(async () => {
  await app.close();
  container.close();
});

/** Register + verify an account and return the session cookie. */
async function signupAndGetCookie(name: string, email: string): Promise<string> {
  await request(app.server as Server)
    .post('/register')
    .type('form')
    .send({ name, email, password: 'Correct-Horse-42!' })
    .expect(200);
  const mail = container.mailer.sent.find((m) => m.email === email);
  assert.ok(mail, `verification email sent to ${email}`);
  const verify = await request(app.server as Server).get(
    `/auth/verify?token=${tokenFromUrl(mail.url)}&email=${encodeURIComponent(email)}`,
  );
  assert.equal(verify.status, 302, 'redirects after verify');
  return verify.headers['set-cookie'][0].split(';')[0];
}

/** The take page embeds the attempt id in the JS; pull it out. */
function attemptIdFromTakePage(html: string): string {
  const match = /var attemptId = "([a-f0-9-]+)";/.exec(html);
  if (!match) throw new Error('No attemptId embedded in take page');
  return match[1];
}

test('catalog requires auth', async () => {
  await request(app.server as Server).get('/tests').expect(302);
});

test('catalog renders the available test types', async () => {
  const cookie = await signupAndGetCookie('Carl', 'carl@example.com');
  const res = await request(app.server as Server)
    .get('/tests')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(res.text, /Practice tests/);
  assert.match(res.text, /Mini Test/);
});

test('take page starts an attempt and shows the first question', async () => {
  const cookie = await signupAndGetCookie('Dana', 'dana@example.com');
  const res = await request(app.server as Server)
    .get('/tests/mini/take')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(res.text, /Test in progress/);
  assert.match(res.text, /capital of x/);
  assert.match(res.text, /var attemptId = "/);
});

test('submit grades answers and redirects to the result report', async () => {
  const cookie = await signupAndGetCookie('Erin', 'erin@example.com');
  // Start (or resume) an attempt to learn its id.
  const take = await request(app.server as Server)
    .get('/tests/mini/take')
    .set('Cookie', cookie)
    .expect(200);
  const attemptId = attemptIdFromTakePage(take.text);

  // q0 correct (index 1), q1 wrong (index 0), q2 skipped (null).
  const answers = JSON.stringify([
    { questionId: 'q0', chosenIndex: 1, timeMs: 5000 },
    { questionId: 'q1', chosenIndex: 0, timeMs: 3000 },
    { questionId: 'q2', chosenIndex: null, timeMs: 7000 },
  ]);

  const submit = await request(app.server as Server)
    .post(`/tests/${attemptId}/submit`)
    .type('form')
    .set('Cookie', cookie)
    .send({ answers })
    .expect(302);
  assert.match(submit.headers.location, new RegExp(`/tests/${attemptId}/result`));

  const result = await request(app.server as Server)
    .get(`/tests/${attemptId}/result`)
    .set('Cookie', cookie)
    .expect(200);
  assert.match(result.text, /Mini Test/);
  assert.match(result.text, /Question review/);
  // 1 correct, 2 reached -> every state shows up in the replay.
  assert.match(result.text, /Correct/);
  assert.match(result.text, /Wrong/);
  assert.match(result.text, /Skipped/);

  // The graded attempt is persisted as submitted, not in_progress.
  const stored = container.repos.attempts.findById(attemptId)!;
  assert.equal(stored.correctCount, 1);
  assert.equal(stored.reachedCount, 2);
  assert.equal(stored.status, 'submitted');
});

test('a non-owner cannot view the result report', async () => {
  const ownerCookie = await signupAndGetCookie('Frank', 'frank@example.com');
  const take = await request(app.server as Server)
    .get('/tests/mini/take')
    .set('Cookie', ownerCookie)
    .expect(200);
  const attemptId = attemptIdFromTakePage(take.text);

  // Finish the attempt so a report exists.
  await request(app.server as Server)
    .post(`/tests/${attemptId}/submit`)
    .type('form')
    .set('Cookie', ownerCookie)
    .send({ answers: JSON.stringify([{ questionId: 'q0', chosenIndex: 1, timeMs: 1000 }]) })
    .expect(302);

  const strangerCookie = await signupAndGetCookie('Gina', 'gina@example.com');
  const forbidden = await request(app.server as Server)
    .get(`/tests/${attemptId}/result`)
    .set('Cookie', strangerCookie)
    .expect(404);
  assert.match(forbidden.text, /Not found/);
});