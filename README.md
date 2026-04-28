# Voice Room Server

A real-time voice room server built with Node.js, TypeScript, Socket.IO, and support for both SQLite (development) and MySQL (production).

## Requirements

- Node.js **18+**
- npm

## Quick Start

### SQLite (Development)

No database setup required. SQLite file is created automatically.

```bash
npm install
npm run dev:sqlite   # starts on http://localhost:3000
```

### MySQL (Production)

1. Create the database and tables:

```bash
mysql -u root -p < src/db/mysql-schema.sql
```

2. Configure `.env`:

```env
DB_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=voice_room

REDIS_URL=redis://127.0.0.1:6379
PORT=3000
JWT_SECRET=your_secret
```

3. Start the server:

```bash
npm run dev    # dev with hot reload
# or
npm run build && npm start   # production
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_DRIVER` | `sqlite` | `sqlite` or `mysql` |
| `DB_PATH` | `data/voice_room.db` | SQLite file path |
| `MYSQL_HOST` | `127.0.0.1` | MySQL host |
| `MYSQL_PORT` | `3306` | MySQL port |
| `MYSQL_USER` | — | MySQL username |
| `MYSQL_PASSWORD` | — | MySQL password |
| `MYSQL_DATABASE` | `voice_room` | MySQL database name |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis URL (used for seat cache) |
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | — | JWT signing secret |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (reads `.env`) |
| `npm run dev:sqlite` | Start dev server with SQLite, no `.env` needed |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output (reads `.env`) |
| `npm test` | Run all tests (in-memory SQLite) |
| `npm run seed` | Seed preset users into the database |

## Socket.IO Commands

Connect with `auth: { userId }` in the handshake.

### Room

| Command | Payload | Description |
|---------|---------|-------------|
| `subscribe_room` | `{ roomId }` | Subscribe to room events, receive snapshot |
| `unsubscribe_room` | `{ roomId }` | Unsubscribe from room events |
| `join_room` | `{ roomId }` | Join room as member |
| `leave_room` | `{ roomId }` | Leave room |
| `close_room` | `{ roomId }` | Close room (host only) |

### Mic

| Command | Payload | Description |
|---------|---------|-------------|
| `take_seat` | `{ roomId, seatIndex }` | Take a specific seat |
| `leave_seat` | `{ roomId }` | Leave current seat (become audience) |
| `toggle_mic` | `{ roomId, role }` | Toggle mic mute/unmute (speaker only) |
| `force_remove_speaker` | `{ roomId, targetUserId }` | Force a speaker to leave mic (host only) |

### Speaker Requests

| Command | Payload | Description |
|---------|---------|-------------|
| `request_to_speak` | `{ roomId }` | Request to become a speaker |
| `approve_speaker_request` | `{ roomId, requestId }` | Approve a speaker request (host only) |
| `reject_speaker_request` | `{ roomId, requestId }` | Reject a speaker request (host only) |

### Other

| Command | Payload | Description |
|---------|---------|-------------|
| `kick_member` | `{ roomId, targetUserId }` | Kick a member (host only) |
| `send_comment` | `{ roomId, content, parentId? }` | Send a comment |

## Socket.IO Events

All events are received via `socket.on('event', ({ event, data }) => ...)`.

| Event | Description |
|-------|-------------|
| `room.snapshot` | Full room state, sent on subscribe |
| `user_joined` | A user joined the room |
| `user_left` | A user left the room |
| `member_kicked` | A member was kicked |
| `mic_changed` | A seat's mic state changed |
| `speaker_request_created` | An audience member requested to speak |
| `speaker_request_approved` | A speaker request was approved |
| `speaker_request_rejected` | A speaker request was rejected |
| `room_closed` | The room was closed |
| `message` | A new comment was posted |

## REST API

### Users

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/users` | Create a user |
| `GET` | `/users/:id` | Get user by ID |
| `POST` | `/auth/regAndLogin` | Upsert user from main app |

### Rooms

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/rooms/recommended` | List recommended rooms |
| `POST` | `/rooms` | Create a room |
| `GET` | `/rooms/:id` | Room detail |
| `POST` | `/rooms/:id/join` | Join room (REST fallback) |
| `POST` | `/rooms/:id/leave` | Leave room (REST fallback) |
| `POST` | `/rooms/:id/kick` | Kick member |
| `POST` | `/rooms/:id/mic` | Change mic role |

Full API docs available at `http://localhost:3000/api-docs` when the server is running.

## Architecture

```
src/
├── db/
│   ├── index.ts          # DB init, driver selection
│   ├── schema.ts         # Drizzle schema + TypeScript types
│   ├── migrate.ts        # SQLite migrations
│   ├── mysql-schema.sql  # MySQL DDL
│   └── seed.ts           # Preset user seeding
├── routes/               # Express REST routes
├── services/
│   ├── roomService.ts    # Core room/member/seat logic
│   ├── userService.ts
│   ├── commentService.ts
│   └── seatCacheService.ts  # Redis seat cache
├── ws/
│   └── roomWsManager.ts  # Socket.IO command handlers
├── realtime/
│   └── roomEventBus.ts   # Internal event bus
├── types/
│   └── index.ts          # Event types + API helpers
└── app.ts
```
