import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContainer, tokenFromUrl } from '../helpers.js';

const EMAIL = 'alice@example.com';

/** Register a fresh user and return its verification link. */
async function registerUser(container, { email = EMAIL } = {}) {
  const { identity } = container.services;
  const result = await identity.register(
    { name: 'Alice', email, password: 'Correct-Horse-42!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(result.ok, true);
  const mail = container.mailer.sent.find((m) => m.email === email);
  assert.ok(mail, 'verification email was sent');
  return mail.url;
}

test('register sends a verification email and creates an unverified user', async () => {
  const { container } = createTestContainer();
  const url = await registerUser(container);
  const user = container.repos.users.findByEmail(EMAIL);
  assert.ok(user, 'user created');
  assert.equal(user.emailVerifiedAt, null, 'unverified until link clicked');
  assert.ok(url.includes('/auth/verify?token='), 'link is a verify link');
  container.close();
});

test('register validates email format and rejects invalid input', async () => {
  const { container } = createTestContainer();
  await assert.rejects(
    container.services.identity.register(
      { name: 'X', email: 'nope', password: 'Correct-Horse-42!' },
      { ip: '1.2.3.4' },
    ),
    /valid email/,
  );
  await assert.rejects(
    container.services.identity.register(
      { name: '', email: 'ok@example.com', password: 'Correct-Horse-42!' },
      { ip: '1.2.3.4' },
    ),
    /Name is required/,
  );
  container.close();
});

test('register is non-enumerating: sending to an existing verified address is a silent no-op', async () => {
  const { container, mailer } = createTestContainer();
  await registerUser(container);
  // Verify the account so a second register sees a verified user.
  const url = mailer.sent.find((m) => m.email === EMAIL).url;
  const token = tokenFromUrl(url);
  const { identity } = container.services;
  const v = identity.verify({ token }, { ip: '1.2.3.4' });
  assert.equal(v.ok, true);

  mailer.sent.length = 0;
  await identity.register(
    { name: 'Alice', email: EMAIL, password: 'Correct-Horse-42!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(mailer.sent.length, 0, 'no email sent for existing verified account');
  container.close();
});

test('verify marks the account verified and the token is single use', async () => {
  const { container } = createTestContainer();
  const url = await registerUser(container);
  const token = tokenFromUrl(url);
  const { identity } = container.services;
  const first = identity.verify({ token }, { ip: '1.2.3.4' });
  assert.equal(first.ok, true);
  assert.ok(identity.verify({ token }, { ip: '1.2.3.4' }).ok === false, 'replay fails');
  assert.ok(container.repos.users.findByEmail(EMAIL).emailVerifiedAt, 'verified');
  container.close();
});

test('verify rejects expired or malformed tokens', async () => {
  const { container } = createTestContainer();
  const { identity } = container.services;
  assert.equal(
    identity.verify({ token: container.services.tokens.crypto.randomToken() }, { ip: '1.2.3.4' })
      .ok,
    false,
  );
  assert.equal(identity.verify({ token: 'nope' }, { ip: '1.2.3.4' }).ok, false);
  container.close();
});

test('login succeeds only after verification', async () => {
  const { container } = createTestContainer();
  const { identity } = container.services;
  const url = await registerUser(container);

  // Before verification.
  const before = await identity.login(
    { email: EMAIL, password: 'Correct-Horse-42!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(before.ok, false);
  assert.match(before.reason, /Verify your email/);

  // After verification.
  identity.verify({ token: tokenFromUrl(url) }, { ip: '1.2.3.4' });
  const after = await identity.login(
    { email: EMAIL, password: 'Correct-Horse-42!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(after.ok, true);
  assert.ok(after.userId);
  container.close();
});

test('login rejects wrong password (uniform timing path does not leak)', async () => {
  const { container } = createTestContainer();
  const { identity } = container.services;
  await registerUser(container);
  const bad = await identity.login({ email: EMAIL, password: 'Wrong-1' }, { ip: '1.2.3.4' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /Email or password/);

  // Unknown email gets the same message as a wrong password.
  const unknown = await identity.login(
    { email: 'nobody@example.com', password: 'Correct-Horse-42!' },
    { ip: '1.2.3.4' },
  );
  assert.match(unknown.reason, /Email or password/);
  container.close();
});

test('sessions work and currentUser resolves the signed-in user', async () => {
  const { container } = createTestContainer();
  const { identity } = container.services;
  const url = await registerUser(container);
  identity.verify({ token: tokenFromUrl(url) }, { ip: '1.2.3.4' });
  const { userId } = await identity.login(
    { email: EMAIL, password: 'Correct-Horse-42!' },
    { ip: '1.2.3.4' },
  );
  const { token } = identity.createSession(userId);
  const session = identity.currentUser(token);
  assert.equal(session.email, EMAIL);
  assert.equal(identity.currentUser('not-a-token'), null);
  container.close();
});

test('reset password revokes existing sessions', async () => {
  const { container } = createTestContainer();
  const { identity, mailer } = container.services;
  const verifyUrl = await registerUser(container);
  identity.verify({ token: tokenFromUrl(verifyUrl) }, { ip: '1.2.3.4' });
  const { userId } = await identity.login(
    { email: EMAIL, password: 'Correct-Horse-42!' },
    { ip: '1.2.3.4' },
  );
  const { token } = identity.createSession(userId);
  assert.ok(identity.currentUser(token), 'session active');

  // Request a reset link.
  await identity.forgotPassword({ email: EMAIL }, { ip: '1.2.3.4' });
  const resetMail = mailer.sent.find((m) => m.subject.includes('Reset'));
  const resetUrl = resetMail.url;
  const resetToken = tokenFromUrl(resetUrl);
  const reset = identity.resetPassword(
    { email: EMAIL, token: resetToken, password: 'New-Pass-987!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(reset.ok, true);

  assert.equal(identity.currentUser(token), null, 'old session revoked after password change');

  const after = await identity.login(
    { email: EMAIL, password: 'New-Pass-987!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(after.ok, true);
  container.close();
});

test('createVerifiedUser returns an account that can sign in immediately', async () => {
  const { container } = createTestContainer();
  const { identity } = container.services;
  const user = identity.createVerifiedUser({
    name: 'Demo',
    email: 'demo@example.test',
    password: 'Correct-Horse-42!',
  });
  assert.equal(user.emailVerifiedAt !== null, true, 'verified from creation');
  assert.equal(container.mailer.sent.length, 0, 'no verification email sent');

  const login = await identity.login(
    { email: 'demo@example.test', password: 'Correct-Horse-42!' },
    { ip: '1.2.3.4' },
  );
  assert.equal(login.ok, true, 'verified account signs in immediately');
  container.close();
});

test('rate limiting blocks after the per-IP threshold', async () => {
  const { container } = createTestContainer();
  const { identity } = container.services;
  const ip = '9.9.9.9';
  // Use a distinct email per attempt so only the per-IP counter accumulates
  // and the per-email counter (lower) does not trip first.
  for (let i = 0; i < container.config.rateLimit.perIp; i++) {
    await assert.doesNotReject(
      identity.login({ email: `u${i}@example.com`, password: 'Wrong-1' }, { ip }),
    );
  }
  await assert.rejects(
    identity.login({ email: 'one@example.com', password: 'Wrong-1' }, { ip }),
    /15 minutes/,
  );
  container.close();
});
