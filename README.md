# Voice Room Server

A test server for a voice room feature using Node.js, TypeScript, SQLite (built-in `node:sqlite`), and SSE.

## Requirements

- Node.js **22.5+** (uses the built-in `node:sqlite` module)

## Quick Start

```bash
npm install
npm run dev        # starts on http://localhost:3000
```

Open `http://localhost:3000` in your browser for the SSE test client UI.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm test` | Run all tests (in-memory SQLite) |

## API

### Users

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/auth/regAndLogin` | `{ userId, nickname, avatarUrl?, source? }` | Upsert a main app user and return the voice room profile |
| `POST` | `/users` | `{ nickname, avatarUrl? }` | Create a temporary user |
| `GET` | `/users/:id` | — | Get user by ID |

### Rooms

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/rooms` | — | List active rooms |
| `POST` | `/rooms` | `{ name, ownerId, maxSpeakers? }` | Create a room |
| `GET` | `/rooms/:id` | — | Room detail + member list |
| `DELETE` | `/rooms/:id` | `{ userId }` | Close room (owner only) |
| `POST` | `/rooms/:id/join` | `{ userId }` | Join room as audience |
| `POST` | `/rooms/:id/leave` | `{ userId }` | Leave room |
| `POST` | `/rooms/:id/kick` | `{ requesterId, targetUserId }` | Kick member (owner only) |
| `POST` | `/rooms/:id/mic` | `{ userId, role: 'speaker'\|'audience' }` | Change mic state |

### SSE

```
GET /rooms/:id/sse?userId=xxx
```

Connect after joining a room. Events pushed:

| Event | Payload |
|-------|---------|
| `user_joined` | `{ userId, nickname, memberRole }` |
| `user_left` | `{ userId, nickname }` |
| `mic_changed` | `{ userId, nickname, memberRole }` |
| `room_closed` | `{ roomId }` |
| `member_kicked` | `{ userId, nickname }` |
| `ping` | `{ message }` |

## Architecture

```
src/
├── db/
│   ├── index.ts      # DatabaseSync init + table creation + resetDb()
│   └── schema.ts     # TypeScript types
├── routes/
│   ├── users.ts
│   ├── rooms.ts
│   └── sse.ts
├── services/
│   ├── userService.ts
│   └── roomService.ts
├── sse/
│   └── manager.ts    # SSE connection registry
├── types/
│   └── index.ts      # ApiResponse helpers + SSE event types
└── app.ts
```

## Future: Payment Gate for Speakers

The `users.role` field is already `'free' | 'vip'`. To add a payment gate for going on mic, uncomment the check in `roomService.changeMic()`:

```ts
// TODO: future payment gate — check user.role === 'vip' here
if (user.role !== 'vip') throw new Error('VIP required to go on mic');
```
