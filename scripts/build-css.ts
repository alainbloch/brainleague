/**
 * Compile the Tailwind v4 stylesheet (src/public/assets/css/app.css source)
 * into the served CSS bundle at src/public/assets/css/app.min.css using the
 * Tailwind CLI. Content discovery scans all templates so utilities used in
 * Nunjucks views are generated.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = [
  path.join(root, 'node_modules', '.bin', 'tailwindcss'),
  '-i',
  path.join(root, 'src/public/assets/css/app.css'),
  '-o',
  path.join(root, 'src/public/assets/css/app.min.css'),
  '--minify',
];

console.log('Building Tailwind CSS...');
execFileSync(args[0], args.slice(1), { cwd: root, stdio: 'inherit' });
console.log('CSS built -> src/public/assets/css/app.min.css');
