/** Explicit, repeatable content install. Run npm run migrate before this command. */
import config from '../src/config.js';
import { openDatabase } from '../src/models/database.js';
import { seedContent } from './content/seed.js';

const db = openDatabase(config.databasePath, { migrate: false });
try {
  console.log('Content seed complete:', seedContent(db));
} finally {
  db.close();
}
