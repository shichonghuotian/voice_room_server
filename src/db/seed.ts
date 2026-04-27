/**
 * Seed script — inserts default test users, categories, and rooms.
 * Run: npx ts-node src/db/seed.ts
 * Safe to run multiple times (skips existing records by id).
 */
import { config } from '../config';
config.load();

import { initDb, getDb, dbDriver } from './index';
import { runSqliteMigrations } from './migrate';
import { usersTable, mysqlUsersTable, categoriesTable, mysqlCategoriesTable, roomsTable, mysqlRoomsTable, seatStateTable, mysqlSeatStateTable } from './schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const SEED_USERS = [
  { id: 'user-alice',   nickname: 'Alice',   avatarUrl: '' },
  { id: 'user-bob',     nickname: 'Bob',     avatarUrl: '' },
  { id: 'user-carol',   nickname: 'Carol',   avatarUrl: '' },
  { id: 'user-dave',    nickname: 'Dave',    avatarUrl: '' },
  { id: 'user-eve',     nickname: 'Eve',     avatarUrl: '' },
  { id: 'user-frank',   nickname: 'Frank',   avatarUrl: '' },
];

const SEED_CATEGORIES = [
  { id: 'cat-culture',    name: 'Culture',    image: null },
  { id: 'cat-music',      name: 'Music',      image: null },
  { id: 'cat-technology', name: 'Technology', image: null },
  { id: 'cat-games',      name: 'Games',      image: null },
  { id: 'cat-talk',       name: 'Talk',       image: null },
];

const SEED_ROOMS = [
  { id: 'room-001', name: 'Friday Music Night',    ownerId: 'user-alice', categoryId: 'cat-music',      description: 'Chill music chat every Friday' },
  { id: 'room-002', name: 'Tech Talk Weekly',      ownerId: 'user-bob',   categoryId: 'cat-technology', description: 'Latest in tech and AI' },
  { id: 'room-003', name: 'Game Night',            ownerId: 'user-carol', categoryId: 'cat-games',      description: 'Gaming discussion and tips' },
  { id: 'room-004', name: 'Culture Exchange',      ownerId: 'user-dave',  categoryId: 'cat-culture',    description: 'Share your culture and stories' },
  { id: 'room-005', name: 'Open Talk',             ownerId: 'user-eve',   categoryId: 'cat-talk',       description: 'Talk about anything' },
  { id: 'room-006', name: 'Indie Music Lounge',    ownerId: 'user-frank', categoryId: 'cat-music',      description: 'Indie and alternative music' },
];

async function seed() {
  await initDb();

  if (dbDriver !== 'mysql') {
    runSqliteMigrations();
  }

  const { db } = getDb();
  const userTable = dbDriver === 'mysql' ? mysqlUsersTable : usersTable;
  const catTable  = dbDriver === 'mysql' ? mysqlCategoriesTable : categoriesTable;
  const roomTable = dbDriver === 'mysql' ? mysqlRoomsTable : roomsTable;
  const seatTable = dbDriver === 'mysql' ? mysqlSeatStateTable : seatStateTable;

  let inserted = 0;

  for (const u of SEED_USERS) {
    const existing = await db.select().from(userTable).where(eq(userTable.id, u.id));
    if (existing[0]) continue;
    await db.insert(userTable).values({ id: u.id, nickname: u.nickname, avatarUrl: u.avatarUrl, role: 'free', createdAt: Date.now() });
    inserted++;
    console.log(`  ✓ User: ${u.nickname}`);
  }

  for (const c of SEED_CATEGORIES) {
    const existing = await db.select().from(catTable).where(eq(catTable.id, c.id));
    if (existing[0]) continue;
    await db.insert(catTable).values(c);
    inserted++;
    console.log(`  ✓ Category: ${c.name}`);
  }

  const maxSpeakers = 20;
  for (const r of SEED_ROOMS) {
    const existing = await db.select().from(roomTable).where(eq(roomTable.id, r.id));
    if (existing[0]) continue;
    await db.insert(roomTable).values({
      id: r.id, name: r.name, description: r.description,
      ownerId: r.ownerId, categoryId: r.categoryId,
      imageUrl: null, coverUrl: null,
      maxSpeakers, maxAudience: 100,
      status: 'active', privacy: 'public', micOption: 'mic_and_comments',
      announcement: null, createdAt: Date.now(),
    });
    // Pre-create seats
    for (let i = 0; i < maxSpeakers; i++) {
      await db.insert(seatTable).values({
        roomId: r.id, seatIndex: i,
        userId: null, nickname: null, status: 'idle',
        micEnabled: dbDriver === 'mysql' ? 1 as unknown as boolean : true,
      });
    }
    inserted++;
    console.log(`  ✓ Room: ${r.name}`);
  }

  if (inserted === 0) console.log('  All seed data already exists.');
  else console.log(`\nSeeded ${inserted} record(s).`);

  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
