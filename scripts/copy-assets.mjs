/**
 * Copy non-compiled assets into dist/ so the production build (dist/src/server.js)
 * can serve views, static assets, and migrations from one place. TypeScript
 * compilation only produces .js files; .njk / .sql / CSS / uploads are copied
 * verbatim preserving the src/ layout the code expects at runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist', 'src');

const copyDirs = ['views', 'public', 'models/migrations'];

for (const rel of copyDirs) {
  const src = path.join(root, 'src', rel);
  const dst = path.join(dist, rel);
  fs.cpSync(src, dst, { recursive: true });
  console.log(`copied src/${rel} -> dist/src/${rel}`);
}
console.log('Assets copied.');
