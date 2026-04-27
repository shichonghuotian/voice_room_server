-- Voice Room MySQL Schema
-- Run: mysql -u root voice_room < src/db/mysql-schema.sql

CREATE DATABASE IF NOT EXISTS voice_room CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE voice_room;

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         VARCHAR(36)  NOT NULL,
  nickname   VARCHAR(64)  NOT NULL,
  avatar_url VARCHAR(512) NOT NULL DEFAULT '',
  role       ENUM('free','vip') NOT NULL DEFAULT 'free',
  created_at BIGINT       NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Rooms ────────────────────────────────────────────────────────────────────
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Room Members ─────────────────────────────────────────────────────────────
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Seat State ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seat_state (
  room_id     VARCHAR(36) NOT NULL,
  seat_index  INT         NOT NULL,
  user_id     VARCHAR(36),
  nickname    VARCHAR(64),
  status      ENUM('idle','occupied','locked','muted') NOT NULL DEFAULT 'idle',
  mic_enabled TINYINT(1)  NOT NULL DEFAULT 1,
  PRIMARY KEY (room_id, seat_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Join Requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS join_requests (
  id         VARCHAR(36) NOT NULL,
  room_id    VARCHAR(36) NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  status     ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at BIGINT      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_room_user (room_id, user_id),
  KEY idx_room_status (room_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Comments ─────────────────────────────────────────────────────────────────
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
