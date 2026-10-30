import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContainer, tokenFromUrl } from '../helpers.js';

const PASSWORD = 'Correct-Horse-42!';

/** Create a verified, logged-in test user. Returns { container, mailer, user, token }. */
async function setupVerifiedUser({ email = 'alice@example.com' } = {}) {
  const { container } = createTestContainer();
  const { identity } = container.services;
  const user = identity.createVerifiedUser({ name: 'Alice', email, password: PASSWORD });
  const login = await identity.login({ email, password: PASSWORD }, { ip: '1.2.3.4' });
  const { token } = identity.createSession(login.userId);
  return {
    container,
    mailer: container.mailer,
    avatarStorage: container.avatarStorage,
    user,
    token,
  };
}

test('updateName validates and persists the display name', async () => {
  const { container, user } = await setupVerifiedUser();
  const updated = container.services.identity.updateName(user.id, '  Ada Lovelace  ');
  assert.equal(updated.name, 'Ada Lovelace');
  assert.equal(container.repos.users.findById(user.id).name, 'Ada Lovelace');
  assert.throws(() => container.services.identity.updateName(user.id, '   '), /Name is required/);
  container.close();
});

test('updateAvatar stores the file then removes the old one', async () => {
  const { container, avatarStorage, user } = await setupVerifiedUser();
  const photo = Buffer.from('fake-png-bytes');

  const first = await container.services.identity.updateAvatar(user.id, {
    buffer: photo,
    mimetype: 'image/png',
  });
  assert.ok(first.avatarPath.startsWith('avatars/'));
  const oldPath = first.avatarPath;

  const second = await container.services.identity.updateAvatar(user.id, {
    buffer: photo,
    mimetype: 'image/png',
  });
  assert.notEqual(second.avatarPath, oldPath, 'replacement gets a fresh path');
  assert.deepEqual(avatarStorage.removed, [oldPath], 'old file removed after write');
  container.close();
});

test('updateAvatar rejects disallowed mimetypes without touching the DB', async () => {
  const { container, user } = await setupVerifiedUser();
  await assert.rejects(
    container.services.identity.updateAvatar(user.id, {
      buffer: Buffer.from('x'),
      mimetype: 'text/plain',
    }),
    /JPEG, PNG, WebP, or GIF/,
  );
  assert.equal(container.repos.users.findById(user.id).avatarPath, null);
  container.close();
});

test('beginEmailChange requires the current password and rejects taken addresses', async () => {
  const { container, user } = await setupVerifiedUser();
  const { identity } = container.services;

  await assert.rejects(
    identity.beginEmailChange(
      user.id,
      { email: 'new@example.com', currentPassword: 'wrong' },
      { ip: '1.2.3.4' },
    ),
    /current password/,
  );
  await assert.rejects(
    identity.beginEmailChange(
      user.id,
      { email: 'alice@example.com', currentPassword: PASSWORD },
      { ip: '1.2.3.4' },
    ),
    /different email/,
  );

  // Taken by another account.
  identity.createVerifiedUser({ name: 'Bob', email: 'bob@example.com', password: PASSWORD });
  await assert.rejects(
    identity.beginEmailChange(
      user.id,
      { email: 'bob@example.com', currentPassword: PASSWORD },
      { ip: '1.2.3.4' },
    ),
    /not available/,
  );
  container.close();
});

test('email change: confirm updates the email, revokes sessions, and is single-use', async () => {
  const { container, mailer, user, token } = await setupVerifiedUser();
  const { identity } = container.services;

  await identity.beginEmailChange(
    user.id,
    { email: 'new@example.com', currentPassword: PASSWORD },
    { ip: '1.2.3.4' },
  );
  // The magic link goes to the NEW address (ownership proof).
  const changeMail = mailer.sent.find((m) => m.email === 'new@example.com');
  assert.ok(changeMail, 'link emailed to the new address');
  assert.match(changeMail.url, /\/settings\/confirm-email\?token=/);

  const urlToken = tokenFromUrl(changeMail.url);
  const result = identity.confirmEmailChange({ token: urlToken }, { ip: '1.2.3.4' });
  assert.equal(result.ok, true);

  const updated = container.repos.users.findById(user.id);
  assert.equal(updated.email, 'new@example.com');
  // Old session token no longer resolves.
  assert.equal(identity.currentUser(token), null, 'sessions revoked');

  // Replay fails: single-use link.
  const replay = identity.confirmEmailChange({ token: urlToken }, { ip: '1.2.3.4' });
  assert.equal(replay.ok, false);

  // Login now works with the new address.
  const login = await identity.login(
    { email: 'new@example.com', password: PASSWORD },
    { ip: '1.2.3.4' },
  );
  assert.equal(login.ok, true);
  container.close();
});

test('email change: stale credential version invalidates the link', async () => {
  const { container, mailer, user } = await setupVerifiedUser();
  const { identity } = container.services;

  await identity.beginEmailChange(
    user.id,
    { email: 'new@example.com', currentPassword: PASSWORD },
    { ip: '1.2.3.4' },
  );
  const urlToken = tokenFromUrl(mailer.sent.find((m) => m.email === 'new@example.com').url);

  // Change the password first -> credential_version bumps -> link is stale.
  identity.changePassword(user.id, { currentPassword: PASSWORD, newPassword: 'Brand-New-Pass-1!' });

  const result = identity.confirmEmailChange({ token: urlToken }, { ip: '1.2.3.4' });
  assert.equal(result.ok, false, 'stale link rejected');
  assert.equal(container.repos.users.findById(user.id).email, 'alice@example.com');
  container.close();
});

test('changePassword requires the current password and revokes sessions', async () => {
  const { container, user, token } = await setupVerifiedUser();
  const { identity } = container.services;
  assert.throws(
    () =>
      identity.changePassword(user.id, {
        currentPassword: 'wrong',
        newPassword: 'Brand-New-Pass-1!',
      }),
    /current password/,
  );

  const result = identity.changePassword(user.id, {
    currentPassword: PASSWORD,
    newPassword: 'Brand-New-Pass-1!',
  });
  assert.equal(result.ok, true);
  assert.equal(identity.currentUser(token), null, 'sessions revoked after password change');

  const oldLogin = await identity.login(
    { email: 'alice@example.com', password: PASSWORD },
    { ip: '1.2.3.4' },
  );
  assert.equal(oldLogin.ok, false, 'old password rejected');
  const newLogin = await identity.login(
    { email: 'alice@example.com', password: 'Brand-New-Pass-1!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(newLogin.ok, true);
  container.close();
});
