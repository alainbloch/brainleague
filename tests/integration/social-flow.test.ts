import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import { buildApp } from '../../src/app.js';
import { createTestContainer, tokenFromUrl, type TestContainer } from '../helpers.js';

let app: FastifyInstance;
let container: TestContainer;

async function signUpAndVerify(
  email: string,
  password = 'Correct-Horse-42!',
  { name }: { name?: string } = {},
): Promise<string> {
  await request(app.server as Server)
    .post('/register')
    .type('form')
    .send({ name: name || email.split('@')[0], email, password })
    .expect(200);
  const mail = container.mailer.sent.find((m) => m.email === email);
  assert.ok(mail, `verification email sent to ${email}`);
  const res = await request(app.server as Server).get(
    `/auth/verify?token=${tokenFromUrl(mail.url)}&email=${encodeURIComponent(email)}`,
  );
  return res.headers['set-cookie'][0].split(';')[0];
}

/** Look up a user that must exist; fails the test otherwise. */
function mustFind(email: string) {
  const user = container.repos.users.findByEmail(email);
  assert.ok(user, `expected ${email} to exist`);
  return user!;
}

before(async () => {
  ({ container } = createTestContainer());
  app = await buildApp({ container });
  await app.ready();
});

after(async () => {
  await app.close();
  container.close();
});

test('users directory lists accounts and requires auth', async () => {
  await request(app.server as Server)
    .get('/users')
    .expect(302);
  const cookie = await signUpAndVerify('alice@example.com');
  const res = await request(app.server as Server)
    .get('/users')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(res.text, /alice@example\.com/);
});

test('profile shows relationship states through the full friend journey', async () => {
  const cookieA = await signUpAndVerify('alice2@example.com');
  const cookieB = await signUpAndVerify('bob2@example.com');
  const bob = mustFind('bob2@example.com');

  // Alice views Bob: no relationship yet.
  let res = await request(app.server as Server)
    .get(`/users/${bob.id}`)
    .set('Cookie', cookieA)
    .expect(200);
  assert.match(res.text, /Add friend/);

  // Alice sends a request.
  await request(app.server as Server)
    .post(`/users/${bob.id}/friend`)
    .set('Cookie', cookieA)
    .expect(302);
  res = await request(app.server as Server)
    .get(`/users/${bob.id}`)
    .set('Cookie', cookieA)
    .expect(200);
  assert.match(res.text, /Request sent/);

  // Bob sees the incoming request and accepts (Bob's profile shows state).
  const alice = mustFind('alice2@example.com');
  res = await request(app.server as Server)
    .get(`/users/${alice.id}`)
    .set('Cookie', cookieB)
    .expect(200);
  assert.match(res.text, /Requested to be friends/);
  await request(app.server as Server)
    .post(`/users/${alice.id}/accept`)
    .set('Cookie', cookieB)
    .expect(302);

  // Both see friends now.
  res = await request(app.server as Server)
    .get(`/users/${bob.id}`)
    .set('Cookie', cookieA)
    .expect(200);
  assert.match(res.text, /Friends/);

  // Unfriend returns to none.
  await request(app.server as Server)
    .post(`/users/${bob.id}/unfriend`)
    .set('Cookie', cookieA)
    .expect(302);
  res = await request(app.server as Server)
    .get(`/users/${bob.id}`)
    .set('Cookie', cookieA)
    .expect(200);
  assert.match(res.text, /Add friend/);
});

test('notifications inbox shows request events and mark-all-read', async () => {
  const cookieA = await signUpAndVerify('carol@example.com');
  const cookieB = await signUpAndVerify('dave@example.com');
  const dave = mustFind('dave@example.com');

  await request(app.server as Server)
    .post(`/users/${dave.id}/friend`)
    .set('Cookie', cookieA)
    .expect(302);

  const inbox = await request(app.server as Server)
    .get('/notifications')
    .set('Cookie', cookieB)
    .expect(200);
  assert.match(inbox.text, /sent you a friend request/);
  assert.match(inbox.text, /carol/i);

  await request(app.server as Server)
    .post('/notifications/read')
    .set('Cookie', cookieB)
    .expect(302);
  const after = await request(app.server as Server)
    .get('/notifications')
    .set('Cookie', cookieB)
    .expect(200);
  assert.doesNotMatch(after.text, /aria-label="Unread"/);
  assert.equal(container.services.notifications.unreadCount(dave.id), 0);
});

test('admin routes are role-gated', async () => {
  const cookie = await signUpAndVerify('user@example.com');
  await request(app.server as Server)
    .get('/admin')
    .set('Cookie', cookie)
    .expect(403);

  // Promote the user to admin via the repo, then the admin pages open.
  const user = mustFind('user@example.com');
  container.repos.users.changeRole(user.id, 'admin', Date.now());
  const res = await request(app.server as Server)
    .get('/admin')
    .set('Cookie', cookie)
    .expect(200);
  assert.match(res.text, /Manage the accounts/);
});

test('admin can promote, demote, and delete users through the UI', async () => {
  // Admin account.
  container.services.identity.createVerifiedUser({
    name: 'Admin',
    email: 'admin2@example.com',
    password: 'Admin-Pass-123!',
    role: 'admin',
  });
  const adminLogin = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'admin2@example.com', password: 'Admin-Pass-123!' });
  const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];

  // Target user.
  const cookie = await signUpAndVerify('target@example.com');
  const target = mustFind('target@example.com');

  // Promote.
  await request(app.server as Server)
    .post(`/admin/users/${target.id}/role`)
    .set('Cookie', adminCookie)
    .type('form')
    .send({ role: 'admin' })
    .expect(302);
  assert.equal(container.repos.users.findById(target.id).role, 'admin');

  // Promote page shows the user once.
  let list = await request(app.server as Server)
    .get('/admin/users?q=target@example.com')
    .set('Cookie', adminCookie)
    .expect(200);
  assert.match(list.text, /target@example\.com/);

  // Demote back.
  await request(app.server as Server)
    .post(`/admin/users/${target.id}/role`)
    .set('Cookie', adminCookie)
    .type('form')
    .send({ role: 'user' })
    .expect(302);
  assert.equal(container.repos.users.findById(target.id).role, 'user');

  // Delete the target; their account is gone (cascades session/tokens).
  await request(app.server as Server)
    .post(`/admin/users/${target.id}/delete`)
    .set('Cookie', adminCookie)
    .expect(302);
  assert.equal(container.repos.users.findById(target.id), null);
  // The deleted account is gone from the table (the search box shows the query
  // string, so assert on the table's empty state instead of the raw text).
  list = await request(app.server as Server)
    .get('/admin/users?q=target@example.com')
    .set('Cookie', adminCookie)
    .expect(200);
  assert.match(list.text, /No accounts match this search/);

  // The deleted account's old cookie no longer resolves.
  await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(302);
});

test('admin cannot delete own account from the UI', async () => {
  const adminUser = container.services.identity.createVerifiedUser({
    name: 'Solo',
    email: 'solo-admin@example.com',
    password: 'Admin-Pass-123!',
    role: 'admin',
  });
  const login = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'solo-admin@example.com', password: 'Admin-Pass-123!' });
  const cookie = login.headers['set-cookie'][0].split(';')[0];

  const res = await request(app.server as Server)
    .post(`/admin/users/${adminUser.id}/delete`)
    .set('Cookie', cookie)
    .expect(200);
  assert.match(res.text, /own account/);
  assert.ok(container.repos.users.findById(adminUser.id), 'admin still exists');
});

test('admin broadcast reaches every user inbox over HTTP', async () => {
  // Admin + a couple of regular users.
  const adminLogin = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'admin2@example.com', password: 'Admin-Pass-123!' });
  const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];
  const cookieA = await signUpAndVerify('broadcast-a@example.com');
  await signUpAndVerify('broadcast-b@example.com');

  // Non-admin is denied the broadcast page.
  await request(app.server as Server)
    .get('/admin/broadcast')
    .set('Cookie', cookieA)
    .expect(403);

  // Page renders for admin.
  const page = await request(app.server as Server)
    .get('/admin/broadcast')
    .set('Cookie', adminCookie)
    .expect(200);
  assert.match(page.text, /Broadcast notification/);

  // Empty message is rejected.
  const empty = await request(app.server as Server)
    .post('/admin/broadcast')
    .set('Cookie', adminCookie)
    .type('form')
    .send({ message: '   ' })
    .expect(200);
  assert.match(empty.text, /Message is required/);

  // Send a broadcast; success notice shows the recipient count.
  const sent = await request(app.server as Server)
    .post('/admin/broadcast')
    .set('Cookie', adminCookie)
    .type('form')
    .send({ message: 'Scheduled maintenance tonight at 10pm UTC.' })
    .expect(200);
  assert.match(sent.text, /Notification sent to \d+ users/);

  // A regular user sees the broadcast unread in their inbox.
  const inbox = await request(app.server as Server)
    .get('/notifications')
    .set('Cookie', cookieA)
    .expect(200);
  assert.match(inbox.text, /Scheduled maintenance tonight at 10pm UTC\./);
  assert.match(inbox.text, /aria-label="Unread"/);
  const b = mustFind('broadcast-b@example.com');
  assert.equal(container.services.notifications.unreadCount(b.id), 1);
});

test('admin can edit a user through the UI, and edits are validated', async () => {
  const adminLogin = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'admin2@example.com', password: 'Admin-Pass-123!' });
  const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];

  const cookie = await signUpAndVerify('editable@example.com');
  const target = mustFind('editable@example.com');

  // Non-admin is denied the edit page.
  await request(app.server as Server)
    .get(`/admin/users/${target.id}/edit`)
    .set('Cookie', cookie)
    .expect(403);

  // Page renders with current values.
  const page = await request(app.server as Server)
    .get(`/admin/users/${target.id}/edit`)
    .set('Cookie', adminCookie)
    .expect(200);
  assert.match(page.text, /Edit user/);
  assert.match(page.text, /editable@example\.com/);

  // Invalid email keeps the form on the page with an error.
  const bad = await request(app.server as Server)
    .post(`/admin/users/${target.id}/edit`)
    .set('Cookie', adminCookie)
    .type('form')
    .send({ name: 'Renamed', email: 'nope' })
    .expect(200);
  assert.match(bad.text, /valid email/);

  // Valid edit updates name + email and redirects with a notice.
  const good = await request(app.server as Server)
    .post(`/admin/users/${target.id}/edit`)
    .set('Cookie', adminCookie)
    .type('form')
    .send({ name: 'Renamed Person', email: 'renamed@example.com' })
    .expect(302);
  assert.match(good.headers.location, /notice=updated/);
  const updated = container.repos.users.findById(target.id);
  assert.equal(updated.name, 'Renamed Person');
  assert.equal(updated.email, 'renamed@example.com');

  // The old email cookie was revoked by the email change.
  await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(302);

  // The success notice appears on the users list.
  const list = await request(app.server as Server)
    .get('/admin/users?q=Renamed&notice=updated')
    .set('Cookie', adminCookie)
    .expect(200);
  assert.match(list.text, /The user was updated/);
});

test('nav icons render as real SVGs, not escaped markup (nav regression)', async () => {
  const cookie = await signUpAndVerify('nav-icons@example.com');
  const res = await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(200);
  // The bell symbol and user-chip chevron must be actual <svg> elements.
  assert.ok(/(<svg\b)/.test(res.text), 'nav contains real SVG icons');
  assert.doesNotMatch(res.text, /&lt;svg/, 'no escaped SVG markup leaks into the page');
});

test('admin can change a user password through the edit UI', async () => {
  const adminLogin = await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'admin2@example.com', password: 'Admin-Pass-123!' });
  const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];

  const cookie = await signUpAndVerify('pwedit@example.com');
  const target = mustFind('pwedit@example.com');

  // The edit page offers a password field.
  const page = await request(app.server as Server)
    .get(`/admin/users/${target.id}/edit`)
    .set('Cookie', adminCookie)
    .expect(200);
  assert.match(page.text, /New password/);

  // Change the password.
  await request(app.server as Server)
    .post(`/admin/users/${target.id}/edit`)
    .set('Cookie', adminCookie)
    .type('form')
    .send({ name: 'Pw Edit', email: 'pwedit@example.com', password: 'Admin-Set-456!' })
    .expect(302);

  // Old password rejected, new password works.
  await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'pwedit@example.com', password: 'Correct-Horse-42!' })
    .expect(401);
  await request(app.server as Server)
    .post('/login')
    .type('form')
    .send({ email: 'pwedit@example.com', password: 'Admin-Set-456!' })
    .expect(302);

  // The user's pre-change session was revoked.
  await request(app.server as Server)
    .get('/account')
    .set('Cookie', cookie)
    .expect(302);
});
