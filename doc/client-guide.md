# Voice Room Server — 客户端接入指南

## 目录

1. [快速开始](#1-快速开始)
2. [REST API — 用户](#2-rest-api--用户)
3. [REST API — 房间](#3-rest-api--房间)
4. [REST API — 座位](#4-rest-api--座位)
5. [REST API — 评论](#5-rest-api--评论)
6. [Socket.IO — 实时连接](#6-socketio--实时连接)
7. [Socket.IO — 客户端发送的命令](#7-socketio--客户端发送的命令)
8. [Socket.IO — 服务端推送的事件](#8-socketio--服务端推送的事件)
9. [完整流程示例](#9-完整流程示例)

---

## 1. 快速开始

### 安装依赖

```bash
npm install socket.io-client
```

### 最简连接示例

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  path: '/socket.io',
  auth: {
    userId: 'your-user-id',
    roomId: 'your-room-id',
  },
});

socket.on('connect', () => console.log('已连接'));
socket.on('connect_error', (err) => console.error('连接失败:', err.message));
```

> **注意**：连接前必须先通过 REST API 创建用户和房间，拿到对应的 `userId` 和 `roomId`。

---

## 2. REST API — 用户

### 创建用户

```
POST /users
```

**Body**

| 字段        | 类型   | 必填 | 说明              |
|-------------|--------|------|-------------------|
| nickname    | string | ✅   | 昵称，最多 32 字符 |
| avatarUrl   | string | ❌   | 头像 URL           |

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "nickname": "Alice",
    "avatarUrl": "",
    "role": "free",
    "createdAt": 1700000000000
  }
}
```

### 获取用户信息

```
GET /users/:id
```

---

## 3. REST API — 房间

### 获取活跃房间列表

```
GET /rooms
```

### 创建房间

```
POST /rooms
```

**Body**

| 字段            | 类型    | 必填 | 说明                        |
|-----------------|---------|------|-----------------------------|
| name            | string  | ✅   | 房间名称                    |
| ownerId         | string  | ✅   | 房主的 userId               |
| maxSpeakers     | number  | ❌   | 最大上麦人数，1~16，默认 8  |
| requireApproval | boolean | ❌   | 是否需要审批加入，默认 true |

**响应** `201`

```json
{
  "success": true,
  "data": {
    "id": "room-uuid",
    "name": "我的语音房",
    "ownerId": "user-uuid",
    "maxSpeakers": 8,
    "status": "active",
    "requireApproval": true,
    "announcement": null,
    "createdAt": 1700000000000
  }
}
```

### 获取房间详情

```
GET /rooms/:id
```

返回房间信息 + 成员列表 + 座位状态 + 在线人数。

### 更新房间（仅房主）

```
PATCH /rooms/:id
```

**Body**：`{ userId, name?, announcement? }`

### 关闭房间（仅房主）

```
DELETE /rooms/:id
```

**Body**：`{ userId }`

### 加入房间

```
POST /rooms/:id/join
```

**Body**：`{ userId }`

- 若房间 `requireApproval: false` 或请求者是房主 → 直接加入，返回 `201`
- 若需要审批 → 创建申请，返回 `202 { status: "pending", request: {...} }`

### 离开房间

```
POST /rooms/:id/leave
```

**Body**：`{ userId }`

### 踢出成员（仅房主）

```
POST /rooms/:id/kick
```

**Body**：`{ requesterId, targetUserId }`

### 切换麦克风角色

```
POST /rooms/:id/mic
```

**Body**：`{ userId, role: "speaker" | "audience" }`

- `speaker`：自动找一个空闲座位上麦
- `audience`：下麦，释放座位

### 加入申请管理（仅房主）

```
GET  /rooms/:id/join-requests?userId=<ownerId>          # 查看待审批列表
POST /rooms/:id/join-requests/:requestId/approve        # 审批通过，Body: { userId }
POST /rooms/:id/join-requests/:requestId/reject         # 拒绝，Body: { userId }
```

---

## 4. REST API — 座位

基础路径：`/rooms/:id/seats`

### 获取座位列表

```
GET /rooms/:id/seats
```

**座位状态说明**

| status     | 含义     |
|------------|----------|
| `idle`     | 空闲     |
| `occupied` | 已占用   |
| `locked`   | 已锁定   |

### 占座（上麦）

```
POST /rooms/:id/seats/:seatIndex/take
```

**Body**：`{ userId }`

### 离座（下麦）

```
POST /rooms/:id/seats/leave
```

**Body**：`{ userId }`

### 锁定/解锁座位（仅房主）

```
POST /rooms/:id/seats/:seatIndex/lock
```

**Body**：`{ userId, locked: true | false }`

### 静音/取消静音座位（仅房主）

```
POST /rooms/:id/seats/:seatIndex/mute
```

**Body**：`{ userId, muted: true | false }`

---

## 5. REST API — 评论

基础路径：`/rooms/:id/comments`

> 发评论前用户必须已加入房间。

### 发送评论

```
POST /rooms/:id/comments
```

**Body**

| 字段     | 类型   | 必填 | 说明                        |
|----------|--------|------|-----------------------------|
| userId   | string | ✅   |                             |
| content  | string | ✅   | 最多 500 字符               |
| parentId | string | ❌   | 回复某条评论时传父评论 id   |

### 获取评论列表（分页）

```
GET /rooms/:id/comments?limit=30&before=<timestamp>
```

### 获取某条评论的回复

```
GET /rooms/:id/comments/:commentId/replies
```

---

## 6. Socket.IO — 实时连接

### 连接参数

连接时通过 `auth` 传入身份信息：

```js
const socket = io('http://localhost:3000', {
  path: '/socket.io',
  auth: {
    userId: '<userId>',   // 必填
    roomId: '<roomId>',   // 必填
  },
});
```

### 连接成功后服务端自动推送

| 事件            | 说明                         |
|-----------------|------------------------------|
| `connected`     | 连接确认，携带 `{ roomId, userId }` |
| `room.snapshot` | 房间完整快照，携带 `{ roomId, data: RoomDetail }` |

### 连接失败原因

| 错误信息                                    | 原因                   |
|---------------------------------------------|------------------------|
| `userId and roomId are required in handshake auth` | auth 缺少必填字段 |
| `Room not found`                            | roomId 不存在          |
| `Room is closed`                            | 房间已关闭             |
| `User not found`                            | userId 不存在          |

---

## 7. Socket.IO — 客户端发送的命令

所有命令使用 **callback ack** 模式：`emit` 的最后一个参数传入回调函数，服务端执行完毕后直接调用该回调，响应天然与本次请求绑定，不存在并发混淆问题。

### 回调响应格式

```ts
// 成功
{ status: 'ok',      data?: any    }
// 需要审批（仅 join_room）
{ status: 'pending', data?: any    }
// 失败
{ status: 'error',   error: string }
```

### ping

```js
socket.emit('ping');
// 响应: socket.on('pong', ({ roomId, userId }) => {})
// ping 是唯一不使用 callback ack 的命令
```

### join_room — 加入房间

```js
socket.emit('join_room', {}, (res) => {
  if (res.status === 'ok')      console.log('已加入', res.data);   // RoomMember
  if (res.status === 'pending') console.log('等待审批', res.data); // JoinRequest
  if (res.status === 'error')   console.error(res.error);
});
```

### leave_room — 离开房间

```js
socket.emit('leave_room', {}, (res) => {
  if (res.status === 'error') console.error(res.error);
});
```

### toggle_mic — 切换上麦/下麦

```js
socket.emit('toggle_mic', { role: 'speaker' }, (res) => {  // 上麦
  if (res.status === 'ok') console.log(res.data); // RoomMember
});
socket.emit('toggle_mic', { role: 'audience' }, (res) => { // 下麦
  if (res.status === 'error') console.error(res.error);
});
```

| 参数 | 类型   | 值                          |
|------|--------|-----------------------------|
| role | string | `"speaker"` \| `"audience"` |

### take_seat — 占座

```js
socket.emit('take_seat', { seatIndex: 2 }, (res) => {
  if (res.status === 'ok') console.log(res.data); // RoomMember
});
```

### leave_seat — 离座

```js
socket.emit('leave_seat', {}, (res) => {
  if (res.status === 'error') console.error(res.error);
});
```

### send_comment — 发送评论

```js
socket.emit('send_comment', { content: '大家好！' }, (res) => {
  if (res.status === 'ok') console.log(res.data); // Comment
});
// 回复评论:
socket.emit('send_comment', { content: '同意', parentId: 'comment-uuid' }, (res) => {});
```

### kick_member — 踢人（仅房主）

```js
socket.emit('kick_member', { targetUserId: 'user-uuid' }, (res) => {
  if (res.status === 'error') console.error(res.error);
});
```

### close_room — 关闭房间（仅房主）

```js
socket.emit('close_room', {}, (res) => {
  if (res.status === 'error') console.error(res.error);
});
```

---

## 8. Socket.IO — 服务端推送的事件

所有实时事件统一通过 `event` 事件接收：

```js
socket.on('event', ({ event, data, roomId }) => {
  switch (event) {
    case 'user_joined':   // ...
    case 'user_left':     // ...
    // ...
  }
});
```

### 事件类型一览

| event           | 触发时机               | data 字段                                                    |
|-----------------|------------------------|--------------------------------------------------------------|
| `user_joined`   | 有用户加入房间         | `{ userId, nickname, memberRole }`                           |
| `user_left`     | 有用户离开房间         | `{ userId, nickname }`                                       |
| `member_kicked` | 成员被踢出             | `{ userId, nickname }`（被踢者和全房间都会收到）             |
| `mic_changed`   | 上麦/下麦/换座位       | `{ userId, nickname, seatIndex, memberRole }`                |
| `seat_locked`   | 座位被锁定/解锁        | `{ seatIndex, locked }`                                      |
| `seat_muted`    | 座位被静音/取消静音    | `{ seatIndex, muted }`                                       |
| `message`       | 有新评论               | `{ id, roomId, userId, nickname, avatarUrl, content, parentId, parentNickname, createdAt }` |
| `join_request`  | 有人申请加入（仅房主） | `{ requestId, roomId, userId, nickname, avatarUrl }`         |
| `join_approved` | 申请被批准（仅申请者） | `{ requestId, roomId, roomName }`                            |
| `join_rejected` | 申请被拒绝（仅申请者） | `{ requestId, roomId, roomName }`                            |
| `room_closed`   | 房间被关闭             | `{ roomId }`                                                 |

---

## 9. 完整流程示例

```js
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3000';

async function main() {
  // 1. 创建用户
  const { data: owner } = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'Alice' }),
  }).then(r => r.json());

  // 2. 创建房间
  const { data: room } = await fetch(`${BASE}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '周五聊天室', ownerId: owner.id, requireApproval: false }),
  }).then(r => r.json());

  // 3. 建立 Socket.IO 连接
  const socket = io(BASE, {
    path: '/socket.io',
    auth: { userId: owner.id, roomId: room.id },
  });

  socket.on('connected', (data) => {
    console.log('已连接', data);

    // 4. 加入房间 — callback ack，响应天然绑定本次请求
    socket.emit('join_room', {}, (res) => {
      if (res.status !== 'ok') return console.error('加入失败', res.error);
      console.log('已加入', res.data);

      // 5. 上麦 — 串行发送，不会与其他 take_seat 混淆
      socket.emit('take_seat', { seatIndex: 0 }, (res2) => {
        if (res2.status === 'ok') console.log('已上麦', res2.data);
        else console.error('上麦失败', res2.error);
      });
    });
  });

  socket.on('room.snapshot', ({ data }) => {
    console.log('房间快照', data);
  });

  // 6. 监听实时广播事件（非命令响应）
  socket.on('event', ({ event, data }) => {
    console.log(`[event] ${event}`, data);
  });
}

main();
```
