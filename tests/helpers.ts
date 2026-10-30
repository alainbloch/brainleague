import { buildContainer, type Container } from '../src/container.js';
import type { AvatarStorage } from '../src/services/avatarStorage.js';

export interface MailSpy {
  sent: Array<{ email: string; subject: string; url: string }>;
  sendLink: (input: { email: string; subject: string; url: string }) => Promise<{ ok: true }>;
}

/** Capturing mailer: records links instead of delivering them. */
export function createMailSpy(): MailSpy {
  const sent: MailSpy['sent'] = [];
  return {
    sent,
    async sendLink({ email, subject, url }) {
      sent.push({ email, subject, url });
      return { ok: true };
    },
  };
}

export interface AvatarStub {
  saved: Array<{ bytes: number; mimetype: string }>;
  removed: Array<string | null | undefined>;
  init: () => Promise<void>;
  save: (buffer: Uint8Array, input: { mimetype: string }) => Promise<string>;
  remove: (relative: string | null | undefined) => Promise<void>;
}

/** In-memory avatar storage stub: enforces the adapter contract, no disk writes. */
export function createAvatarStub(): AvatarStub {
  const saved: AvatarStub['saved'] = [];
  const removed: AvatarStub['removed'] = [];
  return {
    saved,
    removed,
    async init() {},
    async save(buffer, { mimetype }) {
      if (!(buffer instanceof Uint8Array) || buffer.length === 0) {
        throw new Error('Choose an image file to upload.');
      }
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowed.includes(mimetype)) {
        throw new Error('Avatar must be a JPEG, PNG, WebP, or GIF image.');
      }
      saved.push({ bytes: buffer.length, mimetype });
      return `avatars/stub-${saved.length}.png`;
    },
    async remove(relative) {
      removed.push(relative);
    },
  };
}

/**
 * Build a real container over an in-memory SQLite database with a spy mailer.
 * `avatarStorage` defaults to the in-memory stub so unit flows never write to
 * disk; pass `{ avatarStorage: null }` to use the real adapter.
 * Returns { container, mailer, avatarStorage }; `container.mailer` is also set.
 */
export type TestContainer = Container & {
  mailer: MailSpy;
  avatarStorage: AvatarStorage | AvatarStub | null;
};

export function createTestContainer({
  clock,
  avatarStorage = createAvatarStub(),
}: {
  clock?: () => number;
  avatarStorage?: AvatarStorage | AvatarStub | null;
} = {}): {
  container: TestContainer;
  mailer: MailSpy;
  avatarStorage: AvatarStorage | AvatarStub | null;
} {
  const mailer = createMailSpy();
  const container = buildContainer({
    dbPath: ':memory:',
    clock,
    overrides: {
      mailer,
      ...(avatarStorage ? { avatarStorage } : {}),
    },
  }) as TestContainer;
  container.mailer = mailer;
  container.avatarStorage = avatarStorage;
  return { container, mailer, avatarStorage };
}

/** Extract the token from a magic-link URL. */
export function tokenFromUrl(url: string): string {
  const match = /token=([a-f0-9]{64})/.exec(url);
  if (!match) throw new Error(`No token in url: ${url}`);
  return match[1];
}

export function emailFromUrl(url: string): string {
  const match = /email=([^&]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : '';
}
