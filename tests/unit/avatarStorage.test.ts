import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AvatarStorage } from '../../src/services/avatarStorage.js';

const tmpDirs = [];
after(async () => {
  for (const dir of tmpDirs) await fs.rm(dir, { recursive: true, force: true });
});

function makeStorage(overrides = {}) {
  const dir = path.join(os.tmpdir(), `avatar-storage-${Math.random().toString(36).slice(2)}`);
  tmpDirs.push(dir);
  const storage = new AvatarStorage({ uploadDir: dir, ...overrides });
  return { storage, dir };
}

test('init creates the avatars directory', async () => {
  const { storage, dir } = makeStorage();
  await storage.init();
  await assert.doesNotReject(fs.access(path.join(dir, 'avatars')));
});

test('save persists bytes and returns a relative avatars path', async () => {
  const { storage, dir } = makeStorage();
  await storage.init();
  const relative = await storage.save(Buffer.from('png-bytes'), { mimetype: 'image/png' });
  assert.match(relative, /^avatars\/[a-f0-9-]+\.png$/);
  const saved = await fs.readFile(path.join(dir, relative));
  assert.equal(saved.toString(), 'png-bytes');
});

test('save rejects empty payloads, disallowed mimetypes, and oversized files', async () => {
  const { storage } = makeStorage();
  await storage.init();

  await assert.rejects(storage.save(Buffer.alloc(0), { mimetype: 'image/png' }), /Choose an image/);
  await assert.rejects(
    storage.save(Buffer.from('x'), { mimetype: 'application/pdf' }),
    /JPEG, PNG, WebP, or GIF/,
  );

  const tiny = makeStorage({ maxBytes: 4 });
  await tiny.storage.init();
  await assert.rejects(
    tiny.storage.save(Buffer.from('12345'), { mimetype: 'image/png' }),
    /MB or smaller/,
  );
});

test('remove deletes only files under avatars/ (sandboxed to basename)', async () => {
  const { storage, dir } = makeStorage();
  await storage.init();
  const relative = await storage.save(Buffer.from('x'), { mimetype: 'image/gif' });
  await storage.remove(relative);
  await assert.rejects(fs.access(path.join(dir, relative)), /ENOENT/);
  await assert.doesNotReject(storage.remove(relative)); // idempotent

  // Traversal-looking input is sandboxed: only the basename inside avatars/ is
  // ever removed, never a path outside the uploads dir.
  await assert.doesNotReject(storage.remove('avatars/../../secret.png'));
  await assert.rejects(fs.access(path.join(dir, 'avatars', 'secret.png')), /ENOENT/);
});

test('remove refuses non-avatar paths', async () => {
  const { storage } = makeStorage();
  await storage.init();
  await assert.rejects(storage.remove('../etc/passwd'), /Refusing/);
  await assert.rejects(storage.remove('avatars'), /Refusing/);
});
