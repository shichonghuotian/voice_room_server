/**
 * Unified DB adapter — switches between SQLite (dev/test) and MySQL (production).
 *
 * Usage:
 *   import { dbAdapter } from './adapter';
 *   const rows = await dbAdapter.query<User>('SELECT * FROM users WHERE id = ?', [id]);
 *   await dbAdapter.execute('INSERT INTO users ...', [...]);
 *
 * Set DB_DRIVER=mysql in .env to use MySQL.
 * Default (or DB_DRIVER=sqlite) uses node:sqlite.
 */

export type Row = Record<string, unknown>;

export interface DbAdapter {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ insertId?: number; affectedRows?: number }>;
  /** For SQLite only — synchronous exec for DDL statements */
  execSync?(sql: string): void;
}

// ─── SQLite adapter ───────────────────────────────────────────────────────────

function createSqliteAdapter(): DbAdapter {
  // Lazy import to avoid loading SQLite in MySQL mode
  const { db } = require('./index') as { db: import('node:sqlite').DatabaseSync };

  return {
    async query<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
      return stmt.all(...(params as Parameters<typeof stmt.all>)) as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      stmt.run(...(params as Parameters<typeof stmt.all>));
      return {};
    },
    execSync(sql: string) {
      db.exec(sql);
    },
  };
}

// ─── MySQL adapter ────────────────────────────────────────────────────────────

function createMysqlAdapter(): DbAdapter {
  const { query, execute } = require('./mysql') as typeof import('./mysql');

  return {
    query: query as DbAdapter['query'],
    execute: async (sql, params) => {
      const result = await execute(sql, params);
      return { insertId: result.insertId, affectedRows: result.affectedRows };
    },
  };
}

// ─── Export singleton ─────────────────────────────────────────────────────────

const driver = process.env.DB_DRIVER ?? 'sqlite';

export const dbAdapter: DbAdapter =
  driver === 'mysql' ? createMysqlAdapter() : createSqliteAdapter();

export const isMysql = driver === 'mysql';
