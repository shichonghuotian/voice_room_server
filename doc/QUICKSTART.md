# Quick Start Guide

## Running the Server

### Development Mode (SQLite)
```bash
npm run dev:sqlite
```

### Development Mode (MySQL)
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000`

## Accessing the Demo

### Main Demo
- **Lobby**: http://localhost:3000/
- **Room**: http://localhost:3000/room.html (after joining a room)

### Speaker Request Test
- **Test Page**: http://localhost:3000/test-speaker-request.html

## API Documentation

- **REST API Docs**: http://localhost:3000/api-docs
- **WebSocket Docs**: http://localhost:3000/ws-docs

## Testing the Speaker Request Feature

### Option 1: Using the Test Page

1. Open http://localhost:3000/test-speaker-request.html
2. Click "Setup as Host" to create a room and join as host
3. Open the same page in another browser window
4. Click "Setup as Audience" to join the room as audience
5. Click "Request to Speak" to send a speaker request
6. In the host window, click "Approve Speaker Request"
7. Watch the event log to see the flow

### Option 2: Using the Main Demo

1. Open http://localhost:3000/
2. Login as "Alice" (host)
3. Create a new private room
4. Open http://localhost:3000/ in another window
5. Login as "Bob" (audience)
6. Join the room created by Alice
7. Click "Go on Mic" to request to speak
8. In Alice's window, approve the request
9. Bob will be promoted to speaker

## Key Features

### For Audience Members
- **Request to Speak**: Send a request to the host to become a speaker
- **Auto-promotion**: In public rooms, automatically become a speaker
- **Leave Mic**: Step down from speaker role

### For Hosts
- **Approve Requests**: Accept speaker requests from audience members
- **Reject Requests**: Decline speaker requests
- **View Pending**: See all pending speaker requests in the room snapshot
- **Manage Speakers**: Kick speakers, mute/unmute, lock/unlock seats

## Socket.IO Commands

### Audience Commands
```javascript
// Request to speak
socket.emit('request_to_speak', { roomId: 'room-1' }, (res) => {
  console.log(res.status); // 'ok' or 'pending'
});

// Leave mic
socket.emit('leave_seat', { roomId: 'room-1' }, (res) => {
  console.log(res.status); // 'ok'
});
```

### Host Commands
```javascript
// Approve speaker request
socket.emit('approve_speaker_request', 
  { roomId: 'room-1', requestId: 'req-123' }, 
  (res) => {
    console.log(res.status); // 'ok'
  }
);

// Reject speaker request
socket.emit('reject_speaker_request', 
  { roomId: 'room-1', requestId: 'req-123' }, 
  (res) => {
    console.log(res.status); // 'ok'
  }
);

// Kick member
socket.emit('kick_member', 
  { roomId: 'room-1', targetUserId: 'user-bob' }, 
  (res) => {
    console.log(res.status); // 'ok'
  }
);
```

## Events

### Listen for Events
```javascript
socket.on('event', ({ event, data }) => {
  switch (event) {
    case 'speaker_request_created':
      console.log(`${data.nickname} wants to speak`);
      break;
    case 'speaker_request_approved':
      console.log(`${data.userId} is now a speaker`);
      break;
    case 'speaker_request_rejected':
      console.log(`${data.userId}'s request was rejected`);
      break;
    case 'mic_changed':
      console.log(`${data.nickname} is now ${data.memberRole}`);
      break;
    case 'user_joined':
      console.log(`${data.nickname} joined`);
      break;
    case 'member_kicked':
      console.log(`${data.nickname} was kicked`);
      break;
  }
});
```

## Database

### SQLite (Development)
- File: `data/voice_room.db` (auto-created)
- No setup required

### MySQL (Production)
- Run: `mysql -u root voice_room < src/db/mysql-schema.sql`
- Configure in `.env`:
  ```
  DB_DRIVER=mysql
  DB_HOST=localhost
  DB_USER=root
  DB_PASSWORD=password
  DB_NAME=voice_room
  ```

## Troubleshooting

### Server won't start
- Check if port 3000 is already in use
- Check `.env` file for correct database configuration
- Check database connection

### Socket.IO connection fails
- Check if server is running
- Check browser console for errors
- Verify CORS settings

### Speaker request not working
- Ensure room is private (for approval flow)
- Check that user is in the room
- Check that user is not already a speaker
- Check that no pending request exists

## Documentation

- [Speaker Request Feature](./speaker-request.md)
- [Room API](./room.md)
- [Design Document](./design-v2.md)
- [Client Guide](./client-guide.md)
