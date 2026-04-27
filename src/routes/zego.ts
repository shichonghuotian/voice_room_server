import { Router, Request, Response } from 'express';

const router = Router();

// TODO: Implement ZEGO callback signature verification
// Reference: https://doc-en.zego.im/article/13835
// Use HMAC-SHA256 with AppSign to validate X-ZEGO-Signature header

// TODO: POST /zego/callback/room_create
// - Upsert room status using room_session_id to handle out-of-order callbacks
// - Update room.status = 'active', store zego_session_id
router.post('/callback/room_create', (_req: Request, res: Response) => {
  // TODO: implement
  res.json({ code: 0 });
});

// TODO: POST /zego/callback/room_destroy
// - Close room only if room_session_id matches (prevent stale callbacks)
// - Persist Redis seat state to MySQL
// - Broadcast room_closed SSE/WS event
router.post('/callback/room_destroy', (_req: Request, res: Response) => {
  // TODO: implement
  res.json({ code: 0 });
});

// TODO: POST /zego/callback/room_attr_update
// - Parse seat_N keys from attributes (e.g. "seat_0", "seat_1")
// - Sync seat state to Redis and seat_state table
// - Broadcast mic_changed event via roomEventBus
router.post('/callback/room_attr_update', (_req: Request, res: Response) => {
  // TODO: implement
  res.json({ code: 0 });
});

// TODO: POST /zego/callback/user_join
// - Increment room.current_online in Redis
// - Optionally auto-join user to room_members if not already present
router.post('/callback/user_join', (_req: Request, res: Response) => {
  // TODO: implement
  res.json({ code: 0 });
});

// TODO: POST /zego/callback/user_leave
// - Decrement room.current_online in Redis
// - Handle heartbeat timeout cleanup
router.post('/callback/user_leave', (_req: Request, res: Response) => {
  // TODO: implement
  res.json({ code: 0 });
});

export default router;
