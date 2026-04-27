/**
 * Seat cache service — wraps Redis seat operations with SQLite fallback.
 * When Redis is available, seat state is read/written from Redis first.
 * SQLite/MySQL is used as the persistent backing store.
 */
import {
  redis,
  getSeat,
  setSeat,
  clearSeat,
  getAllSeats,
  acquireSeatLock,
  releaseSeatLock,
  type CachedSeat,
} from '../db/redis';
import type { SeatState } from '../db/schema';

let redisAvailable = false;

// Check Redis availability lazily — don't block startup
setImmediate(() => {
  redis.ping()
    .then(() => { redisAvailable = true; })
    .catch(() => { /* Redis not available, use DB only */ });
});

redis.on('ready', () => { redisAvailable = true; });
redis.on('error', () => { redisAvailable = false; });

function toSeatState(roomId: string, seatIndex: number, cached: CachedSeat): SeatState {
  return {
    roomId,
    seatIndex,
    userId: cached.userId,
    nickname: cached.nickname,
    status: cached.status,
    micEnabled: cached.micEnabled,
  };
}

export const seatCache = {
  isAvailable(): boolean {
    return redisAvailable;
  },

  async get(roomId: string, seatIndex: number): Promise<SeatState | null> {
    if (!redisAvailable) return null;
    const cached = await getSeat(roomId, seatIndex);
    if (!cached) return null;
    return toSeatState(roomId, seatIndex, cached);
  },

  async set(roomId: string, seatIndex: number, seat: SeatState): Promise<void> {
    if (!redisAvailable) return;
    await setSeat(roomId, seatIndex, {
      userId: seat.userId,
      nickname: seat.nickname,
      status: seat.status,
      micEnabled: seat.micEnabled,
    });
  },

  async clear(roomId: string, seatIndex: number): Promise<void> {
    if (!redisAvailable) return;
    await clearSeat(roomId, seatIndex);
  },

  async getAll(roomId: string): Promise<Record<number, SeatState> | null> {
    if (!redisAvailable) return null;
    const all = await getAllSeats(roomId);
    if (Object.keys(all).length === 0) return null;
    const result: Record<number, SeatState> = {};
    for (const [idx, cached] of Object.entries(all)) {
      result[parseInt(idx)] = toSeatState(roomId, parseInt(idx), cached);
    }
    return result;
  },

  /**
   * Acquire distributed lock for a seat operation.
   * Falls back to no-op (always granted) when Redis is unavailable.
   */
  async acquireLock(roomId: string, seatIndex: number): Promise<boolean> {
    if (!redisAvailable) return true; // no lock in SQLite mode
    return acquireSeatLock(roomId, seatIndex);
  },

  async releaseLock(roomId: string, seatIndex: number): Promise<void> {
    if (!redisAvailable) return;
    await releaseSeatLock(roomId, seatIndex);
  },

  /**
   * Warm up Redis cache from DB seat list.
   */
  async warmUp(roomId: string, seats: SeatState[]): Promise<void> {
    if (!redisAvailable) return;
    for (const seat of seats) {
      await setSeat(roomId, seat.seatIndex, {
        userId: seat.userId,
        nickname: seat.nickname,
        status: seat.status,
        micEnabled: seat.micEnabled,
      });
    }
  },
};
