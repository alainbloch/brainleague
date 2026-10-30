/**
 * Reset the database: delete the SQLite file (and WAL/SHM sidecars) then apply
 * migrations from scratch. DESTRUCTIVE — all local rows are lost.
 *
 * Safety guards:
 * - `--yes` / `-y` skips the confirmation prompt (for scripts/CI).
 * - The target path must look like a SQLite database file (basename starts
 *   with a dot or letter and ends .db, or is ":memory:"), and must not be
 *   the filesystem root, so a misconfigured DATABASE_PATH cannot delete user
 *   data.
 *
 * Usage:
 *   npm run db:reset          # prompts for confirmation
 *   npm run db:reset -- -y    # skip prompt, reset only
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { openDatabase, closeDatabase } from '../src/models/database.js';
import config from '../src/config.js';

const dbPath = config.databasePath;

function looksLikeSqliteFile(p: string): boolean {
  if (p === ':memory:') return false;
  const base = path.basename(p);
  return /^\.?[A-Za-z0-9_-]+\.db$/.test(base) && path.dirname(p) !== path.parse(p).root;
}

async function confirm(flag: boolean): Promise<boolean> {
  if (flag) return true;
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(
    `This will DELETE ${dbPath} and recreate it empty. Continue? (y/N) `,
  );
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function reset() {
  const autoYes = process.argv.includes('--yes') || process.argv.includes('-y');
  if (!(await confirm(autoYes))) {
    console.log('Reset cancelled.');
    process.exit(0);
  }

  if (!looksLikeSqliteFile(dbPath)) {
    throw new Error(
      `Refusing to reset '${dbPath}': DATABASE_PATH must point to a '.db' file, ` +
        'not a directory or the filesystem root. Set DATABASE_PATH and retry.',
    );
  }

  // Close any open connection first (sidecar files cannot be removed while
  // SQLite holds them open on some platforms).
  closeDatabase(openDatabase(dbPath, { migrate: false }));

  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
      console.log(`Removed ${target}`);
    }
  }

  const db = openDatabase(dbPath, { migrate: true });
  const row = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as {
    n: number;
  };
  const applied = row.n;
  closeDatabase(db);
  console.log(`Database reset and migrated (${applied} migrations applied). ${dbPath}`);
}

reset().catch((err) => {
  console.error(`Reset failed: ${err.message}`);
  process.exit(1);
});
