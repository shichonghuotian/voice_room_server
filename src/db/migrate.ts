/**
 * Creates SQLite tables directly via SQL.
 * Called after initDb() when using SQLite driver.
 */
import { getDb } from './index';

export function runSqliteMigrations(): void {
  const instance = getDb() as unknown as { db: { $client: import('better-sqlite3').Database } };
  const sqlite = instance.db.$client; // MySQL mode — skip

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      nickname   TEXT NOT NULL,
      avatar_url TEXT NOT NULL DEFAULT '',
      role       TEXT NOT NULL DEFAULT 'free' CHECK(role IN ('free','vip')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id    TEXT PRIMARY KEY,
      name  TEXT NOT NULL,
      image TEXT
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      owner_id     TEXT NOT NULL,
      category_id  TEXT,
      image_url    TEXT,
      cover_url    TEXT,
      max_speakers INTEGER NOT NULL DEFAULT 20,
      max_audience INTEGER NOT NULL DEFAULT 100,
      status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','closed')),
      privacy      TEXT NOT NULL DEFAULT 'private' CHECK(privacy IN ('public','private')),
      mic_option   TEXT NOT NULL DEFAULT 'mic_and_comments' CHECK(mic_option IN ('mic_and_comments','mic_only')),
      announcement TEXT,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room_members (
      id          TEXT PRIMARY KEY,
      room_id     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      member_role TEXT NOT NULL DEFAULT 'audience' CHECK(member_role IN ('speaker','audience')),
      seat_index  INTEGER NOT NULL DEFAULT -1,
      joined_at   INTEGER NOT NULL,
      UNIQUE(room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS seat_state (
      room_id     TEXT NOT NULL,
      seat_index  INTEGER NOT NULL,
      user_id     TEXT,
      nickname    TEXT,
      status      TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','occupied','locked','muted')),
      mic_enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (room_id, seat_index)
    );

    CREATE TABLE IF NOT EXISTS join_requests (
      id         TEXT PRIMARY KEY,
      room_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      created_at INTEGER NOT NULL,
      UNIQUE(room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id         TEXT PRIMARY KEY,
      room_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      parent_id  TEXT,
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_comments_room   ON comments(room_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_join_requests   ON join_requests(room_id, status);
    CREATE INDEX IF NOT EXISTS idx_rooms_status    ON rooms(status, created_at DESC);
  `);
}

export function resetSqliteDb(): void {
  const instance = getDb() as unknown as { db: { $client: import('better-sqlite3').Database } };
  const sqlite = instance.db.$client;
  if (!sqlite) return;

  sqlite.exec(`
    DROP TABLE IF EXISTS join_requests;
    DROP TABLE IF EXISTS comments;
    DROP TABLE IF EXISTS seat_state;
    DROP TABLE IF EXISTS room_members;
    DROP TABLE IF EXISTS rooms;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS users;
  `);
  runSqliteMigrations();
}
