import { initDb } from '../src/db';
import { resetSqliteDb } from '../src/db/migrate';

let initialized = false;

export async function setupTestDb(): Promise<void> {
  if (!initialized) {
    process.env.DB_PATH = ':memory:';
    process.env.DB_DRIVER = 'sqlite';
    await initDb();
    initialized = true;
  }
  resetSqliteDb();
}
