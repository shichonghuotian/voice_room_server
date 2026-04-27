import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app';
import { setupTestDb } from './setup';

describe('POST /users', () => {
  before(async () => { await setupTestDb(); });

  it('creates a user with a nickname', async () => {
    const res = await request(app).post('/users').send({ nickname: 'Alice' });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.nickname, 'Alice');
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.role, 'free');
  });

  it('returns 400 when nickname is missing', async () => {
    const res = await request(app).post('/users').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it('returns 400 when nickname is too long', async () => {
    const res = await request(app).post('/users').send({ nickname: 'a'.repeat(33) });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });
});

describe('GET /users/:id', () => {
  before(async () => { await setupTestDb(); });

  it('returns the user by id', async () => {
    const createRes = await request(app).post('/users').send({ nickname: 'Bob' });
    const userId = createRes.body.data.id;

    const res = await request(app).get(`/users/${userId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.nickname, 'Bob');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/users/nonexistent-id');
    assert.equal(res.status, 404);
  });
});
