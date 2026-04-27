import type { SseEventType } from '../types';

export interface RoomEventEnvelope<T = unknown> {
  roomId: string;
  event: SseEventType;
  data: T;
  targetUserId?: string;
}

type RoomEventListener = (event: RoomEventEnvelope) => void;

class RoomEventBus {
  private listeners = new Set<RoomEventListener>();

  subscribe(listener: RoomEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish<T>(event: RoomEventEnvelope<T>): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const roomEventBus = new RoomEventBus();
