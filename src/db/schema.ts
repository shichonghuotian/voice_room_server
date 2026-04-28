import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { mysqlTable, varchar, tinyint, bigint, mysqlEnum, int, primaryKey, text as mysqlText } from 'drizzle-orm/mysql-core';

// ─── SQLite tables (dev / test) ───────────────────────────────────────────────

export const usersTable = sqliteTable('users', {
  id:        text('id').primaryKey(),
  nickname:  text('nickname').notNull(),
  avatarUrl: text('avatar_url').notNull().default(''),
  role:      text('role', { enum: ['free', 'vip'] }).notNull().default('free'),
  createdAt: integer('created_at').notNull(),
});

export const categoriesTable = sqliteTable('categories', {
  id:    text('id').primaryKey(),
  name:  text('name').notNull(),
  image: text('image'),
});

export const roomsTable = sqliteTable('rooms', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  ownerId:     text('owner_id').notNull(),
  categoryId:  text('category_id'),
  imageUrl:    text('image_url'),
  coverUrl:    text('cover_url'),
  maxSpeakers: integer('max_speakers').notNull().default(20),
  maxAudience: integer('max_audience').notNull().default(100),
  status:      text('status', { enum: ['draft', 'active', 'closed'] }).notNull().default('active'),
  privacy:     text('privacy', { enum: ['public', 'private'] }).notNull().default('private'),
  micOption:   text('mic_option', { enum: ['mic_and_comments', 'mic_only'] }).notNull().default('mic_and_comments'),
  announcement: text('announcement'),
  createdAt:   integer('created_at').notNull(),
});

export const roomMembersTable = sqliteTable('room_members', {
  id:         text('id').primaryKey(),
  roomId:     text('room_id').notNull(),
  userId:     text('user_id').notNull(),
  memberRole: text('member_role', { enum: ['speaker', 'audience'] }).notNull().default('audience'),
  seatIndex:  integer('seat_index').notNull().default(-1),
  joinedAt:   integer('joined_at').notNull(),
});

export const seatStateTable = sqliteTable('seat_state', {
  roomId:     text('room_id').notNull(),
  seatIndex:  integer('seat_index').notNull(),
  userId:     text('user_id'),
  nickname:   text('nickname'),
  status:     text('status', { enum: ['idle', 'occupied', 'locked', 'muted'] }).notNull().default('idle'),
  micEnabled: integer('mic_enabled', { mode: 'boolean' }).notNull().default(true),
});

export const joinRequestsTable = sqliteTable('join_requests', {
  id:        text('id').primaryKey(),
  roomId:    text('room_id').notNull(),
  userId:    text('user_id').notNull(),
  status:    text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
});

export const commentsTable = sqliteTable('comments', {
  id:        text('id').primaryKey(),
  roomId:    text('room_id').notNull(),
  userId:    text('user_id').notNull(),
  parentId:  text('parent_id'),
  content:   text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const speakerRequestsTable = sqliteTable('speaker_requests', {
  id:        text('id').primaryKey(),
  roomId:    text('room_id').notNull(),
  userId:    text('user_id').notNull(),
  status:    text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
});

// ─── MySQL tables (production) ────────────────────────────────────────────────

export const mysqlUsersTable = mysqlTable('users', {
  id:        varchar('id', { length: 36 }).primaryKey(),
  nickname:  varchar('nickname', { length: 64 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 512 }).notNull().default(''),
  role:      mysqlEnum('role', ['free', 'vip']).notNull().default('free'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const mysqlCategoriesTable = mysqlTable('categories', {
  id:    varchar('id', { length: 36 }).primaryKey(),
  name:  varchar('name', { length: 64 }).notNull(),
  image: varchar('image', { length: 512 }),
});

export const mysqlRoomsTable = mysqlTable('rooms', {
  id:          varchar('id', { length: 36 }).primaryKey(),
  name:        varchar('name', { length: 128 }).notNull(),
  description: mysqlText('description'),
  ownerId:     varchar('owner_id', { length: 36 }).notNull(),
  categoryId:  varchar('category_id', { length: 36 }),
  imageUrl:    varchar('image_url', { length: 512 }),
  coverUrl:    varchar('cover_url', { length: 512 }),
  maxSpeakers: int('max_speakers').notNull().default(20),
  maxAudience: int('max_audience').notNull().default(100),
  status:      mysqlEnum('status', ['draft', 'active', 'closed']).notNull().default('active'),
  privacy:     mysqlEnum('privacy', ['public', 'private']).notNull().default('private'),
  micOption:   mysqlEnum('mic_option', ['mic_and_comments', 'mic_only']).notNull().default('mic_and_comments'),
  announcement: mysqlText('announcement'),
  createdAt:   bigint('created_at', { mode: 'number' }).notNull(),
});

export const mysqlRoomMembersTable = mysqlTable('room_members', {
  id:         varchar('id', { length: 36 }).primaryKey(),
  roomId:     varchar('room_id', { length: 36 }).notNull(),
  userId:     varchar('user_id', { length: 36 }).notNull(),
  memberRole: mysqlEnum('member_role', ['speaker', 'audience']).notNull().default('audience'),
  seatIndex:  int('seat_index').notNull().default(-1),
  joinedAt:   bigint('joined_at', { mode: 'number' }).notNull(),
});

export const mysqlSeatStateTable = mysqlTable('seat_state', {
  roomId:     varchar('room_id', { length: 36 }).notNull(),
  seatIndex:  int('seat_index').notNull(),
  userId:     varchar('user_id', { length: 36 }),
  nickname:   varchar('nickname', { length: 64 }),
  status:     mysqlEnum('status', ['idle', 'occupied', 'locked', 'muted']).notNull().default('idle'),
  micEnabled: tinyint('mic_enabled').notNull().default(1),
}, (t) => [primaryKey({ columns: [t.roomId, t.seatIndex] })]);

export const mysqlJoinRequestsTable = mysqlTable('join_requests', {
  id:        varchar('id', { length: 36 }).primaryKey(),
  roomId:    varchar('room_id', { length: 36 }).notNull(),
  userId:    varchar('user_id', { length: 36 }).notNull(),
  status:    mysqlEnum('status', ['pending', 'approved', 'rejected']).notNull().default('pending'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const mysqlCommentsTable = mysqlTable('comments', {
  id:        varchar('id', { length: 36 }).primaryKey(),
  roomId:    varchar('room_id', { length: 36 }).notNull(),
  userId:    varchar('user_id', { length: 36 }).notNull(),
  parentId:  varchar('parent_id', { length: 36 }),
  content:   mysqlText('content').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

export const mysqlSpeakerRequestsTable = mysqlTable('speaker_requests', {
  id:        varchar('id', { length: 36 }).primaryKey(),
  roomId:    varchar('room_id', { length: 36 }).notNull(),
  userId:    varchar('user_id', { length: 36 }).notNull(),
  status:    mysqlEnum('status', ['pending', 'approved', 'rejected']).notNull().default('pending'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

// ─── Shared TypeScript types ───────────────────────────────────────────────────

export type User = {
  id: string;
  nickname: string;
  avatarUrl: string;
  role: 'free' | 'vip';
  createdAt: number;
};

export type Category = {
  id: string;
  name: string;
  image: string | null;
};

export type Room = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  categoryId: string | null;
  imageUrl: string | null;
  coverUrl: string | null;
  maxSpeakers: number;
  maxAudience: number;
  status: 'draft' | 'active' | 'closed';
  privacy: 'public' | 'private';
  micOption: 'mic_and_comments' | 'mic_only';
  announcement: string | null;
  createdAt: number;
};

export type RoomMember = {
  id: string;
  roomId: string;
  userId: string;
  memberRole: 'speaker' | 'audience';
  seatIndex: number;
  joinedAt: number;
};

export type SeatState = {
  roomId: string;
  seatIndex: number;
  userId: string | null;
  nickname: string | null;
  status: 'idle' | 'occupied' | 'locked' | 'muted';
  micEnabled: boolean;
};

export type JoinRequest = {
  id: string;
  roomId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
};

export type JoinRequestView = JoinRequest & { nickname: string; avatarUrl: string };

export type SpeakerRequest = {
  id: string;
  roomId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
};

export type SpeakerRequestView = SpeakerRequest & { nickname: string; avatarUrl: string };

export type Comment = {
  id: string;
  roomId: string;
  userId: string;
  parentId: string | null;
  content: string;
  createdAt: number;
};

export type CommentView = Comment & { nickname: string; avatarUrl: string; replyCount: number };
export type ReplyView   = Comment & { nickname: string; avatarUrl: string; parentNickname: string | null };
