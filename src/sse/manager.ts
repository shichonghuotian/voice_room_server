import { Response } from 'express';
import { SseEventType } from '../types';
import { roomEventBus } from '../realtime/roomEventBus';

interface SseClient {
  userId: string;
  res: Response;
}

class SseManager {
  private rooms = new Map<string, SseClient[]>();

  constructor() {
    // Subscribe to roomEventBus — forward all events to SSE clients
    roomEventBus.subscribe((event) => {
      if (event.targetUserId) {
        this.sendToClientDirect(event.roomId, event.targetUserId, event.event, event.data);
      } else {
        this.broadcastDirect(event.roomId, event.event, event.data);
      }
    });
  }

  addClient(roomId: string, userId: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const client: SseClient = { userId, res };
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, []);
    this.rooms.get(roomId)!.push(client);

    this.sendToClient(client, 'ping', { message: 'connected' });

    const pingInterval = setInterval(() => {
      if (res.writableEnded) { clearInterval(pingInterval); return; }
      this.sendToClient(client, 'ping', { message: 'ping' });
    }, 30_000);

    res.on('close', () => {
      clearInterval(pingInterval);
      this.removeClient(roomId, userId);
    });
  }

  removeClient(roomId: string, userId: string): void {
    const clients = this.rooms.get(roomId);
    if (!clients) return;
    const updated = clients.filter((c) => c.userId !== userId);
    if (updated.length === 0) this.rooms.delete(roomId);
    else this.rooms.set(roomId, updated);
  }

  getClientCount(roomId: string): number {
    return this.rooms.get(roomId)?.length ?? 0;
  }

  // Called directly by routes that need to send SSE without going through eventBus
  // (e.g. initial ping on connect). For business events, use roomEventBus.publish.
  private broadcastDirect<T>(roomId: string, event: SseEventType, data: T): void {
    const clients = this.rooms.get(roomId);
    if (!clients || clients.length === 0) return;
    for (const client of clients) this.sendToClient(client, event, data);
  }

  private sendToClientDirect<T>(roomId: string, userId: string, event: SseEventType, data: T): void {
    const client = this.rooms.get(roomId)?.find((c) => c.userId === userId);
    if (client) this.sendToClient(client, event, data);
  }

  private sendToClient<T>(client: SseClient, event: SseEventType, data: T): void {
    if (client.res.writableEnded) return;
    try {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch { /* ignore */ }
  }
}

export const sseManager = new SseManager();
