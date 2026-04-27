# Socket.IO 实时协议文档

## 连接

```js
const socket = io('http://localhost:3000', {
  path: '/socket.io',
  auth: { userId: '<userId>' },  // 只需要 userId，不需要 roomId
});
```

连接成功后服务端推送：

```json
// event: "connected"
{ "userId": "user-alice" }
```

---

## 生命周期时序

```
客户端                          服务端
  |                               |
  |-- connect({ userId }) ------> |  握手校验用户
  |<-- connected ---------------  |
  |                               |
  |-- subscribe_room({ roomId })> |  校验房间存在且 active
  |<-- ack { status: "ok" } ----  |
  |<-- room.snapshot -----------  |  推送房间完整快照
  |                               |
  |-- join_room({ roomId }) ----> |  加入成员列表
  |<-- ack { status: "ok" } ----  |
  |                               |
  |   ... 房间内操作 ...           |
  |                               |
  |-- leave_room({ roomId }) ---> |  退出成员列表
  |-- unsubscribe_room({ roomId })>|  取消事件订阅
  |   (socket 保持不断开)          |
```

---

## 客户端 → 服务端命令

所有命令均使用 **callback ack** 模式：

```js
socket.emit('command_name', payload, (res) => {
  // res.status: 'ok' | 'pending' | 'error'
  // res.data:   成功时的返回数据（可选）
  // res.error:  失败时的错误信息（可选）
});
```

---

### subscribe_room

订阅房间事件流，不加入成员列表。成功后服务端推送 `room.snapshot`。

```json
// 发送
{ "roomId": "room-uuid" }

// ack 成功
{ "status": "ok" }

// ack 失败
{ "status": "error", "error": "Room not found" }
{ "status": "error", "error": "Room is closed" }
```

---

### unsubscribe_room

取消订阅房间事件流，不影响成员状态。

```json
// 发送
{ "roomId": "room-uuid" }

// ack
{ "status": "ok" }
```

---

### join_room

加入房间成员列表（audience）。Owner 自动占 seat 0 成为 speaker。
私有房间（privacy: private）非 owner 会返回 pending。

```json
// 发送
{ "roomId": "room-uuid" }

// ack 直接加入
{ "status": "ok", "data": { /* RoomMember */ } }

// ack 需要审批
{ "status": "pending", "data": { /* JoinRequest */ } }

// ack 失败
{ "status": "error", "error": "Room not found" }
```

---

### leave_room

退出房间成员列表，释放座位，广播 `user_left`。

```json
// 发送
{ "roomId": "room-uuid" }

// ack
{ "status": "ok" }
```

---

### toggle_mic

切换上麦 / 下麦。Owner 始终占 seat 0，其他人自动分配空闲座位。

```json
// 发送
{ "roomId": "room-uuid", "role": "speaker" }   // 上麦
{ "roomId": "room-uuid", "role": "audience" }  // 下麦

// ack
{ "status": "ok", "data": { /* RoomMember */ } }
{ "status": "error", "error": "Speaker slots are full (max 20)" }
```

---

### take_seat

直接占指定座位（上麦）。seat 0 保留给 owner。

```json
// 发送
{ "roomId": "room-uuid", "seatIndex": 2 }

// ack
{ "status": "ok", "data": { /* RoomMember */ } }
{ "status": "error", "error": "Seat 2 is already occupied" }
{ "status": "error", "error": "Seat 2 is locked" }
```

---

### leave_seat

离开当前座位（下麦），角色变为 audience。

```json
// 发送
{ "roomId": "room-uuid" }

// ack
{ "status": "ok", "data": { /* RoomMember */ } }
```

---

### send_comment

发送评论或回复。需要已加入房间。

```json
// 发送（顶层评论）
{ "roomId": "room-uuid", "content": "大家好！" }

// 发送（回复）
{ "roomId": "room-uuid", "content": "同意", "parentId": "comment-uuid" }

// ack
{ "status": "ok", "data": { /* CommentView | ReplyView */ } }
{ "status": "error", "error": "You must join the room before commenting" }
```

---

### kick_member

踢出成员（仅 owner）。Owner 自身不能被踢。

```json
// 发送
{ "roomId": "room-uuid", "targetUserId": "user-bob" }

// ack
{ "status": "ok" }
{ "status": "error", "error": "Only the owner can kick members" }
{ "status": "error", "error": "Cannot kick the room owner" }
```

---

### close_room

关闭房间（仅 owner）。广播 `room_closed` 事件。

```json
// 发送
{ "roomId": "room-uuid" }

// ack
{ "status": "ok" }
{ "status": "error", "error": "Only the owner can close the room" }
```

---

### ping

心跳检测。

```json
// 发送（无 payload）

// 服务端推送
// event: "pong"
{ "userId": "user-alice" }
```

---

## 服务端 → 客户端事件

所有实时事件通过 `event` 统一接收：

```js
socket.on('event', ({ event, data, roomId }) => {
  // event: 事件类型
  // data:  事件数据
  // roomId: 来源房间
});
```

---

### room.snapshot

订阅房间成功后推送，包含房间完整状态。

```json
// event: "room.snapshot"
{
  "roomId": "room-uuid",
  "data": {
    "id": "room-uuid",
    "title": "Friday Music Night",
    "description": null,
    "status": "active",
    "privacy": "public",
    "micOption": "mic_and_comments",
    "imageUrl": null,
    "coverUrl": null,
    "announcement": null,
    "createdAt": 1713600000000,
    "host": { "userId": "user-alice", "nickname": "Alice", "avatarUrl": "" },
    "category": { "id": "cat-music", "name": "Music", "image": null },
    "speakers": {
      "max": 20,
      "count": 1,
      "seats": [
        { "seatIndex": 0, "userId": "user-alice", "nickname": "Alice", "avatarUrl": "", "micEnabled": true, "status": "occupied", "isHost": true }
      ]
    },
    "audience": {
      "max": 100,
      "count": 2,
      "members": [
        { "userId": "user-bob", "nickname": "Bob", "avatarUrl": "" }
      ]
    },
    "onlineCount": 3
  }
}
```

---

### event: user_joined

有用户加入房间。

```json
{ "event": "user_joined", "roomId": "room-uuid", "data": { "userId": "user-bob", "nickname": "Bob", "memberRole": "audience" } }
```

---

### event: user_left

有用户离开房间。

```json
{ "event": "user_left", "roomId": "room-uuid", "data": { "userId": "user-bob", "nickname": "Bob" } }
```

---

### event: member_kicked

成员被踢出。被踢者和全房间都会收到。

```json
{ "event": "member_kicked", "roomId": "room-uuid", "data": { "userId": "user-bob", "nickname": "Bob" } }
```

---

### event: mic_changed

上麦 / 下麦 / 换座位。

```json
{ "event": "mic_changed", "roomId": "room-uuid", "data": { "userId": "user-bob", "nickname": "Bob", "seatIndex": 1, "memberRole": "speaker" } }
// 下麦时 seatIndex: -1, memberRole: "audience"
```

---

### event: seat_locked

座位被锁定或解锁（owner 操作）。

```json
{ "event": "seat_locked", "roomId": "room-uuid", "data": { "seatIndex": 2, "locked": true } }
```

---

### event: seat_muted

座位被静音或取消静音（owner 操作）。

```json
{ "event": "seat_muted", "roomId": "room-uuid", "data": { "seatIndex": 2, "muted": true } }
```

---

### event: message

新评论（包括回复）。

```json
{
  "event": "message",
  "roomId": "room-uuid",
  "data": {
    "id": "comment-uuid",
    "roomId": "room-uuid",
    "userId": "user-bob",
    "nickname": "Bob",
    "avatarUrl": "",
    "content": "大家好！",
    "parentId": null,
    "parentNickname": null,
    "createdAt": 1713600000000
  }
}
```

---

### event: join_request

有用户申请加入（仅 owner 收到）。

```json
{ "event": "join_request", "roomId": "room-uuid", "data": { "requestId": "req-uuid", "userId": "user-bob", "nickname": "Bob", "avatarUrl": "" } }
```

---

### event: join_approved

申请被批准（仅申请者收到）。

```json
{ "event": "join_approved", "roomId": "room-uuid", "data": { "requestId": "req-uuid", "roomId": "room-uuid", "roomName": "Friday Music Night" } }
```

---

### event: join_rejected

申请被拒绝（仅申请者收到）。

```json
{ "event": "join_rejected", "roomId": "room-uuid", "data": { "requestId": "req-uuid", "roomId": "room-uuid", "roomName": "Friday Music Night" } }
```

---

### event: room_closed

房间被关闭，全房间广播。

```json
{ "event": "room_closed", "roomId": "room-uuid", "data": { "roomId": "room-uuid" } }
```

---

## 权限说明

| 操作 | 权限 |
|------|------|
| subscribe_room / unsubscribe_room | 任何已登录用户 |
| join_room / leave_room | 任何已登录用户 |
| toggle_mic / take_seat / leave_seat | 已加入房间的成员 |
| send_comment | 已加入房间的成员 |
| kick_member | 仅 owner，不能踢 owner 自身 |
| close_room | 仅 owner |
| 锁座 / 静音座位 | 仅 owner（REST API） |
| 审批加入申请 | 仅 owner（REST API） |

---

## 错误处理

所有命令失败时 ack 返回：

```json
{ "status": "error", "error": "错误描述" }
```

连接失败时触发 `connect_error`：

```js
socket.on('connect_error', (err) => {
  // err.message: 'userId is required in handshake auth'
  // err.message: 'User not found'
});
```
