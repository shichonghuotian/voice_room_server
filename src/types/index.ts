// ─── API Response Helpers ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function fail(error: string): ApiError {
  return { success: false, error };
}

// ─── SSE Event Types ──────────────────────────────────────────────────────────

export type SseEventType =
  | 'user_joined'
  | 'user_left'
  | 'mic_changed'
  | 'room_closed'
  | 'member_kicked'
  | 'message'
  | 'join_request'
  | 'join_approved'
  | 'join_rejected'
  | 'seat_locked'
  | 'seat_muted'
  | 'ping';

export interface SseEvent<T = unknown> {
  event: SseEventType;
  data: T;
}

export interface UserJoinedPayload {
  userId: string;
  nickname: string;
  memberRole: 'speaker' | 'audience';
}

export interface UserLeftPayload {
  userId: string;
  nickname: string;
}

export interface MicChangedPayload {
  userId: string;
  nickname: string;
  memberRole: 'speaker' | 'audience';
}

export interface RoomClosedPayload {
  roomId: string;
}

export interface MemberKickedPayload {
  userId: string;
  nickname: string;
}

export interface MessagePayload {
  id: string;
  roomId: string;
  userId: string;
  nickname: string;
  avatarUrl: string;
  parentId: string | null;
  parentNickname: string | null;
  content: string;
  createdAt: number;
}

export interface JoinRequestPayload {
  requestId: string;
  roomId: string;
  userId: string;
  nickname: string;
  avatarUrl: string;
}

export interface JoinApprovedPayload {
  requestId: string;
  roomId: string;
  roomName: string;
}

export interface JoinRejectedPayload {
  requestId: string;
  roomId: string;
  roomName: string;
}
