/**
 * Drizzle DB — switches between SQLite (dev/test) and MySQL (production)
 * based on the DB_DRIVER environment variable.
 *
 * DB_DRIVER=sqlite (default) → better-sqlite3
 * DB_DRIVER=mysql            → mysql2
 */
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

export type AnyDrizzleDb = ReturnType<typeof createSqliteDb>['db'] | Awaited<ReturnType<typeof createMysqlDb>>['db'];

const driver = process.env.DB_DRIVER ?? 'sqlite';

// ─── SQLite ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createSqliteDb(): { db: any; $sqlite?: any; isMysql: false } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require('drizzle-orm/better-sqlite3') as typeof import('drizzle-orm/better-sqlite3');

  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'data/voice_room.db');

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  return { db, $sqlite: sqlite, isMysql: false as const };
}

// ─── MySQL ────────────────────────────────────────────────────────────────────

async function createMysqlDb() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mysql = require('mysql2/promise') as typeof import('mysql2/promise');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require('drizzle-orm/mysql2') as typeof import('drizzle-orm/mysql2');

  const connection = await mysql.createConnection({
    host:     process.env.MYSQL_HOST     ?? '127.0.0.1',
    port:     parseInt(process.env.MYSQL_PORT ?? '3306', 10),
    user:     process.env.MYSQL_USER     ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'voice_room',
  });

  const db = drizzle(connection, { schema, mode: 'default' });
  return { db, connection, isMysql: true as const };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

type SqliteInstance = ReturnType<typeof createSqliteDb>;
type MysqlInstance  = Awaited<ReturnType<typeof createMysqlDb>>;
export type DbInstance = SqliteInstance | MysqlInstance;

let _instance: DbInstance | null = null;

export async function initDb(): Promise<DbInstance> {
  if (_instance) return _instance;
  if (driver === 'mysql') {
    _instance = await createMysqlDb();
    console.log('[DB] Connected to MySQL');
  } else {
    _instance = createSqliteDb();
    console.log('[DB] Using SQLite');
  }
  return _instance;
}

export function getDb(): { db: any } {
  if (!_instance) throw new Error('DB not initialized. Call initDb() first.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: (_instance as any).db };
}

export { driver as dbDriver, schema };
