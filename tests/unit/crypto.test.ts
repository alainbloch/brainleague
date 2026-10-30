import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, passwordMatches, randomToken, digest } from '../../src/services/crypto.js';

const PASSWORD = 'Correct-Horse-42!';

test('hashPassword produces a versioned scrypt hash', () => {
  const hash = hashPassword(PASSWORD);
  assert.match(hash, /^scrypt\$16384\$8\$1\$[a-f0-9]{64}\$[A-Za-z0-9_-]+$/);
});

test('passwordMatches verifies the correct password', () => {
  const hash = hashPassword(PASSWORD);
  assert.equal(passwordMatches(PASSWORD, hash), true);
});

test('passwordMatches rejects a wrong password', () => {
  const hash = hashPassword(PASSWORD);
  assert.equal(passwordMatches('Wrong-Pass-1', hash), false);
});

test('each hash uses a unique salt', () => {
  assert.notEqual(hashPassword(PASSWORD), hashPassword(PASSWORD));
});

test('passwordMatches handles malformed or empty stored hashes without throwing', () => {
  assert.equal(passwordMatches(PASSWORD, null), false);
  assert.equal(passwordMatches(PASSWORD, ''), false);
  assert.equal(passwordMatches(PASSWORD, 'not-a-hash'), false);
});

test('randomToken returns 64 hex chars (32 bytes)', () => {
  const token = randomToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(token.length, 64);
});

test('randomToken is unique across calls', () => {
  assert.notEqual(randomToken(), randomToken());
});

test('digest is a stable sha256 hex', () => {
  assert.equal(digest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(digest('abc'), digest('abc'));
});
