# Voice Room Server — 优化设计 v2

> 基于 room.md 原始设计，结合 ZEGO SDK 集成方案，对当前测试项目进行系统性优化。

---

## 一、技术栈调整

| 层次 | 当前（测试版） | 优化后（生产对齐） |
|------|-------------|----------------|
| 运行环境 | Node.js 22 + TypeScript | 不变 |
| Web 框架 | Express | 不变 |
| 数据库 | SQLite（node:sqlite） | MySQL（主从 + 读写分离） |
| 缓存 | 无 | Redis（ioredis） |
| 实时通信 | 手写 WebSocket + SSE | **`ws` 库** + SSE（双通道保留） |
| 消息队列 | 无 | Bull（基于 Redis）用于礼物结算、异步通知 |
| 对象存储 | 无 | S3 / OSS（头像、封面） |

### 为什么换 `ws` 库

当前手写 WebSocket 帧解析存在以下风险：
- 无帧大小限制，客户端可发超大帧耗尽内存
- 不支持 permessage-deflate 压缩扩展
- 分片帧（fragmented frames）未完整处理

`ws` 是 Node.js 生态最成熟的 WebSocket 库，零额外依赖，完整实现 RFC 6455，TypeScript 类型完善。

```bash
npm install ws
npm install --save-dev @types/ws
```

替换后 `roomWsManager.ts` 核心逻辑简化为：

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // 鉴权后升级
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  ws.on('message', (data) => { /* 处理命令 */ });
  ws.on('close', () => { /* 清理 */ });
  ws.ping(); // 内置 ping/pong
});
```

---

## 二、与 ZEGO 集成的架构定位

```
┌─────────────────────────────────────────────────────┐
│                   客户端 (App)                        │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  ZEGO SDK    │  │  业务 HTTP   │                 │
│  │ (音视频传输) │  │  / WS / SSE  │                 │
│  └──────┬───────┘  └──────┬───────┘                 │
└─────────┼─────────────────┼───────────────────────── ┘
          │                 │
          ▼                 ▼
┌─────────────────┐  ┌──────────────────────────────┐
│   ZEGO 云服务   │  │      本项目后台服务            │
│  (音视频信令)   │  │  (元数据 / 麦位 / IM / 礼物)  │
└────────┬────────┘  └──────────────┬───────────────┘
         │  回调                    │
         └──────────────────────────┘
              room_create / room_destroy
              user_join / user_leave 回调
```

**职责划分：**
- **ZEGO SDK**：负责音视频流传输、信令、房间内用户状态同步
- **本后台**：负责房间元数据（列表、公告、封面）、麦位业务逻辑、IM 消息存储、礼物结算、风控
- **ZEGO 回调**：ZEGO 通过 Webhook 通知后台房间生命周期事件，后台以此维护本地状态

---

## 三、数据库表结构（优化版）

> 相比 room.md 原始设计的改动点用 `★` 标注。

### 3.1 用户表 `user`

```sql
CREATE TABLE `user` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uid`        VARCHAR(64)  NOT NULL COMMENT '业务用户ID（与第三方账号体系对接）',
  `nickname`   VARCHAR(64)  NOT NULL,
  `avatar`     VARCHAR(512) DEFAULT NULL,
  `gender`     TINYINT      DEFAULT 0  COMMENT '0未知 1男 2女',
  `level`      INT          DEFAULT 0  COMMENT '用户等级（影响麦位权限）',
  `role`       TINYINT      DEFAULT 0  COMMENT '★ 0普通 1VIP（上麦付费门槛）',
  `status`     TINYINT      DEFAULT 1  COMMENT '0禁用 1正常',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
```

**★ 改动**：增加 `role` 字段，对应当前项目的 `free/vip`，用于后续上麦付费门槛控制。

---

### 3.2 房间表 `room`

```sql
CREATE TABLE `room` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`          VARCHAR(64)  NOT NULL COMMENT '与 ZEGO roomID 保持一致',
  `title`            VARCHAR(128) NOT NULL,
  `cover_url`        VARCHAR(512) DEFAULT NULL,
  `announcement`     VARCHAR(512) DEFAULT NULL COMMENT '房间公告',
  `type`             TINYINT      DEFAULT 0  COMMENT '0公开 1私密',
  `password`         VARCHAR(64)  DEFAULT NULL COMMENT '私密房间密码（bcrypt hash）',
  `owner_uid`        VARCHAR(64)  NOT NULL,
  `owner_nickname`   VARCHAR(64)  DEFAULT NULL COMMENT '冗余，避免联查',
  `status`           TINYINT      DEFAULT 0  COMMENT '0空闲 1进行中 2已关闭',
  `seat_count`       INT          DEFAULT 9  COMMENT '麦位总数（含主播位 index=0）',
  `require_approval` TINYINT      DEFAULT 1  COMMENT '★ 0无需审批 1需要审批',
  `current_online`   INT          DEFAULT 0  COMMENT '当前在线人数（Redis 维护，此处仅快照）',
  `current_mic`      INT          DEFAULT 0  COMMENT '当前麦上人数',
  `zego_session_id`  VARCHAR(128) DEFAULT NULL COMMENT '★ ZEGO room_session_id，用于回调乱序处理',
  `started_at`       DATETIME     DEFAULT NULL,
  `ended_at`         DATETIME     DEFAULT NULL,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_id` (`room_id`),
  KEY `idx_owner_uid` (`owner_uid`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间表';
```

**★ 改动**：
- `require_approval`：从当前项目迁移过来，控制进房审批
- `password` 存 hash 而非明文
- `zego_session_id`：ZEGO 回调乱序处理的关键字段，用于判断是否需要覆盖本地状态

---

### 3.3 房间成员表 `room_member`

```sql
CREATE TABLE `room_member` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`     VARCHAR(64) NOT NULL,
  `uid`         VARCHAR(64) NOT NULL,
  `nickname`    VARCHAR(64) DEFAULT NULL COMMENT '冗余',
  `avatar`      VARCHAR(512) DEFAULT NULL COMMENT '冗余',
  `role`        TINYINT     DEFAULT 0  COMMENT '0听众 1房主 2管理员 3麦上用户',
  `seat_index`  INT         DEFAULT -1 COMMENT '麦位索引，-1表示未上麦',
  `mic_status`  TINYINT     DEFAULT 0  COMMENT '0关麦 1开麦',
  `is_active`   TINYINT     DEFAULT 1  COMMENT '★ 1在房间内 0已离开（软删除，保留历史）',
  `join_time`   DATETIME    DEFAULT NULL,
  `leave_time`  DATETIME    DEFAULT NULL,
  `created_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- ★ 去掉 UNIQUE(room_id, uid)，改为允许同一用户多次进出，用 is_active 区分
  KEY `uk_room_uid_active` (`room_id`, `uid`, `is_active`),
  KEY `idx_room_id` (`room_id`),
  KEY `idx_uid` (`uid`),
  KEY `idx_seat_index` (`room_id`, `seat_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间成员表';
```

**★ 改动**：
- 增加 `is_active` 软删除字段，解决原设计中用户多次进出导致 `UNIQUE(room_id, uid)` 冲突的问题
- `role` 细化为 4 个级别，支持管理员角色

---

### 3.4 麦位状态表 `seat_state`

```sql
CREATE TABLE `seat_state` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`     VARCHAR(64) NOT NULL,
  `seat_index`  INT         NOT NULL COMMENT '麦位索引，0为主播位',
  `uid`         VARCHAR(64) DEFAULT NULL COMMENT 'NULL表示空闲',
  `nickname`    VARCHAR(64) DEFAULT NULL COMMENT '冗余',
  `status`      TINYINT     DEFAULT 0  COMMENT '0空闲 1占用 2锁定 3禁麦',
  `mic_enabled` TINYINT     DEFAULT 1  COMMENT '0禁麦 1允许开麦',
  `updated_at`  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_seat` (`room_id`, `seat_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='麦位状态表（MySQL 持久化，Redis 为主）';
```

> **注意**：麦位状态以 Redis Hash 为主（`room:{roomId}:seats`），MySQL 仅在房间关闭时做最终持久化。实时操作不走 MySQL。

---

### 3.5 进房申请表 `join_request` ★ 新增

```sql
CREATE TABLE `join_request` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`    VARCHAR(64) NOT NULL,
  `uid`        VARCHAR(64) NOT NULL,
  `nickname`   VARCHAR(64) DEFAULT NULL,
  `status`     TINYINT     DEFAULT 0  COMMENT '0待审批 1已批准 2已拒绝',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_uid` (`room_id`, `uid`),
  KEY `idx_room_status` (`room_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='进房申请表';
```

---

### 3.6 礼物配置表 `gift` / 礼物记录表 `gift_record`

沿用 room.md 原始设计，无改动。

---

### 3.7 评论表 `comment`（优化版）

```sql
CREATE TABLE `comment` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`     VARCHAR(64)  NOT NULL,
  `parent_id`   BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0=一级评论',
  `uid`         VARCHAR(64)  NOT NULL,
  `nickname`    VARCHAR(64)  DEFAULT NULL COMMENT '冗余，防改名后显示异常',
  `avatar`      VARCHAR(512) DEFAULT NULL COMMENT '冗余',
  `content`     TEXT         NOT NULL,
  `like_count`  INT UNSIGNED DEFAULT 0,
  `reply_count` INT UNSIGNED DEFAULT 0  COMMENT '仅一级评论维护',
  `status`      TINYINT      DEFAULT 1  COMMENT '0删除 1正常 2置顶',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_parent`  (`room_id`, `parent_id`),
  KEY `idx_room_created` (`room_id`, `created_at`),
  KEY `idx_room_like`    (`room_id`, `like_count`),
  KEY `idx_parent_id`    (`parent_id`),
  KEY `idx_uid`          (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论表';
```

**相比当前项目的改动**：
- 增加 `like_count` / `reply_count` 计数字段
- 增加 `status` 支持置顶和软删除
- `nickname`/`avatar` 冗余存储，避免用户改名后历史评论显示异常
- `parent_id` 用 `0` 而非 `NULL` 表示一级评论（便于索引）

---

### 3.8 评论点赞表 `comment_like` ★ 新增

```sql
CREATE TABLE `comment_like` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `comment_id` BIGINT UNSIGNED NOT NULL,
  `uid`        VARCHAR(64) NOT NULL,
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_comment_user` (`comment_id`, `uid`),
  KEY `idx_uid` (`uid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='评论点赞记录';
```

---

### 3.9 消息日志表 `message_log`（优化版）

```sql
CREATE TABLE `message_log` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`        VARCHAR(64)  NOT NULL,
  `from_uid`       VARCHAR(64)  NOT NULL,
  `from_nickname`  VARCHAR(64)  DEFAULT NULL COMMENT '冗余',
  `client_msg_id`  VARCHAR(64)  DEFAULT NULL COMMENT '★ 客户端幂等ID，防重复发送',
  `message_type`   TINYINT      DEFAULT 0  COMMENT '0文本 1礼物通知 2系统',
  `content`        TEXT,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_client_msg_id` (`room_id`, `client_msg_id`),
  KEY `idx_room_id`    (`room_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天消息日志';
```

**★ 改动**：增加 `client_msg_id` 唯一索引，客户端重试时不会产生重复消息。

---

### 3.10 其他表（沿用原设计）

- `user_action_log`：风控审计，无改动
- `report`：举报封禁，无改动

---

## 四、Redis 缓存设计

| Key 模式 | 类型 | 说明 | TTL |
|---------|------|------|-----|
| `room:{roomId}:info` | Hash | 房间基本信息快照 | 房间生命周期 |
| `room:{roomId}:seats` | Hash | 麦位实时状态，field=seatIndex | 房间生命周期 |
| `room:{roomId}:members` | Set | 在线用户 uid 集合 | 房间生命周期 |
| `room:{roomId}:waiting` | List | 上麦等待队列 | 房间生命周期 |
| `room:{roomId}:seat_lock:{idx}` | String | 麦位操作分布式锁 | 5s |
| `room:{roomId}:join_requests` | Hash | 待审批申请 | 房间生命周期 |
| `user:{uid}:online` | String | 用户在线状态（值为 roomId） | 60s 心跳续期 |
| `comment:{commentId}:likes` | String | 评论点赞数（INCR） | 永久，定时同步 MySQL |

### 一致性策略

上麦操作流程（以 Redis 为主，MySQL 异步持久化）：

1. `SET room:{roomId}:seat_lock:{idx} 1 EX 5 NX` 获取分布式锁
2. `HGET room:{roomId}:seats {idx}` 检查麦位是否空闲
3. `HSET room:{roomId}:seats {idx} {uid,status}` 占用麦位
4. 异步写 MySQL seat_state（消息队列）
5. `DEL room:{roomId}:seat_lock:{idx}` 释放锁
6. 广播 SSE/WS mic_changed 事件

房间销毁时：将 Redis 中所有 `room:{roomId}:*` 持久化到 MySQL，然后批量 DEL。


---

## 五、WebSocket 协议设计（基于 ws 库）

### 5.1 连接端点

```
WS  ws://host/rooms/:roomId/ws?userId=xxx
SSE GET /rooms/:roomId/sse?userId=xxx   （保留，客户端二选一）
```

### 5.2 客户端发送命令

```jsonc
{ "type": "ping" }
{ "type": "join_room" }
{ "type": "leave_room" }
{ "type": "toggle_mic", "role": "speaker" }
{ "type": "take_seat", "seatIndex": 2 }
{ "type": "leave_seat" }
{ "type": "send_comment", "content": "hello", "parentId": "optional" }
{ "type": "kick_member", "targetUserId": "xxx" }
{ "type": "lock_seat", "seatIndex": 3, "locked": true }
{ "type": "mute_seat", "seatIndex": 3, "muted": true }
{ "type": "close_room" }
```

### 5.3 服务端推送

```jsonc
// 命令 ACK
{ "type": "ack", "command": "join_room", "status": "ok", "data": {} }
{ "type": "ack", "command": "join_room", "status": "pending", "data": {} }
{ "type": "error", "command": "toggle_mic", "error": "Speaker slots are full" }

// 连接成功快照
{ "type": "room.snapshot", "roomId": "xxx", "data": { "room": {}, "members": [], "seats": [] } }

// 事件推送（与 SSE 事件类型对齐）
{ "type": "event", "event": "user_joined",   "data": { "userId": "", "nickname": "", "memberRole": "audience" } }
{ "type": "event", "event": "user_left",     "data": { "userId": "", "nickname": "" } }
{ "type": "event", "event": "mic_changed",   "data": { "userId": "", "seatIndex": 2, "memberRole": "speaker" } }
{ "type": "event", "event": "seat_locked",   "data": { "seatIndex": 3, "locked": true } }
{ "type": "event", "event": "seat_muted",    "data": { "seatIndex": 3, "muted": true } }
{ "type": "event", "event": "room_closed",   "data": { "roomId": "" } }
{ "type": "event", "event": "member_kicked", "data": { "userId": "", "nickname": "" } }
{ "type": "event", "event": "join_request",  "data": { "requestId": "", "userId": "", "nickname": "" } }
{ "type": "event", "event": "join_approved", "data": { "requestId": "", "roomId": "" } }
{ "type": "event", "event": "join_rejected", "data": { "requestId": "", "roomId": "" } }
{ "type": "event", "event": "message",       "data": { "id": "", "content": "", "nickname": "" } }
{ "type": "event", "event": "gift",          "data": { "fromUid": "", "toUid": "", "giftId": 1, "quantity": 1 } }
```


---

## 六、ZEGO 集成关键点

### 6.1 房间生命周期回调（防乱序）

```typescript
// POST /zego/callback/room_create
async function onRoomCreate(roomId: string, sessionId: string, createTime: number) {
  const existing = await roomRepo.findByRoomId(roomId);
  // 用 session_id 防止旧回调覆盖新房间
  if (existing?.zegoSessionId === sessionId) return;
  await roomRepo.upsert({ roomId, zegoSessionId: sessionId, status: 'active' });
}

// POST /zego/callback/room_destroy
async function onRoomDestroy(roomId: string, sessionId: string) {
  await roomRepo.closeIfSession(roomId, sessionId);
  await seatService.persistToDb(roomId);   // Redis → MySQL
  await redis.del(`room:${roomId}:seats`);
  await redis.del(`room:${roomId}:members`);
}
```

### 6.2 麦位与 ZEGO 房间属性同步

ZEGO 房间属性限制：最多 20 个，Key ≤ 16 字节，Value ≤ 1024 字节，总长度 ≤ 5120 字节。

建议麦位 Key-Value 格式：

```
Key:   "seat_0" ~ "seat_8"
Value: {"uid":"xxx","nickname":"Alice","micEnabled":true,"status":"occupied"}
```

```typescript
// POST /zego/callback/room_attr_update
async function onRoomAttrUpdate(roomId: string, attributes: Record<string, string>) {
  for (const [key, value] of Object.entries(attributes)) {
    const match = key.match(/^seat_(\d+)$/);
    if (!match) continue;
    const seatIndex = parseInt(match[1]);
    const seatData = JSON.parse(value);
    await redis.hset(`room:${roomId}:seats`, seatIndex, JSON.stringify(seatData));
    roomEventBus.publish({ roomId, event: 'mic_changed', data: { seatIndex, ...seatData } });
  }
}
```

### 6.3 心跳与在线人数

- 客户端每 30s 发送 ping，后台续期 `user:{uid}:online` TTL = 60s
- 定时任务每 30s 扫描 `room:{roomId}:members`，清理过期用户，更新 `room.current_online`


---

## 七、麦位模型重构（对齐 ZEGO）

当前项目是 `speaker/audience` 角色切换，需重构为 `seat_index` 固定编号模型。

### 7.1 麦位状态

```typescript
type SeatStatus = 'idle' | 'occupied' | 'locked' | 'muted';

interface SeatState {
  seatIndex: number;    // 0 = 主播位，1~N = 嘉宾位
  uid: string | null;   // null = 空闲
  nickname: string | null;
  status: SeatStatus;
  micEnabled: boolean;
}
```

### 7.2 API 变更对比

| 当前 API | 重构后 API | 说明 |
|---------|-----------|------|
| `POST /rooms/:id/mic` body:{role} | `POST /rooms/:id/seats/:idx/take` | 申请指定麦位 |
| `POST /rooms/:id/mic` body:{role:audience} | `POST /rooms/:id/seats/leave` | 下麦 |
| 无 | `POST /rooms/:id/seats/:idx/lock` | 锁定麦位（房主） |
| 无 | `POST /rooms/:id/seats/:idx/mute` | 禁麦（房主） |
| 无 | `GET /rooms/:id/seats` | 获取所有麦位状态 |

---

## 八、迁移路径（三阶段）

### Phase 1：WebSocket 替换（低风险，可立即执行）

1. `npm install ws @types/ws`
2. 删除手写帧解析代码（`encodeFrame`、`decodeFrames` 等）
3. 用 `ws` 库的 `WebSocketServer` 替换，保留命令处理逻辑
4. `sseManager` 改为订阅 `roomEventBus`，统一事件分发：

```typescript
// 统一事件分发：roomService 只发布事件，不直接调用 sseManager
roomEventBus.publish({ roomId, event: 'user_joined', data: { ... } });

// sseManager 订阅 roomEventBus
roomEventBus.subscribe((event) => {
  if (event.targetUserId) {
    sseManager.sendToUser(event.roomId, event.targetUserId, event.event, event.data);
  } else {
    sseManager.broadcast(event.roomId, event.event, event.data);
  }
});
```

### Phase 2：麦位模型重构（中等风险）

1. 新增 `seat_state` 表
2. `room_member` 增加 `seat_index` 字段
3. 新增 `/rooms/:id/seats` 路由
4. 保留 `/rooms/:id/mic` 作为兼容层（内部转换为 seat 操作）
5. 前端麦位区域改为固定编号展示

### Phase 3：生产化（需要基础设施）

1. SQLite → MySQL（修改 `db/index.ts`）
2. 引入 Redis（`ioredis`），麦位状态迁移到 Redis
3. 接入 ZEGO 回调路由（todo 占位）
4. JWT 认证替换当前 userId 明文传参 
5. `message_log` 按月分表

---

## 九、完整 API 清单（v2）

| Method | Path | 说明 |
|--------|------|------|
| POST | `/users` | 创建用户 |
| GET | `/users/:id` | 用户信息 |
| GET | `/rooms` | 房间列表 |
| POST | `/rooms` | 创建房间 |
| GET | `/rooms/:id` | 房间详情 |
| PATCH | `/rooms/:id` | 更新公告/封面 |
| DELETE | `/rooms/:id` | 关闭房间 |
| POST | `/rooms/:id/join` | 加入房间 |
| POST | `/rooms/:id/leave` | 离开房间 |
| POST | `/rooms/:id/kick` | 踢人 |
| GET | `/rooms/:id/join-requests` | 待审批列表 |
| POST | `/rooms/:id/join-requests/:id/approve` | 批准 |
| POST | `/rooms/:id/join-requests/:id/reject` | 拒绝 |
| GET | `/rooms/:id/seats` | 麦位列表 |
| POST | `/rooms/:id/seats/:idx/take` | 上麦 |
| POST | `/rooms/:id/seats/leave` | 下麦 |
| POST | `/rooms/:id/seats/:idx/lock` | 锁定麦位 |
| POST | `/rooms/:id/seats/:idx/mute` | 禁麦 |
| GET | `/rooms/:id/comments` | 评论列表 |
| POST | `/rooms/:id/comments` | 发评论/回复 |
| GET | `/rooms/:id/comments/:cid/replies` | 回复列表 |
| POST | `/rooms/:id/comments/:cid/like` | 点赞 |
| DELETE | `/rooms/:id/comments/:cid/like` | 取消点赞 |
| GET | `/gifts` | 礼物配置 |
| POST | `/rooms/:id/gifts` | 送礼 |
| GET | `/rooms/:id/sse?userId=` | SSE 连接 |
| WS | `/rooms/:id/ws?userId=` | WebSocket 连接 |
| POST | `/zego/callback/room_create` | ZEGO 回调 |
| POST | `/zego/callback/room_destroy` | ZEGO 回调 |
| POST | `/zego/callback/room_attr_update` | ZEGO 麦位同步 |
| POST | `/zego/callback/user_join` | ZEGO 用户进房 |
| POST | `/zego/callback/user_leave` | ZEGO 用户离房 |

