import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app';
import { setupTestDb } from './setup';

describe('POST /auth/regAndLogin', () => {
  before(async () => {
    await setupTestDb();
  });

  it('creates a user when it does not exist', async () => {
    const res = await request(app)
      .post('/auth/regAndLogin')
      .send({
        userId: 'user-alice',
        nickname: 'Alice',
        avatarUrl: 'https://example.com/alice.png',
        source: 'mainapp',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, 'user-alice');
    assert.equal(res.body.data.nickname, 'Alice');
    assert.equal(res.body.data.avatarUrl, 'https://example.com/alice.png');
  });

  it('updates an existing user and keeps the same id', async () => {
    await request(app)
      .post('/auth/regAndLogin')
      .send({
        userId: 'user-bob',
        nickname: 'Bob',
      });

    const res = await request(app)
      .post('/auth/regAndLogin')
      .send({
        userId: 'user-bob',
        nickname: 'Bob Updated',
        avatarUrl: 'https://example.com/bob.png',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, 'user-bob');
    assert.equal(res.body.data.nickname, 'Bob Updated');
    assert.equal(res.body.data.avatarUrl, 'https://example.com/bob.png');
  });
});
