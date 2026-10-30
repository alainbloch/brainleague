import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { buildApp } from '../../src/app.js';
import { createTestContainer, tokenFromUrl, type TestContainer } from '../helpers.js';

let app: FastifyInstance;
let container: TestContainer;

before(async () => {
  ({ container } = createTestContainer());
  app = await buildApp({ container });
  await app.ready();
});

after(async () => {
  await app.close();
  container.close();
});

test('GET /health returns ok', async () => {
  const res = await request(app.server as Server)
    .get('/health')
    .expect(200);
  assert.equal(res.body.status, 'ok');
});

test('GET / shows the landing page', async () => {
  const res = await request(app.server as Server)
    .get('/')
    .expect(200);
  assert.match(res.text, /Brain League/);
});

test('GET /login renders the form', async () => {
  const res = await request(app.server as Server)
    .get('/login')
    .expect(200);
  assert.match(res.text, /Sign in/);
  assert.match(res.text, /name="email"/);
  assert.match(res.text, /name="password"/);
});

test('POST /register creates an account and emails a verification link', async () => {
  const res = await request(app.server as Server)
    .post('/register')
    .type('form')
    .send({ name: 'Bob', email: 'bob@example.com', password: 'Correct-Horse-42!' })
    .expect(200);
  assert.match(res.text, /verification email has been sent/);

  const mail = container.mailer.sent.find((m) => m.email === 'bob@example.com');
  assert.ok(mail, 'verification email sent');
  assert.match(mail.url, /\/auth\/verify\?token=/);
});

test('POST /register rejects an invalid email and re-renders with error', async () => {
  const res = await request(app.server as Server)
    .post('/register')
    .type('form')
    .send({ name: 'Bad', email: 'not-an-email', password: 'Correct-Horse-42!' })
    .expect(400);
  assert.match(res.text, /valid email/);
});

test('full journey: register -> verify -> login -> protected page -> logout', async () => {
  const email = 'jane@example.com';
  await request(app.server as Server)
    .post('/register')
    .type('form')
    .send({ name: 'Jane', email, password: 'Correct-Horse-42!' })
    .expect(200);
  const mail = container.mailer.sent.find((m) => m.email === email);
  assert.ok(mail, `mail sent to ${email}`);
  const token = tokenFromUrl(mail.url);

  // Verify via magic link.
  const verifyRes = await request(app.server as Server).get(
    `/auth/verify?token=${token}&email=${encodeURIComponent(email)}`,
  );
  assert.equal(verifyRes.status, 302, 'redirects to account after verify');
  const setCookie = verifyRes.headers['set-cookie'];
  assert.ok(setCookie?.[0]?.includes('usertest_session'), 'session cookie set');
  const cookie = setCookie[0].split(';')[0];

  // Protected page with session cookie.
  const accountRes = await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(accountRes.text, new RegExp(email));

  // Logout clears session.
  const logoutRes = await request(app.server as Server)
    .get('/logout')
    .set('Cookie', cookie)
    .expect(302);
  assert.match(logoutRes.headers['set-cookie'][0], /Max-Age=0/, 'cookie cleared');

  // Resetting login page shows sign-in (anonymous).
  const loginAfter = await request(app.server as Server)
    .get('/login')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(loginAfter.text, /Sign in/);
});

test('protected page redirects anonymous visitors to /login', async () => {
  const res = await request(app.server as Server)
    .get('/account')
    .expect(302);
  assert.match(res.headers.location, /\/login/);
});

test('login then account access, wrong password keeps you out', async () => {
  const email = 'otto@example.com';
  await request(app.server as Server)
    .post('/register')
    .type('form')
    .send({ name: 'Otto', email, password: 'Correct-Horse-42!' })
    .expect(200);
  const mail = container.mailer.sent.find((m) => m.email === email);
  assert.ok(mail, `mail sent to ${email}`);
  await request(app.server as Server)
    .get(`/auth/verify?token=${tokenFromUrl(mail.url)}&email=${encodeURIComponent(email)}`)
    .expect(302);

  const bad = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email, password: 'Wrong-1' })
    .expect(401);
  assert.match(bad.text, /Email or password/);

  const good = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email, password: 'Correct-Horse-42!' });
  assert.equal(good.status, 302);
  const cookie = good.headers['set-cookie'][0].split(';')[0];
  const res = await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(res.text, new RegExp(email));
});

test('password reset flow revokes the old session', async () => {
  const email = 'reset@example.com';
  await request(app.server as Server)
    .post('/register')
    .type('form')
    .send({ name: 'Res', email, password: 'Correct-Horse-42!' })
    .expect(200);
  const verifyMail = container.mailer.sent.find((m) => m.email === email);
  assert.ok(verifyMail, `mail sent to ${email}`);
  await request(app.server as Server)
    .get(`/auth/verify?token=${tokenFromUrl(verifyMail.url)}&email=${encodeURIComponent(email)}`)
    .expect(302);

  // Sign in and grab the session cookie.
  const login = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email, password: 'Correct-Horse-42!' });
  const oldCookie = login.headers['set-cookie'][0].split(';')[0];

  // Request reset.
  await request(app.server as Server)
    .post('/auth/forgot')
    .type('form')
    .send({ email })
    .expect(200);
  const resetMail = container.mailer.sent.find(
    (m) => m.email === email && m.subject.includes('Reset'),
  );
  assert.ok(resetMail, 'reset email sent');
  const resetToken = tokenFromUrl(resetMail.url);

  // Complete reset.
  const resetRes = await request(app.server as Server)
    .post('/auth/reset')
    .type('form')
    .send({ token: resetToken, email, password: 'New-Pass-987!', passwordConfirm: 'New-Pass-987!' })
    .expect(200);
  assert.match(resetRes.text, /Password updated/);

  // Old session is gone.
  await request(app.server as Server)
    .get('/account')
    .set('Cookie', oldCookie)
    .expect(302);
});
