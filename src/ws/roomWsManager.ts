import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { commentService } from '../services/commentService';
import { roomService } from '../services/roomService';
import { userService } from '../services/userService';
import { roomEventBus, type RoomEventEnvelope } from '../realtime/roomEventBus';

// ─── Types ────────────────────────────────────────────────────────────────────

type AckCallback = (res: { status: string; data?: unknown; error?: string }) => void;

declare module 'socket.io' {
  interface SocketData {
    userId: string;
    nickname: string;
    joinedRooms: Set<string>;      // join_room confirmed — full membership
    subscribedRooms: Set<string>;  // subscribe_room only — event stream, no membership
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function handle(cb: AckCallback | undefined, fn: () => Promise<{ status: string; data?: unknown }>): void {
  fn().then(
    (res) => cb?.(res),
    (err) => cb?.({ status: 'error', error: err instanceof Error ? err.message : 'Failed' }),
  );
}

// ─── Manager ─────────────────────────────────────────────────────────────────

class RoomWsManager {
  private io: SocketIOServer | null = null;

  attach(server: HttpServer): void {
    if (this.io) return;

    this.io = new SocketIOServer(server, {
      path: '/socket.io',
      cors: { origin: '*' },
    });

    // ── Middleware: validate userId only ──────────────────────────────────────
    this.io.use(async (socket, next) => {
      const { userId } = socket.handshake.auth as { userId?: string };
      if (!userId) return next(new Error('userId is required in handshake auth'));

      const user = await userService.findById(userId);
      if (!user) return next(new Error('User not found'));

      socket.data.userId = userId;
      socket.data.nickname = user.nickname;
      socket.data.joinedRooms = new Set();
      socket.data.subscribedRooms = new Set();
      next();
    });

    // ── Connection ────────────────────────────────────────────────────────────
    this.io.on('connection', (socket: Socket) => {
      const { userId } = socket.data;
      socket.emit('connected', { userId });

      // ── subscribe_room ────────────────────────────────────────────────────
      // Joins the Socket.IO room for event delivery. Does NOT touch membership.
      socket.on('subscribe_room', ({ roomId }: { roomId?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');

          const room = await roomService.findById(roomId);
          if (!room) throw new Error('Room not found');
          if (room.status === 'closed') throw new Error('Room is closed');

          await socket.join(roomId);
          socket.data.subscribedRooms.add(roomId);

          const detail = await roomService.getDetail(roomId);
          // Push snapshot directly to this socket
          socket.emit('room.snapshot', { roomId, data: detail });

          return { status: 'ok' };
        });
      });

      // ── unsubscribe_room ──────────────────────────────────────────────────
      // Leaves the Socket.IO room. Does NOT touch membership.
      socket.on('unsubscribe_room', ({ roomId }: { roomId?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          await socket.leave(roomId);
          socket.data.subscribedRooms.delete(roomId);
          return { status: 'ok' };
        });
      });

      // ── join_room ─────────────────────────────────────────────────────────
      // Adds user to room membership (audience / speaker for owner).
      // Also subscribes to the room event stream if not already.
      socket.on('join_room', ({ roomId }: { roomId?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          try {
            const member = await roomService.join(roomId, userId);
            socket.data.joinedRooms.add(roomId);
            // Ensure subscribed
            if (!socket.data.subscribedRooms.has(roomId)) {
              await socket.join(roomId);
              socket.data.subscribedRooms.add(roomId);
            }
            return { status: 'ok', data: member };
          } catch (err) {
            if (err instanceof Error && err.message === 'APPROVAL_REQUIRED') {
              const req = await roomService.requestJoin(roomId, userId);
              return { status: 'pending', data: req };
            }
            throw err;
          }
        });
      });

      // ── leave_room ────────────────────────────────────────────────────────
      socket.on('leave_room', ({ roomId }: { roomId?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          await roomService.leave(roomId, userId);
          socket.data.joinedRooms.delete(roomId);
          return { status: 'ok' };
        });
      });

      // ── toggle_mic ────────────────────────────────────────────────────────
      socket.on('toggle_mic', ({ roomId, role }: { roomId?: string; role?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          if (role !== 'speaker' && role !== 'audience') throw new Error('role must be "speaker" or "audience"');
          const member = await roomService.changeMic(roomId, userId, role);
          return { status: 'ok', data: member };
        });
      });

      // ── take_seat ─────────────────────────────────────────────────────────
      socket.on('take_seat', ({ roomId, seatIndex }: { roomId?: string; seatIndex?: number }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          if (typeof seatIndex !== 'number') throw new Error('seatIndex is required');
          const member = await roomService.takeSeat(roomId, userId, seatIndex);
          return { status: 'ok', data: member };
        });
      });

      // ── leave_seat ────────────────────────────────────────────────────────
      socket.on('leave_seat', ({ roomId }: { roomId?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          const member = await roomService.leaveSeat(roomId, userId);
          return { status: 'ok', data: member };
        });
      });

      // ── send_comment ──────────────────────────────────────────────────────
      socket.on('send_comment', ({ roomId, content, parentId }: { roomId?: string; content?: string; parentId?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          if (typeof content !== 'string') throw new Error('content is required');
          const comment = await commentService.post({ roomId, userId, content, parentId });
          return { status: 'ok', data: comment };
        });
      });

      // ── kick_member ───────────────────────────────────────────────────────
      socket.on('kick_member', ({ roomId, targetUserId }: { roomId?: string; targetUserId?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          if (typeof targetUserId !== 'string') throw new Error('targetUserId is required');
          await roomService.kick(roomId, userId, targetUserId);
          return { status: 'ok' };
        });
      });

      // ── close_room ────────────────────────────────────────────────────────
      socket.on('close_room', ({ roomId }: { roomId?: string }, cb?: AckCallback) => {
        handle(cb, async () => {
          if (!roomId) throw new Error('roomId is required');
          await roomService.close(roomId, userId);
          return { status: 'ok' };
        });
      });

      // ── ping ──────────────────────────────────────────────────────────────
      socket.on('ping', () => {
        socket.emit('pong', { userId });
      });

      // ── disconnect ────────────────────────────────────────────────────────
      socket.on('disconnect', async () => {
        // Only clean up rooms the user actually joined (not just subscribed)
        for (const roomId of socket.data.joinedRooms) {
          try {
            await roomService.leave(roomId, userId);
          } catch {
            // Room may already be closed — ignore
          }
        }
      });
    });

    // ── Forward roomEventBus → Socket.IO rooms ────────────────────────────────
    roomEventBus.subscribe((event: RoomEventEnvelope) => {
      if (!this.io) return;
      const payload = { event: event.event, data: event.data, roomId: event.roomId };

      if (event.targetUserId) {
        // Targeted delivery: find the socket belonging to this user
        for (const [, socket] of this.io.sockets.sockets) {
          if (socket.data.userId === event.targetUserId) {
            socket.emit('event', payload);
            return;
          }
        }
        return;
      }

      // Broadcast to all subscribers of this room
      this.io.to(event.roomId).emit('event', payload);
    });
  }

  getClientCount(roomId: string): number {
    if (!this.io) return 0;
    return this.io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
  }
}

export const roomWsManager = new RoomWsManager();
