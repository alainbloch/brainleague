import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContainer } from '../helpers.js';

const PASSWORD = 'Correct-Horse-42!';

function makeUsers(container, emails) {
  return emails.map((email) =>
    container.services.identity.createVerifiedUser({
      name: email.split('@')[0],
      email,
      password: PASSWORD,
    }),
  );
}

test('friend request lifecycle: none -> outgoing -> accepted -> friends', async () => {
  const { container } = createTestContainer();
  const [a, b] = makeUsers(container, ['a@example.com', 'b@example.com']);
  const { friendships } = container.services;

  assert.equal(friendships.statusBetween(a.id, b.id), 'none');
  await friendships.request(a.id, b.id);
  assert.equal(friendships.statusBetween(a.id, b.id), 'outgoing');
  assert.equal(friendships.statusBetween(b.id, a.id), 'incoming');

  await friendships.accept(b.id, a.id);
  assert.equal(friendships.statusBetween(a.id, b.id), 'friends');
  assert.deepEqual(friendships.friendIds(a.id), [b.id]);

  // Idempotent: requesting again when already friends is a no-op.
  const again = await friendships.request(a.id, b.id);
  assert.equal(again.status, 'unchanged');
  container.close();
});

test('reverse request flips to accepted (both asked)', async () => {
  const { container } = createTestContainer();
  const [a, b] = makeUsers(container, ['a@example.com', 'b@example.com']);
  const { friendships } = container.services;

  await friendships.request(a.id, b.id); // a -> b
  const result = await friendships.request(b.id, a.id); // b flips it
  assert.equal(result.status, 'accepted');
  assert.equal(friendships.statusBetween(a.id, b.id), 'friends');
  container.close();
});

test('cannot friend yourself or a missing user', async () => {
  const { container } = createTestContainer();
  const [a] = makeUsers(container, ['a@example.com']);
  const { friendships } = container.services;
  await assert.rejects(friendships.request(a.id, a.id), /cannot friend yourself/);
  await assert.rejects(friendships.request(a.id, 'missing'), /User not found/);
  container.close();
});

test('remove unfriends/cancels/declines and rejects disconnected pairs', async () => {
  const { container } = createTestContainer();
  const [a, b, c] = makeUsers(container, ['a@example.com', 'b@example.com', 'c@example.com']);
  const { friendships } = container.services;

  await friendships.request(a.id, b.id);
  await friendships.accept(b.id, a.id);
  assert.equal(friendships.remove(a.id, b.id).status, 'none');
  assert.equal(friendships.statusBetween(a.id, b.id), 'none');

  await friendships.request(a.id, c.id);
  assert.equal(friendships.remove(a.id, c.id).status, 'none', 'cancel outgoing');

  assert.throws(() => friendships.remove(a.id, c.id), /Not connected/);
  container.close();
});

test('notifications: emitted on request and accept, read-state tracked', async () => {
  const { container } = createTestContainer();
  const [a, b] = makeUsers(container, ['a@example.com', 'b@example.com']);
  const { friendships, notifications } = container.services;

  await friendships.request(a.id, b.id);
  let items = notifications.listForUser(b.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'friend-request');
  assert.equal(items[0].payload.requesterId, a.id);
  assert.equal(notifications.unreadCount(b.id), 1);

  await friendships.accept(b.id, a.id);
  items = notifications.listForUser(a.id);
  assert.equal(items[0].type, 'friend-accepted');
  assert.equal(notifications.unreadCount(a.id), 1);

  assert.equal(notifications.markAllRead(a.id), 1);
  assert.equal(notifications.unreadCount(a.id), 0);
  container.close();
});

test('directory: listUsers pages and hides sensitive fields', async () => {
  const { container } = createTestContainer();
  makeUsers(container, ['a@example.com', 'b@example.com', 'c@example.com']);
  const { directory } = container.services;

  const page1 = directory.listUsers({ page: 1, perPage: 2 });
  assert.equal(page1.users.length, 2);
  assert.equal(page1.total, 3);
  assert.equal(page1.pages, 2);
  const page2 = directory.listUsers({ page: 2, perPage: 2 });
  assert.equal(page2.users.length, 1);

  const publicUser = page1.users[0];
  assert.equal(publicUser.passwordHash, undefined);
  assert.equal(publicUser.emailVerified, true);
  const profile = directory.getProfile(publicUser.id, publicUser.id);
  assert.equal(profile.relationship, 'self');
  container.close();
});

test('admin: promote/demote with last-admin and self-edit guards', async () => {
  const { container } = createTestContainer();
  const [a, b, c] = makeUsers(container, [
    'admin@example.com',
    'user@example.com',
    'third@example.com',
  ]);
  const { admin } = container.services;
  const { users } = container.repos;
  // Make `a` an admin up front (the acting admin).
  users.changeRole(a.id, 'admin', Date.now());

  const promoted = admin.changeRole(a.id, b.id, 'admin');
  assert.equal(promoted.role, 'admin');
  assert.throws(() => admin.changeRole(a.id, a.id, 'user'), /own role/);

  // Demote b: allowed while `a` remains an admin.
  assert.equal(admin.changeRole(a.id, b.id, 'user').role, 'user');

  // Make b the ONLY admin; then any edit targeting b is refused as the last
  // administrator (mirrors service-level guard; real access is role-gated by
  // HTTP middleware).
  users.changeRole(b.id, 'admin', Date.now());
  users.changeRole(a.id, 'user', Date.now());
  assert.throws(() => admin.changeRole(a.id, b.id, 'user'), /last administrator/);
  assert.throws(() => admin.deleteUser(a.id, b.id), /last administrator/);

  // A second admin makes deletion legal.
  users.changeRole(c.id, 'admin', Date.now());
  assert.equal(admin.deleteUser(a.id, b.id), true);
  assert.throws(() => admin.deleteUser(a.id, a.id), /own account/);
  container.close();
});

test('admin stats include pending friend requests', async () => {
  const { container } = createTestContainer();
  const [a, b] = makeUsers(container, ['a@example.com', 'b@example.com']);
  await container.services.friendships.request(a.id, b.id);
  const stats = container.services.admin.stats();
  assert.equal(stats.pendingFriendRequests, 1);
  container.close();
});

test('admin broadcast sends a system notification to every user', async () => {
  const { container } = createTestContainer();
  const [admin, a, b, c] = makeUsers(container, [
    'admin@example.com',
    'a@example.com',
    'b@example.com',
    'c@example.com',
  ]);
  const { admin: adminSvc, notifications } = container.services;

  const result = adminSvc.broadcast(admin.id, 'Maintenance tonight at 10pm.');
  assert.equal(result.recipients, 4, 'one row per account');

  for (const user of [admin, a, b, c]) {
    const items = notifications.listForUser(user.id);
    const broadcast = items.find((n) => n.type === 'system');
    assert.ok(broadcast, `${user.email} received the broadcast`);
    assert.equal(broadcast.payload.message, 'Maintenance tonight at 10pm.');
    assert.equal(notifications.unreadCount(user.id), 1, 'broadcast starts unread');
  }

  assert.throws(() => adminSvc.broadcast(admin.id, '   '), /Message is required/);
  assert.throws(() => adminSvc.broadcast(admin.id, 'x'.repeat(2001)), /2000 characters/);
  container.close();
});

test('admin can edit a user name and email', async () => {
  const { container } = createTestContainer();
  const [, b] = makeUsers(container, ['a@example.com', 'b@example.com']);
  const { admin, identity } = container.services;

  // Establish a session BEFORE the edit; it must be revoked by the change.
  const session = identity.createSession(b.id);
  assert.ok(identity.currentUser(session.token), 'session valid before edit');

  const updated = admin.updateUser(b.id, { name: 'Renamed User', email: 'renamed@example.com' });
  assert.equal(updated.name, 'Renamed User');
  assert.equal(updated.email, 'renamed@example.com');

  assert.equal(identity.currentUser(session.token), null, 'sessions revoked after email edit');

  // Login works with the new email and fails with the old one.
  const oldLogin = await identity.login(
    { email: 'b@example.com', password: PASSWORD },
    { ip: '1.2.3.4' },
  );
  assert.equal(oldLogin.ok, false);
  const newLogin = await identity.login(
    { email: 'renamed@example.com', password: PASSWORD },
    { ip: '1.2.3.4' },
  );
  assert.equal(newLogin.ok, true);

  // Validation: missing name, bad email, duplicate email.
  assert.throws(
    () => admin.updateUser(b.id, { name: '  ', email: 'renamed@example.com' }),
    /Name is required/,
  );
  assert.throws(() => admin.updateUser(b.id, { name: 'X', email: 'nope' }), /valid email/);
  assert.throws(
    () => admin.updateUser(b.id, { name: 'X', email: 'a@example.com' }),
    /not available/,
  );
  assert.throws(
    () => admin.updateUser('missing', { name: 'X', email: 'x@example.com' }),
    /User not found/,
  );
  container.close();
});

test('admin can change a user password; blank keeps the current one', async () => {
  const { container } = createTestContainer();
  const [, b] = makeUsers(container, ['a@example.com', 'b@example.com']);
  const { admin, identity } = container.services;

  // Establish a session BEFORE the change; it must be revoked.
  const session = identity.createSession(b.id);
  assert.ok(identity.currentUser(session.token), 'session valid before edit');

  const updated = admin.updateUser(b.id, {
    name: 'B Name',
    email: 'b@example.com',
    password: 'New-Admin-987!',
  });
  assert.ok(updated, 'edit succeeded');

  // Old password fails; new password works.
  const oldLogin = await identity.login(
    { email: 'b@example.com', password: PASSWORD },
    { ip: '1.2.3.4' },
  );
  assert.equal(oldLogin.ok, false);
  const newLogin = await identity.login(
    { email: 'b@example.com', password: 'New-Admin-987!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(newLogin.ok, true);

  // Sessions were revoked.
  assert.equal(identity.currentUser(session.token), null, 'sessions revoked after password change');

  // Blank password leaves the password untouched.
  admin.updateUser(b.id, { name: 'B Name', email: 'b@example.com', password: '' });
  const stillNew = await identity.login(
    { email: 'b@example.com', password: 'New-Admin-987!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(stillNew.ok, true, 'blank password does not change the hash');

  // Too-short password rejected without applying name changes.
  assert.throws(
    () =>
      admin.updateUser(b.id, {
        name: 'Should Not Apply',
        email: 'b@example.com',
        password: 'short',
      }),
    /8–128 characters/,
  );
  assert.equal(container.repos.users.findById(b.id).name, 'B Name');
  container.close();
});
