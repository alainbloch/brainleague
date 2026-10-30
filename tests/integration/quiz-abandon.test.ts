import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { buildApp } from '../../src/app.js';
import { createTestContainer, tokenFromUrl, type TestContainer } from '../helpers.js';

let app: FastifyInstance;
let container: TestContainer;
let clock = 1_000_000;

function seed() {
  const now = clock;
  container.db.prepare("INSERT INTO question_categories (slug, name) VALUES ('analogies', 'Analogies')").run();
  container.db.prepare(
    `INSERT INTO test_types (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
     VALUES ('t1', 'mini', 'Mini Test', 'Tester', 2, 60, 1, ?)`,
  ).run(now);
  const ins = container.db.prepare(
    `INSERT INTO questions (id, test_type_id, section_id, category_slug, prompt, choices_json, correct_index, explanation, est_seconds, position, created_at, updated_at)
     VALUES (?, 't1', NULL, 'analogies', ?, '["a","b","c"]', 1, 'e', 15, ?, ?, ?)`,
  );
  ins.run('q0', 'prompt0', 0, now, now);
  ins.run('q1', 'prompt1', 1, now, now);
}

async function signupCookie(name: string, email: string): Promise<string> {
  await request(app.server as Server).post('/register').type('form')
    .send({ name, email, password: 'Correct-Horse-42!' }).expect(200);
  const mail = container.mailer.sent.find((m) => m.email === email)!;
  const verify = await request(app.server as Server)
    .get(`/auth/verify?token=${tokenFromUrl(mail.url)}&email=${encodeURIComponent(email)}`);
  return verify.headers['set-cookie'][0].split(';')[0];
}

function attemptIdFromTakePage(html: string): string {
  const m = /var attemptId = "([a-f0-9-]+)";/.exec(html);
  if (!m) throw new Error('no attemptId');
  return m[1];
}

before(async () => {
  ({ container } = createTestContainer({ clock: () => clock }));
  seed();
  app = await buildApp({ container });
  await app.ready();
});
after(async () => { await app.close(); container.close(); });

test('progress endpoint persists answers; a fresh start after deadline auto-completes the old attempt', async () => {
  const cookie = await signupCookie('Zoe', 'zoe@example.com');
  const take = await request(app.server as Server).get('/tests/mini/take').set('Cookie', cookie).expect(200);
  const attemptId = attemptIdFromTakePage(take.text);

  // Answer one question correctly and persist progress live.
  const progress = await request(app.server as Server)
    .post(`/tests/${attemptId}/progress`)
    .type('form')
    .set('Cookie', cookie)
    .send({ answers: JSON.stringify([{ questionId: 'q0', chosenIndex: 1, timeMs: 5000 }]) });
  assert.equal(progress.status, 204);
  assert.equal(container.repos.attempts.answersFor(attemptId).length, 1);

  // Deadline passes (60s) while the user is away.
  clock += 61_000;

  // Returning to take the test auto-completes the abandoned attempt and gives a fresh one.
  const freshTake = await request(app.server as Server).get('/tests/mini/take').set('Cookie', cookie).expect(200);
  const freshAttemptId = attemptIdFromTakePage(freshTake.text);
  assert.notEqual(freshAttemptId, attemptId);

  const old = container.repos.attempts.findById(attemptId)!;
  assert.equal(old.status, 'timed_out');
  assert.equal(old.correctCount, 1); // the answer persisted before the deadline
  assert.equal(old.reachedCount, 1);
});

test('resuming within the deadline reuses the same attempt', async () => {
  clock = 2_000_000;
  const cookie = await signupCookie('Yara', 'yara@example.com');
  const take = await request(app.server as Server).get('/tests/mini/take').set('Cookie', cookie).expect(200);
  const attemptId = attemptIdFromTakePage(take.text);

  // 10s in, still well within 60s.
  clock += 10_000;
  const resume = await request(app.server as Server).get('/tests/mini/take').set('Cookie', cookie).expect(200);
  assert.equal(attemptIdFromTakePage(resume.text), attemptId);
});