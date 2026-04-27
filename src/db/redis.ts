import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const IS_TEST = process.env.NODE_ENV === 'test' || process.env.DB_PATH === ':memory:';

// In test mode, create a disconnected stub to avoid hanging connections
class NoopRedis {
  async ping() { return 'PONG'; }
  async get() { return null; }
  async set() { return null; }
  async hget() { return null; }
  async hset() { return 0; }
  async hgetall() { return {}; }
  async del() { return 0; }
  async incr() { return 0; }
  async decr() { return 0; }
  async pexpire() { return 0; }
  async smembers() { return []; }
  async srem() { return 0; }
  on() { return this; }
  connect() { return Promise.resolve(); }
}

export const redis: Redis = IS_TEST
  ? (new NoopRedis() as unknown as Redis)
  : new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      retryStrategy: () => null,
    });

if (!IS_TEST) {
  redis.on('error', (err) => {
    console.error('[Redis] connection error:', err.message);
  });
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

export const keys = {
  roomInfo:    (roomId: string) => `room:${roomId}:info`,
  roomSeats:   (roomId: string) => `room:${roomId}:seats`,
  roomMembers: (roomId: string) => `room:${roomId}:members`,
  seatLock:    (roomId: string, idx: number) => `room:${roomId}:seat_lock:${idx}`,
  userOnline:  (userId: string) => `user:${userId}:online`,
  commentLikes:(commentId: string) => `comment:${commentId}:likes`,
};

// ─── Seat cache helpers ───────────────────────────────────────────────────────

export interface CachedSeat {
  userId: string | null;
  nickname: string | null;
  status: 'idle' | 'occupied' | 'locked' | 'muted';
  micEnabled: boolean;
}

export async function getSeat(roomId: string, seatIndex: number): Promise<CachedSeat | null> {
  const raw = await redis.hget(keys.roomSeats(roomId), String(seatIndex));
  if (!raw) return null;
  try { return JSON.parse(raw) as CachedSeat; } catch { return null; }
}

export async function setSeat(roomId: string, seatIndex: number, seat: CachedSeat): Promise<void> {
  await redis.hset(keys.roomSeats(roomId), String(seatIndex), JSON.stringify(seat));
}

export async function clearSeat(roomId: string, seatIndex: number): Promise<void> {
  const idle: CachedSeat = { userId: null, nickname: null, status: 'idle', micEnabled: true };
  await redis.hset(keys.roomSeats(roomId), String(seatIndex), JSON.stringify(idle));
}

export async function getAllSeats(roomId: string): Promise<Record<number, CachedSeat>> {
  const raw = await redis.hgetall(keys.roomSeats(roomId));
  const result: Record<number, CachedSeat> = {};
  for (const [idx, val] of Object.entries(raw ?? {})) {
    try { result[parseInt(idx)] = JSON.parse(val); } catch { /* skip */ }
  }
  return result;
}

// ─── Distributed lock ─────────────────────────────────────────────────────────

/**
 * Acquire a seat lock. Returns true if acquired, false if already locked.
 */
export async function acquireSeatLock(roomId: string, seatIndex: number, ttlMs = 5000): Promise<boolean> {
  const result = await redis.set(
    keys.seatLock(roomId, seatIndex),
    '1',
    'PX', ttlMs,
    'NX'
  );
  return result === 'OK';
}

export async function releaseSeatLock(roomId: string, seatIndex: number): Promise<void> {
  await redis.del(keys.seatLock(roomId, seatIndex));
}

// ─── Online presence ──────────────────────────────────────────────────────────

export async function setUserOnline(userId: string, roomId: string, ttlMs = 60_000): Promise<void> {
  await redis.set(keys.userOnline(userId), roomId, 'PX', ttlMs);
}

export async function refreshUserOnline(userId: string, ttlMs = 60_000): Promise<void> {
  await redis.pexpire(keys.userOnline(userId), ttlMs);
}

export async function getUserRoom(userId: string): Promise<string | null> {
  return redis.get(keys.userOnline(userId));
}

// ─── Comment likes ────────────────────────────────────────────────────────────

export async function incrementLikes(commentId: string): Promise<number> {
  return redis.incr(keys.commentLikes(commentId));
}

export async function decrementLikes(commentId: string): Promise<number> {
  return redis.decr(keys.commentLikes(commentId));
}

export async function getLikes(commentId: string): Promise<number> {
  const val = await redis.get(keys.commentLikes(commentId));
  return val ? parseInt(val, 10) : 0;
}
