/**
 * Apply pending database migrations. Safe to run repeatedly; a migration is
 * recorded in schema_migrations and never re-applied. Migrations are applied
 * explicitly (script or deploy step), never at server startup.
 */
import { openDatabase, runMigrations, closeDatabase } from '../src/models/database.js';
import config from '../src/config.js';

const db = openDatabase(config.databasePath, { migrate: false });
try {
  const applied = runMigrations(db);
  console.log(`Migrations applied: ${applied > 0 ? `${applied} pending` : 'none (up to date)'}`);
  console.log(`Database: ${config.databasePath}`);
} finally {
  closeDatabase(db);
}
