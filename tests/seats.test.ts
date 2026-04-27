import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app';
import { setupTestDb } from './setup';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createUser(nickname: string) {
  const res = await request(app).post('/users').send({ nickname });
  return res.body.data as { id: string; nickname: string };
}

async function createRoom(ownerId: string, maxSpeakers = 4) {
  const res = await request(app)
    .post('/rooms')
    .send({ name: 'Seat Test Room', ownerId, maxSpeakers, requireApproval: false });
  return res.body.data as { id: string; ownerId: string; maxSpeakers: number };
}

async function joinRoom(roomId: string, userId: string) {
  await request(app).post(`/rooms/${roomId}/join`).send({ userId });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /rooms/:id/seats', () => {
  before(async () => { await setupTestDb(); });

  it('returns seat list after room creation', async () => {
    const owner = await createUser('Owner');
    const room  = await createRoom(owner.id, 4);

    const res = await request(app).get(`/rooms/${room.id}/seats`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 4); // maxSpeakers seats pre-created
    assert.equal(res.body.data[0].seatIndex, 0);
    assert.equal(res.body.data[0].status, 'idle');
  });
});

describe('POST /rooms/:id/seats/:idx/take', () => {
  before(async () => { await setupTestDb(); });

  it('user can take an idle seat', async () => {
    const owner = await createUser('Owner');
    const user  = await createUser('Alice');
    const room  = await createRoom(owner.id, 4);
    await joinRoom(room.id, user.id);

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/1/take`)
      .send({ userId: user.id });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.memberRole, 'speaker');
    assert.equal(res.body.data.seatIndex, 1);
  });

  it('returns 400 when seat is already occupied by another user', async () => {
    const owner = await createUser('Owner');
    const user1 = await createUser('Alice');
    const user2 = await createUser('Bob');
    const room  = await createRoom(owner.id, 4);
    await joinRoom(room.id, user1.id);
    await joinRoom(room.id, user2.id);

    await request(app).post(`/rooms/${room.id}/seats/1/take`).send({ userId: user1.id });

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/1/take`)
      .send({ userId: user2.id });

    assert.equal(res.status, 400);
  });

  it('returns 400 when user is not in the room', async () => {
    const owner = await createUser('Owner');
    const user  = await createUser('Alice');
    const room  = await createRoom(owner.id, 4);

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/1/take`)
      .send({ userId: user.id });

    // 400 or 404 — user exists but is not a member
    assert.ok(res.status === 400 || res.status === 404);
  });
});

describe('POST /rooms/:id/seats/leave', () => {
  before(async () => { await setupTestDb(); });

  it('user can leave their seat', async () => {
    const owner = await createUser('Owner');
    const user  = await createUser('Alice');
    const room  = await createRoom(owner.id, 4);
    await joinRoom(room.id, user.id);
    await request(app).post(`/rooms/${room.id}/seats/1/take`).send({ userId: user.id });

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/leave`)
      .send({ userId: user.id });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.memberRole, 'audience');
    assert.equal(res.body.data.seatIndex, -1);

    // Seat should be idle again
    const seatsRes = await request(app).get(`/rooms/${room.id}/seats`);
    const seat1 = seatsRes.body.data.find((s: { seatIndex: number }) => s.seatIndex === 1);
    assert.equal(seat1.status, 'idle');
  });
});

describe('POST /rooms/:id/seats/:idx/lock', () => {
  before(async () => { await setupTestDb(); });

  it('owner can lock a seat', async () => {
    const owner = await createUser('Owner');
    const room  = await createRoom(owner.id, 4);

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/2/lock`)
      .send({ userId: owner.id, locked: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'locked');
  });

  it('non-owner cannot lock a seat', async () => {
    const owner = await createUser('Owner');
    const user  = await createUser('Alice');
    const room  = await createRoom(owner.id, 4);
    await joinRoom(room.id, user.id);

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/2/lock`)
      .send({ userId: user.id, locked: true });

    assert.equal(res.status, 403);
  });

  it('user cannot take a locked seat', async () => {
    const owner = await createUser('Owner');
    const user  = await createUser('Alice');
    const room  = await createRoom(owner.id, 4);
    await joinRoom(room.id, user.id);
    await request(app).post(`/rooms/${room.id}/seats/2/lock`).send({ userId: owner.id, locked: true });

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/2/take`)
      .send({ userId: user.id });

    assert.equal(res.status, 400);
  });
});

describe('POST /rooms/:id/seats/:idx/mute', () => {
  before(async () => { await setupTestDb(); });

  it('owner can mute a seat', async () => {
    const owner = await createUser('Owner');
    const room  = await createRoom(owner.id, 4);

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/1/mute`)
      .send({ userId: owner.id, muted: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.micEnabled, false);
  });

  it('non-owner cannot mute a seat', async () => {
    const owner = await createUser('Owner');
    const user  = await createUser('Alice');
    const room  = await createRoom(owner.id, 4);
    await joinRoom(room.id, user.id);

    const res = await request(app)
      .post(`/rooms/${room.id}/seats/1/mute`)
      .send({ userId: user.id, muted: true });

    assert.equal(res.status, 403);
  });
});

describe('PATCH /rooms/:id', () => {
  before(async () => { await setupTestDb(); });

  it('owner can update room name', async () => {
    const owner = await createUser('Owner');
    const room  = await createRoom(owner.id);

    const res = await request(app)
      .patch(`/rooms/${room.id}`)
      .send({ userId: owner.id, name: 'New Name' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'New Name');
  });

  it('owner can set announcement', async () => {
    const owner = await createUser('Owner');
    const room  = await createRoom(owner.id);

    const res = await request(app)
      .patch(`/rooms/${room.id}`)
      .send({ userId: owner.id, announcement: 'Welcome!' });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.announcement, 'Welcome!');
  });

  it('non-owner cannot update room', async () => {
    const owner = await createUser('Owner');
    const other = await createUser('Other');
    const room  = await createRoom(owner.id);

    const res = await request(app)
      .patch(`/rooms/${room.id}`)
      .send({ userId: other.id, name: 'Hacked' });

    assert.equal(res.status, 403);
  });
});
