import { mysqlPool } from './mysql';
import { redis } from './redis';

/**
 * Initialize MySQL tables (idempotent — CREATE TABLE IF NOT EXISTS).
 * Uses pool.query() instead of execute() because DDL isn't supported in prepared statements.
 */
export async function initMysql(): Promise<void> {
  const conn = await mysqlPool.getConnection();
  try {
    // Ensure database exists and is selected
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.MYSQL_DATABASE ?? 'voice_room'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${process.env.MYSQL_DATABASE ?? 'voice_room'}\``);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         VARCHAR(36)  NOT NULL,
        nickname   VARCHAR(64)  NOT NULL,
        avatar_url VARCHAR(512) NOT NULL DEFAULT '',
        role       ENUM('free','vip') NOT NULL DEFAULT 'free',
        created_at BIGINT       NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id               VARCHAR(36)  NOT NULL,
        name             VARCHAR(128) NOT NULL,
        owner_id         VARCHAR(36)  NOT NULL,
        max_speakers     INT          NOT NULL DEFAULT 8,
        status           ENUM('active','closed') NOT NULL DEFAULT 'active',
        require_approval TINYINT(1)   NOT NULL DEFAULT 1,
        announcement     TEXT,
        created_at       BIGINT       NOT NULL,
        PRIMARY KEY (id),
        KEY idx_status (status),
        KEY idx_owner (owner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS room_members (
        id          VARCHAR(36) NOT NULL,
        room_id     VARCHAR(36) NOT NULL,
        user_id     VARCHAR(36) NOT NULL,
        member_role ENUM('speaker','audience') NOT NULL DEFAULT 'audience',
        seat_index  INT         NOT NULL DEFAULT -1,
        joined_at   BIGINT      NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_room_user (room_id, user_id),
        KEY idx_room (room_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS seat_state (
        room_id     VARCHAR(36) NOT NULL,
        seat_index  INT         NOT NULL,
        user_id     VARCHAR(36),
        nickname    VARCHAR(64),
        status      ENUM('idle','occupied','locked','muted') NOT NULL DEFAULT 'idle',
        mic_enabled TINYINT(1)  NOT NULL DEFAULT 1,
        PRIMARY KEY (room_id, seat_index)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS join_requests (
        id         VARCHAR(36) NOT NULL,
        room_id    VARCHAR(36) NOT NULL,
        user_id    VARCHAR(36) NOT NULL,
        status     ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        created_at BIGINT      NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_room_user (room_id, user_id),
        KEY idx_room_status (room_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id         VARCHAR(36)  NOT NULL,
        room_id    VARCHAR(36)  NOT NULL,
        user_id    VARCHAR(36)  NOT NULL,
        parent_id  VARCHAR(36),
        content    TEXT         NOT NULL,
        created_at BIGINT       NOT NULL,
        PRIMARY KEY (id),
        KEY idx_room_created (room_id, created_at),
        KEY idx_parent (parent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('[MySQL] Schema initialized');
  } finally {
    conn.release();
  }
}

/**
 * Connect to Redis and verify the connection.
 */
export async function initRedis(): Promise<void> {
  try {
    if (redis.status === 'ready') {
      console.log('[Redis] Already connected');
      return;
    }
    await redis.connect();
    await redis.ping();
    console.log('[Redis] Connected');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already connecting') || msg.includes('already connected')) {
      console.log('[Redis] Already connected');
      return;
    }
    throw err;
  }
}
