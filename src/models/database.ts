import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

interface Migration {
  id: number;
  name: string;
  up: string;
}

/**
 * Migration record: { id, up }. Migrations run in ascending id order inside
 * a transaction and are recorded in schema_migrations so they apply exactly once.
 */
function loadMigrations(): Migration[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((file) => {
    const id = Number.parseInt(file.split('_')[0], 10);
    if (Number.isNaN(id)) throw new Error(`Migration file has no numeric prefix: ${file}`);
    return { id, name: file, up: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8') };
  });
}

/**
 * Open (and migrate) a SQLite database. Pass `{ migrate: false }` to just open.
 * By default provisions the connection with sensible PRAGMAs and applies pending
 * migrations idempotently.
 */
export function openDatabase(filePath: string, { migrate = true } = {}): Database.Database {
  if (filePath === ':memory:') {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    if (migrate) runMigrations(db);
    return db;
  }

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  if (migrate) runMigrations(db);
  return db;
}

/**
 * Apply all pending migrations. Recorded in schema_migrations(id) as INTEGER.
 * Wrapped in a transaction so a failed migration rolls back cleanly.
 */
export function runMigrations(db: Database.Database): number {
  const migrations = loadMigrations();
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
  );

  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: number }>).map(
      (r) => r.id,
    ),
  );
  const pending = migrations.filter((m) => !applied.has(m.id));

  const applyOne = db.transaction((m: Migration) => {
    db.exec(m.up);
    db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(m.id, m.name);
  });

  for (const migration of pending) applyOne(migration);
  return pending.length;
}

/** Close a database connection. */
export function closeDatabase(db: Database.Database): void {
  if (db && db.open) db.close();
}
