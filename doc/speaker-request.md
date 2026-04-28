# Speaker Request Feature

## Overview

The speaker request feature allows audience members to request permission to speak in a room. This is particularly useful for private rooms where the host needs to approve speakers.

## Features

### 1. Request to Speak (`request_to_speak`)

**Socket Command:**
```javascript
socket.emit('request_to_speak', { roomId: 'room-1' }, (res) => {
  // res.status: 'ok' | 'pending' | 'error'
  // res.data: { requestId: 'req-123' } (if pending)
});
```

**Behavior:**
- **Public rooms**: User is automatically promoted to speaker (returns `status: 'ok'`)
- **Private rooms**: Request is created and sent to host for approval (returns `status: 'pending'` with `requestId`)

**Validations:**
- User must be in the room
- User must be an audience member (not already a speaker)
- User cannot have multiple pending requests in the same room
- Room must not be closed

**Response:**
```json
{
  "status": "ok"
}
```
or
```json
{
  "status": "pending",
  "data": { "requestId": "req-123" }
}
```

### 2. Approve Speaker Request (`approve_speaker_request`)

**Socket Command:**
```javascript
socket.emit('approve_speaker_request', 
  { roomId: 'room-1', requestId: 'req-123' }, 
  (res) => {
    // res.status: 'ok' | 'error'
  }
);
```

**Behavior:**
- Host approves the speaker request
- User is promoted to speaker and assigned an available seat
- Pending request is deleted
- Events are broadcast: `speaker_request_approved` + `mic_changed`

**Validations:**
- Only the room host can approve
- Request must exist and be pending
- Room must not be closed
- Speaker slots must not be full

**Response:**
```json
{ "status": "ok" }
```

### 3. Reject Speaker Request (`reject_speaker_request`)

**Socket Command:**
```javascript
socket.emit('reject_speaker_request', 
  { roomId: 'room-1', requestId: 'req-123' }, 
  (res) => {
    // res.status: 'ok' | 'error'
  }
);
```

**Behavior:**
- Host rejects the speaker request
- Pending request is deleted
- Event is broadcast: `speaker_request_rejected`

**Validations:**
- Only the room host can reject
- Request must exist and be pending

**Response:**
```json
{ "status": "ok" }
```

## Events

### `speaker_request_created`

Broadcast when an audience member requests to speak (in private rooms).

**Payload:**
```json
{
  "requestId": "req-123",
  "roomId": "room-1",
  "userId": "user-bob",
  "nickname": "Bob",
  "avatarUrl": "https://...",
  "createdAt": 1777271469042
}
```

**Recipients:** Room host only

### `speaker_request_approved`

Broadcast when a speaker request is approved.

**Payload:**
```json
{
  "requestId": "req-123",
  "roomId": "room-1",
  "userId": "user-bob"
}
```

**Recipients:** All room subscribers

### `speaker_request_rejected`

Broadcast when a speaker request is rejected.

**Payload:**
```json
{
  "requestId": "req-123",
  "roomId": "room-1",
  "userId": "user-bob"
}
```

**Recipients:** All room subscribers

## Room Snapshot

The `room.snapshot` event now includes pending speaker requests:

```json
{
  "id": "room-1",
  "title": "My Room",
  "speakers": { "max": 8, "count": 1, "seats": [...] },
  "audience": { "max": 100, "count": 2, "members": [...] },
  "pendingSpeakerRequests": [
    {
      "requestId": "req-123",
      "roomId": "room-1",
      "userId": "user-bob",
      "nickname": "Bob",
      "avatarUrl": "https://...",
      "createdAt": 1777271469042
    }
  ]
}
```

## Database Schema

### SQLite
```sql
CREATE TABLE speaker_requests (
  id         TEXT PRIMARY KEY,
  room_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at INTEGER NOT NULL,
  UNIQUE(room_id, user_id)
);
```

### MySQL
```sql
CREATE TABLE speaker_requests (
  id         VARCHAR(36) NOT NULL,
  room_id    VARCHAR(36) NOT NULL,
  user_id    VARCHAR(36) NOT NULL,
  status     ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_room_user (room_id, user_id),
  KEY idx_room_status (room_id, status)
);
```

## Usage Example

### Audience Member Flow

```javascript
// 1. User is in a private room as audience
socket.emit('request_to_speak', { roomId: 'room-1' }, (res) => {
  if (res.status === 'pending') {
    console.log('Request sent, waiting for host approval');
    console.log('Request ID:', res.data.requestId);
  }
});

// 2. Listen for approval/rejection
socket.on('event', ({ event, data }) => {
  if (event === 'speaker_request_approved') {
    console.log('You are now a speaker!');
  } else if (event === 'speaker_request_rejected') {
    console.log('Your request was rejected');
  }
});
```

### Host Flow

```javascript
// 1. Listen for speaker requests
socket.on('event', ({ event, data }) => {
  if (event === 'speaker_request_created') {
    console.log(`${data.nickname} wants to speak`);
    console.log('Request ID:', data.requestId);
  }
});

// 2. Approve or reject
socket.emit('approve_speaker_request', 
  { roomId: 'room-1', requestId: 'req-123' }, 
  (res) => {
    if (res.status === 'ok') {
      console.log('Request approved');
    }
  }
);
```

## Testing

A test page is available at `/test-speaker-request.html` to demonstrate the feature:

1. Open the page in two browser windows
2. Click "Setup as Host" in the first window
3. Click "Setup as Audience" in the second window
4. Click "Request to Speak" in the audience window
5. Click "Approve Speaker Request" in the host window
6. Watch the event log to see the flow

## Error Handling

All commands return error responses with descriptive messages:

```json
{
  "status": "error",
  "error": "User is already a speaker"
}
```

Common errors:
- `"User is not in this room"` - User hasn't joined the room
- `"User is already a speaker"` - User is already on mic
- `"Speaker request already pending"` - User has an active pending request
- `"Speaker request not found"` - Request ID doesn't exist
- `"Only the host can approve speaker requests"` - Non-host tried to approve
- `"Speaker slots are full"` - No available seats for speaker
- `"Room is closed"` - Room has been closed

## Implementation Notes

1. **Unique Constraint**: Only one pending request per user per room (enforced by database)
2. **Auto-promotion**: Public rooms automatically promote to speaker without approval
3. **Seat Assignment**: Server automatically assigns the next available seat (index > 0)
4. **Event Ordering**: `speaker_request_approved` is followed by `mic_changed` event
5. **Snapshot Recovery**: Hosts can see all pending requests when they reconnect via snapshot
