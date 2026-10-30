import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { buildApp } from '../../src/app.js';
import { createTestContainer, tokenFromUrl, type TestContainer } from '../helpers.js';
import { AvatarStorage } from '../../src/services/avatarStorage.js';

let app: FastifyInstance;
let container: TestContainer;
let uploadDir: string;

async function signUpAndVerify(email: string, { name = 'Ula' } = {}): Promise<string> {
  await request(app.server as Server)
    .post('/register')
    .type('form')
    .send({ name, email, password: 'Correct-Horse-42!' })
    .expect(200);
  const mail = container.mailer.sent.find((m) => m.email === email);
  assert.ok(mail, `verification email sent to ${email}`);
  const res = await request(app.server as Server).get(
    `/auth/verify?token=${tokenFromUrl(mail.url)}&email=${encodeURIComponent(email)}`,
  );
  return res.headers['set-cookie'][0].split(';')[0];
}

before(async () => {
  uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usertest-settings-'));
  const { container: c, mailer } = createTestContainer({
    avatarStorage: new AvatarStorage({ uploadDir }),
  });
  container = c;
  container.mailer = mailer;
  // Static serving reads config.uploadDir, so point it at the same temp dir.
  container.config.uploadDir = uploadDir;
  app = await buildApp({ container });
  await app.ready();
  await container.services.avatarStorage.init();
});

after(async () => {
  await app.close();
  container.close();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

test('GET /settings requires authentication', async () => {
  await request(app.server as Server)
    .get('/settings')
    .expect(302);
});

test('update name via the profile form', async () => {
  const cookie = await signUpAndVerify('name@example.com');
  await request(app.server as Server)
    .post('/settings/profile')
    .set('Cookie', cookie)
    .type('form')
    .send({ name: 'Ula Nova' })
    .expect(302)
    .expect('Location', '/settings?notice=name-updated');

  const res = await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(res.text, /Ula Nova/);
});

test('profile form rejects an empty name', async () => {
  const cookie = await signUpAndVerify('noname@example.com');
  const res = await request(app.server as Server)
    .post('/settings/profile')
    .set('Cookie', cookie)
    .type('form')
    .send({ name: '   ' })
    .expect(200);
  assert.match(res.text, /Name is required/);
});

test('avatar upload persists the file and serves it back', async () => {
  const cookie = await signUpAndVerify('avatar@example.com');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  await request(app.server as Server)
    .post('/settings/avatar')
    .set('Cookie', cookie)
    .attach('avatar', png, { filename: 'me.png', contentType: 'image/png' })
    .expect(302)
    .expect('Location', '/settings?notice=avatar-updated');

  const user = container.repos.users.findByEmail('avatar@example.com');
  assert.ok(user, 'user exists');
  assert.match(user.avatarPath!, /^avatars\/[a-f0-9-]+\.png$/);

  const serve = await request(app.server as Server).get(`/uploads/${user.avatarPath}`);
  assert.equal(serve.status, 200);
  assert.deepEqual(serve.body, png);

  // The avatar is displayed on the settings page.
  const settings = await request(app.server as Server)
    .get('/settings')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(settings.text, new RegExp(user.avatarPath!));
});

test('avatar upload rejects disallowed file types', async () => {
  const cookie = await signUpAndVerify('badavatar@example.com');
  const res = await request(app.server as Server)
    .post('/settings/avatar')
    .set('Cookie', cookie)
    .attach('avatar', Buffer.from('plain text'), {
      filename: 'notes.txt',
      contentType: 'text/plain',
    })
    .expect(200);
  assert.match(res.text, /JPEG, PNG, WebP, or GIF/);
});

test('email change flow: link to new address, confirm, old session revoked', async () => {
  const cookie = await signUpAndVerify('old@example.com');

  await request(app.server as Server)
    .post('/settings/email')
    .set('Cookie', cookie)
    .type('form')
    .send({ email: 'fresh@example.com', currentPassword: 'Correct-Horse-42!' })
    .expect(302)
    .expect('Location', '/settings?notice=email-sent');

  const mail = container.mailer.sent.find((m) => m.email === 'fresh@example.com');
  assert.ok(mail, 'confirmation emailed to the NEW address');
  assert.match(mail.url, /\/settings\/confirm-email\?token=/);

  // Confirm from a fresh (cookie-less) browser.
  const confirm = await request(app.server as Server).get(
    `${new URL(mail.url).pathname}${new URL(mail.url).search}`,
  );
  assert.equal(confirm.status, 200);
  assert.match(confirm.text, /Email confirmed/);
  assert.ok(confirm.headers['set-cookie'][0].includes('usertest_session'), 'new session issued');

  // Old session no longer works.
  await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(302);
  // New email + same password works.
  const login = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'fresh@example.com', password: 'Correct-Horse-42!' })
    .expect(302);
  assert.ok(login.headers['set-cookie'][0].includes('usertest_session'));
});

test('email change requires the current password', async () => {
  const cookie = await signUpAndVerify('pwcheck@example.com');
  const res = await request(app.server as Server)
    .post('/settings/email')
    .set('Cookie', cookie)
    .type('form')
    .send({ email: 'other@example.com', currentPassword: 'wrong' })
    .expect(200);
  assert.match(res.text, /current password is incorrect/);
});

test('password change flow revokes other sessions and issues a fresh one', async () => {
  const cookie = await signUpAndVerify('pass@example.com');

  const res = await request(app.server as Server)
    .post('/settings/password')
    .set('Cookie', cookie)
    .type('form')
    .send({
      currentPassword: 'Correct-Horse-42!',
      newPassword: 'New-Pass-789!',
      passwordConfirm: 'New-Pass-789!',
    })
    .expect(302)
    .expect('Location', '/settings?notice=password-updated');

  const newCookie = res.headers['set-cookie'][0].split(';')[0];
  assert.ok(newCookie.startsWith('usertest_session'));

  // Old cookie revoked; new cookie works.
  await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(302);
  await request(app.server as Server)
    .get('/account')
    .set('Cookie', newCookie)
    .expect(200);

  // Old password fails, new password works.
  await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'pass@example.com', password: 'Correct-Horse-42!' })
    .expect(401);
  await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'pass@example.com', password: 'New-Pass-789!' })
    .expect(302);
});
