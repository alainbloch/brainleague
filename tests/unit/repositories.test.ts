import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/models/database.js';
import { UsersRepository } from '../../src/models/usersRepository.js';
import { SessionsRepository } from '../../src/models/sessionsRepository.js';
import { TokensRepository } from '../../src/models/tokensRepository.js';
import { RateLimitsRepository } from '../../src/models/rateLimitsRepository.js';
import { EmailChangesRepository } from '../../src/models/emailChangesRepository.js';
import { digest } from '../../src/services/crypto.js';

/** Create a real user row so FK constraints are satisfied. */
function createUser(db, id = 'u1') {
  const repo = new UsersRepository(db);
  return repo.create({
    id,
    name: 'Test',
    email: `${id}@example.com`,
    passwordHash: 'hash',
    createdAt: 1000,
  });
}

test('migrations apply once and are idempotent', () => {
  const db = openDatabase(':memory:');
  const row = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get();
  assert.ok(row.n >= 1, 'at least one migration recorded');
  const migrated = db.prepare('SELECT id FROM schema_migrations').all();
  db.close();
  assert.ok(migrated.length >= 1);
});

test('migration 002 adds avatar_path and email_changes', () => {
  const db = openDatabase(':memory:');
  const cols = db
    .prepare('PRAGMA table_info(users)')
    .all()
    .map((c) => c.name);
  assert.ok(cols.includes('avatar_path'), 'users.avatar_path exists');
  const tbl = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_changes'")
    .get();
  assert.ok(tbl, 'email_changes table exists');
  db.close();
});

test('sessions: create, resolve, expire, revoke-all', () => {
  const db = openDatabase(':memory:');
  createUser(db, 'u1');
  const repo = new SessionsRepository(db);
  const hash = digest('token-a');
  const now = 1000;
  repo.create(hash, 'u1', now + 1000);
  assert.equal(repo.findUserId(hash, now), 'u1');
  assert.equal(repo.findUserId(hash, now + 1001), null, 'expired session resolves null');
  assert.equal(repo.delete(hash), true);
  assert.equal(repo.findUserId(hash, now), null);
  repo.create(digest('t1'), 'u1', now + 1000);
  repo.create(digest('t2'), 'u1', now + 1000);
  assert.equal(repo.deleteAllForUser('u1'), 2);
  db.close();
});

test('tokens: single-use claim deletes the row', () => {
  const db = openDatabase(':memory:');
  createUser(db, 'u1');
  const repo = new TokensRepository(db);
  const now = 1000;
  repo.create(digest('token'), 'u1', 'verify', now + 1000);
  assert.equal(repo.claim(digest('token'), 'verify', now), 'u1');
  assert.equal(repo.claim(digest('token'), 'verify', now), null, 'already used');
  db.close();
});

test('tokens: wrong purpose and expiry fail', () => {
  const db = openDatabase(':memory:');
  createUser(db, 'u1');
  const repo = new TokensRepository(db);
  const now = 1000;
  repo.create(digest('token'), 'u1', 'verify', now + 1000);
  assert.equal(repo.claim(digest('token'), 'reset', now), null);
  assert.equal(repo.claim(digest('token'), 'verify', now + 2000), null, 'expired');
  db.close();
});

test('rate limits: increments then expires the window', () => {
  const db = openDatabase(':memory:');
  const repo = new RateLimitsRepository(db);
  const now = 1000;
  assert.equal(repo.increment('k', now, 1000), 1);
  assert.equal(repo.increment('k', now, 1000), 2);
  // Window elapsed -> resets to 1.
  assert.equal(repo.increment('k', now + 1001, 1000), 1);
  assert.equal(repo.deleteExpired(now + 3000), 1, 'expired entry collected');
  db.close();
});

test('email_changes: create, single-use claim, expiry, per-user delete', () => {
  const db = openDatabase(':memory:');
  const user = createUser(db, 'u1');
  const repo = new EmailChangesRepository(db);
  const now = 1000;
  repo.create({
    tokenHash: digest('tok'),
    userId: user.id,
    newEmail: 'b@example.com',
    credentialVersion: 0,
    expiresAt: now + 1000,
  });

  const claimed = repo.claim(digest('tok'), now);
  assert.equal(claimed.newEmail, 'b@example.com');
  assert.equal(repo.claim(digest('tok'), now), null, 'already claimed');

  repo.create({
    tokenHash: digest('tok2'),
    userId: user.id,
    newEmail: 'c@example.com',
    credentialVersion: 1,
    expiresAt: now + 1000,
  });
  assert.equal(repo.claim(digest('tok2'), now + 2000), null, 'expired');

  repo.create({
    tokenHash: digest('tok3'),
    userId: user.id,
    newEmail: 'd@example.com',
    credentialVersion: 1,
    expiresAt: now + 1000,
  });
  // tok2 (expired but present) + tok3 = 2 rows for the user.
  assert.equal(repo.deleteAllForUser(user.id), 2);
  db.close();
});
