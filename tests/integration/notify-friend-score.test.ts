import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { buildApp } from '../../src/app.js';
import { createTestContainer, tokenFromUrl, type TestContainer } from '../helpers.js';

let app: FastifyInstance;
let container: TestContainer;

/** A fixed, small solo test bank so a user can complete a real test. */
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

function attemptIdFromTakePage(html: string): string {
  const match = /var attemptId = "([a-f0-9-]+)";/.exec(html);
  if (!match) throw new Error('No attemptId embedded in take page');
  return match[1];
}

test('a friend is notified when the actor finishes a test', async () => {
  const actorCookie = await signupAndGetCookie('Heidi', 'heidi@example.com');
  await signupAndGetCookie('Ivan', 'ivan@example.com');

  // Find the new users' ids and make them accepted friends via the repository.
  const actor = container.repos.users.findByEmail('heidi@example.com')!;
  const friend = container.repos.users.findByEmail('ivan@example.com')!;
  container.repos.friendships.createPending(actor.id, friend.id, Date.now());
  container.repos.friendships.accept(actor.id, friend.id, Date.now());

  // Friend inbox is empty before the attempt.
  assert.equal(container.repos.notifications.listForUser(friend.id).length, 0);

  // Actor starts and completes the test.
  const take = await request(app.server as Server)
    .get('/tests/mini/take')
    .set('Cookie', actorCookie)
    .expect(200);
  const attemptId = attemptIdFromTakePage(take.text);

  const answers = JSON.stringify([
    { questionId: 'q0', chosenIndex: 1, timeMs: 5000 },
    { questionId: 'q1', chosenIndex: 0, timeMs: 3000 },
    { questionId: 'q2', chosenIndex: null, timeMs: 7000 },
  ]);

  await request(app.server as Server)
    .post(`/tests/${attemptId}/submit`)
    .type('form')
    .set('Cookie', actorCookie)
    .send({ answers })
    .expect(302);

  // Friend now has exactly one friend-score notification with the result.
  const friendNotifs = container.repos.notifications.listForUser(friend.id);
  assert.equal(friendNotifs.length, 1);
  assert.equal(friendNotifs[0].type, 'friend-score');
  assert.equal(friendNotifs[0].payload.userName, 'Heidi');
  assert.equal(friendNotifs[0].payload.correctCount, 1);
  assert.equal(friendNotifs[0].payload.totalQuestions, 3);

  // The actor is not notified about their own result.
  assert.equal(container.repos.notifications.listForUser(actor.id).length, 0);
});

test('submitting with no friends notifies nobody (no error)', async () => {
  const lonelyCookie = await signupAndGetCookie('Jill', 'jill@example.com');
  const take = await request(app.server as Server)
    .get('/tests/mini/take')
    .set('Cookie', lonelyCookie)
    .expect(200);
  const attemptId = attemptIdFromTakePage(take.text);

  const res = await request(app.server as Server)
    .post(`/tests/${attemptId}/submit`)
    .type('form')
    .set('Cookie', lonelyCookie)
    .send({ answers: JSON.stringify([{ questionId: 'q0', chosenIndex: 1, timeMs: 1000 }]) })
    .expect(302);
  assert.match(res.headers.location, new RegExp(`/tests/${attemptId}/result`));
  const jill = container.repos.users.findByEmail('jill@example.com')!;
  assert.equal(container.repos.notifications.listForUser(jill.id).length, 0);
});