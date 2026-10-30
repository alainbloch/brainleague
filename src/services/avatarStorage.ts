import fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

interface AvatarStorageOptions {
  uploadDir: string;
  maxBytes?: number;
  fsImpl?: typeof fs;
}

/**
 * File-system adapter for avatar uploads (isolates storage from the rest of
 * the app). Generated filenames are never derived from the client filename;
 * the extension is taken from the validated MIME type so path traversal or
 * arbitrary-content uploads are impossible. Files land under
 * `<uploadDir>/avatars/` and are served from the `/uploads/` static prefix.
 */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export class AvatarStorage {
  readonly uploadDir: string;
  readonly maxBytes: number;
  readonly fs: typeof fs;
  readonly avatarsDir: string;

  constructor({ uploadDir, maxBytes = 5 * 1024 * 1024, fsImpl = fs }: AvatarStorageOptions) {
    this.uploadDir = uploadDir;
    this.maxBytes = maxBytes;
    this.fs = fsImpl;
    this.avatarsDir = path.join(uploadDir, 'avatars');
  }

  async init(): Promise<void> {
    await this.fs.mkdir(this.avatarsDir, { recursive: true });
  }

  /**
   * Persist an uploaded avatar and return its storage-relative path
   * (e.g. `avatars/<uuid>.png`). Throws a user-facing error on invalid input.
   */
  async save(buffer: Uint8Array | Buffer, { mimetype }: { mimetype: string }): Promise<string> {
    if (!(buffer instanceof Uint8Array) || buffer.length === 0) {
      throw new Error('Choose an image file to upload.');
    }
    const ext = MIME_TO_EXT[mimetype];
    if (!ext) {
      throw new Error('Avatar must be a JPEG, PNG, WebP, or GIF image.');
    }
    if (buffer.length > this.maxBytes) {
      throw new Error(`Avatar must be ${Math.round(this.maxBytes / 1024 / 1024)} MB or smaller.`);
    }
    const relative = `avatars/${randomUUID()}.${ext}`;
    await this.fs.writeFile(path.join(this.uploadDir, relative), buffer);
    return relative;
  }

  /** Delete a stored avatar by storage-relative path; ignores missing files. */
  async remove(relative: string | null | undefined): Promise<void> {
    if (!relative || typeof relative !== 'string') return;
    // Only ever delete paths we generated under avatars/.
    if (!relative.startsWith('avatars/')) throw new Error('Refusing to remove a non-avatar path.');
    await this.fs.rm(path.join(this.avatarsDir, path.basename(relative)), { force: true });
  }
}

export type { FileHandle };
