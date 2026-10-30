import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { buildApp } from '../../src/app.js';
import { createTestContainer, tokenFromUrl, type TestContainer } from '../helpers.js';

let app: FastifyInstance;
let container: TestContainer;

function seed() {
  const now = Date.now();
  container.db.prepare("INSERT INTO question_categories (slug, name) VALUES ('analogies', 'Analogies')").run();
  container.db.prepare(
    `INSERT INTO test_types (id, slug, name, publisher, question_count, duration_seconds, no_going_back, created_at)
     VALUES ('t1', 'pi-cognitive-assessment', 'PI Cognitive Assessment', 'Predictive Index', 2, 720, 1, ?)`,
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

before(async () => {
  ({ container } = createTestContainer());
  seed();
  app = await buildApp({ container });
  await app.ready();
});
after(async () => { await app.close(); container.close(); });

test('home splash is public, describes the pitch, and links to the first test', async () => {
  const res = await request(app.server as Server).get('/').expect(200);
  assert.match(res.text, /quickest mind in your crew/);
  assert.match(res.text, /pi-cognitive-assessment/);
  assert.match(res.text, /Take the PI Cognitive Assessment/);
  assert.match(res.text, /\/tests\/pi-cognitive-assessment\/take/);
  assert.match(res.text, /Leaderboard/);
});

test('nav shows Tests and Leaderboards; leaderboards index lists global + friends links', async () => {
  const cookie = await signupCookie('Nadia', 'nadia@example.com');
  const home = await request(app.server as Server).get('/').set('Cookie', cookie).expect(200);
  assert.match(home.text, />Tests</);
  assert.match(home.text, /Leaderboards</);
  const lb = await request(app.server as Server).get('/leaderboards').set('Cookie', cookie).expect(200);
  assert.match(lb.text, /PI Cognitive Assessment/);
  assert.match(lb.text, /\/tests\/pi-cognitive-assessment\/leaderboard/);
  assert.match(lb.text, /\/tests\/pi-cognitive-assessment\/leaderboard\/friends/);
});

test('catalog cards link to the test, global, and friend leaderboards', async () => {
  const cookie = await signupCookie('Omar', 'omar@example.com');
  const res = await request(app.server as Server).get('/tests').set('Cookie', cookie).expect(200);
  assert.match(res.text, /\/tests\/pi-cognitive-assessment\/take/);
  assert.match(res.text, /\/tests\/pi-cognitive-assessment\/leaderboard"/);
  assert.match(res.text, /\/tests\/pi-cognitive-assessment\/leaderboard\/friends/);
});

test('admin dashboard links to content management (tests, questions, categories, tutorials)', async () => {
  const adminCookie = await signupCookie('AdminNav', 'adminnav@example.com');
  container.db.prepare("UPDATE users SET role='admin' WHERE email='adminnav@example.com'").run();
  const res = await request(app.server as Server).get('/admin').set('Cookie', adminCookie).expect(200);
  for (const href of ['/admin/tests', '/admin/questions', '/admin/categories', '/admin/tutorials']) {
    assert.match(res.text, new RegExp(href));
  }
});

test('help (tutorials) page lists seeded categories and a category filter works', async () => {
  const cookie = await signupCookie('Penny', 'penny@example.com');
  // Seed a tutorial so the page is not empty.
  container.db.prepare(
    `INSERT OR IGNORE INTO tutorials (id, category_slug, slug, title, body, sort_order, created_at, updated_at)
     VALUES ('tg1', 'analogies', 'analogies-help', 'Analogies: spot the relationship', 'Look for part/whole.', 1, ?, ?)`,
  ).run(Date.now(), Date.now());

  const all = await request(app.server as Server).get('/tutorials').set('Cookie', cookie).expect(200);
  assert.match(all.text, /Tips & tutorials/);
  assert.match(all.text, /Analogies/);

  const filtered = await request(app.server as Server).get('/tutorials?category=analogies').set('Cookie', cookie).expect(200);
  assert.match(filtered.text, /Analogies: spot the relationship/);

  const detail = await request(app.server as Server).get('/tutorials/analogies-help').set('Cookie', cookie).expect(200);
  assert.match(detail.text, /Look for part\/whole/);
});