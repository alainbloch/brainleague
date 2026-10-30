import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/app.js';
import { createTestContainer } from '../helpers.js';

test('console registration verifies automatically and permits authenticated access', async () => {
  const { container, mailer } = createTestContainer({ mailTransport: 'console' });
  const app = await buildApp({ container });
  try {
    const payload = {
      name: 'Console',
      email: 'console@example.test',
      password: 'Correct-Horse-42!',
    };
    const registered = await app.inject({ method: 'POST', url: '/register', payload });
    assert.equal(registered.statusCode, 200);
    assert.match(registered.body, /Email confirmation is not required/);
    assert.ok(container.repos.users.findByEmail(payload.email)?.emailVerifiedAt);
    assert.equal(mailer.sent.length, 0);
    const login = await app.inject({ method: 'POST', url: '/login', payload });
    assert.equal(login.statusCode, 302);
    const account = await app.inject({
      url: '/account',
      cookies: { usertest_session: login.cookies[0].value },
    });
    assert.equal(account.statusCode, 200);
  } finally {
    await app.close();
    container.close();
  }
});

test('console verifies existing accounts only after the correct password; old tokens expire', async () => {
  const { container, mailer } = createTestContainer();
  const identity = container.services.identity;
  const payload = {
    name: 'Existing',
    email: 'existing@example.test',
    password: 'Correct-Horse-42!',
  };
  try {
    await identity.register(payload, {});
    const token = new URL(mailer.sent[0].url).searchParams.get('token')!;
    assert.equal((await identity.login(payload, {})).ok, false, 'SMTP still requires verification');
    identity.config = { ...identity.config, mail: { transport: 'console' } };
    await identity.register({ ...payload, password: 'Someone-Else-42!' }, {});
    assert.equal(container.repos.users.findByEmail(payload.email)?.emailVerifiedAt, null);
    assert.equal((await identity.login({ ...payload, password: 'Wrong-Password!' }, {})).ok, false);
    assert.equal(container.repos.users.findByEmail(payload.email)?.emailVerifiedAt, null);
    assert.equal((await identity.login(payload, {})).ok, true);
    assert.ok(container.repos.users.findByEmail(payload.email)?.emailVerifiedAt);
    assert.equal(identity.verify({ token }, {}).ok, false);
    assert.equal(mailer.sent.length, 1);
  } finally {
    container.close();
  }
});
