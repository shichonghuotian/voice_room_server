import { v4 as uuidv4 } from 'uuid';
import { eq, and, lt, isNull, sql } from 'drizzle-orm';
import { getDb, dbDriver } from '../db';
import {
  commentsTable, mysqlCommentsTable,
  usersTable, mysqlUsersTable,
  roomMembersTable, mysqlRoomMembersTable,
  roomsTable, mysqlRoomsTable,
  type CommentView, type ReplyView,
} from '../db/schema';
import { roomEventBus } from '../realtime/roomEventBus';
import type { MessagePayload } from '../types';

const t = {
  comments: () => dbDriver === 'mysql' ? mysqlCommentsTable  : commentsTable,
  users:    () => dbDriver === 'mysql' ? mysqlUsersTable     : usersTable,
  members:  () => dbDriver === 'mysql' ? mysqlRoomMembersTable : roomMembersTable,
  rooms:    () => dbDriver === 'mysql' ? mysqlRoomsTable     : roomsTable,
};

export const commentService = {
  async post(input: { roomId: string; userId: string; content: string; parentId?: string }): Promise<CommentView | ReplyView> {
    const { roomId, userId, parentId } = input;
    const content = input.content.trim();
    if (!content) throw new Error('Content cannot be empty');
    if (content.length > 500) throw new Error('Content must be 500 characters or less');

    const { db } = getDb();

    const roomRows = await db.select().from(t.rooms()).where(eq(t.rooms().id, roomId));
    if (!roomRows[0]) throw new Error('Room not found');
    if ((roomRows[0] as Record<string, unknown>).status === 'closed') throw new Error('Room is closed');

    const userRows = await db.select().from(t.users()).where(eq(t.users().id, userId));
    if (!userRows[0]) throw new Error('User not found');
    const user = userRows[0] as Record<string, unknown>;

    const memberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (!memberRows[0]) throw new Error('You must join the room before commenting');

    let parentNickname: string | null = null;
    if (parentId) {
      const parentRows = await db.select({ id: t.comments().id, parentId: t.comments().parentId, userId: t.comments().userId })
        .from(t.comments()).where(eq(t.comments().id, parentId));
      if (!parentRows[0]) throw new Error('Parent comment not found');
      if ((parentRows[0] as Record<string, unknown>).parentId) throw new Error('Cannot reply to a reply');
      const parentUserRows = await db.select().from(t.users())
        .where(eq(t.users().id, (parentRows[0] as Record<string, unknown>).userId as string));
      parentNickname = parentUserRows[0] ? (parentUserRows[0] as Record<string, unknown>).nickname as string : null;
    }

    const id = uuidv4();
    const createdAt = Date.now();
    await db.insert(t.comments()).values({ id, roomId, userId, parentId: parentId ?? null, content, createdAt });

    const payload: MessagePayload = {
      id, roomId, userId,
      nickname: user.nickname as string,
      avatarUrl: (user.avatarUrl ?? user.avatar_url ?? '') as string,
      parentId: parentId ?? null,
      parentNickname,
      content, createdAt,
    };
    roomEventBus.publish({ roomId, event: 'message', data: payload });

    if (parentId) {
      const reply: ReplyView = {
        id, roomId, userId, parentId, content, createdAt,
        nickname: user.nickname as string,
        avatarUrl: (user.avatarUrl ?? user.avatar_url ?? '') as string,
        parentNickname,
      };
      return reply;
    }

    const comment: CommentView = {
      id, roomId, userId, parentId: null, content, createdAt,
      nickname: user.nickname as string,
      avatarUrl: (user.avatarUrl ?? user.avatar_url ?? '') as string,
      replyCount: 0,
    };
    return comment;
  },

  async listTopLevel(input: { roomId: string; limit?: number; before?: number }): Promise<CommentView[]> {
    const { db } = getDb();
    const limit = Math.min(input.limit ?? 30, 100);
    const before = input.before ?? Date.now() + 1;

    const rows = await db
      .select({
        id: t.comments().id, roomId: t.comments().roomId, userId: t.comments().userId,
        parentId: t.comments().parentId, content: t.comments().content, createdAt: t.comments().createdAt,
        nickname: t.users().nickname, avatarUrl: t.users().avatarUrl,
      })
      .from(t.comments())
      .innerJoin(t.users(), eq(t.comments().userId, t.users().id))
      .where(and(
        eq(t.comments().roomId, input.roomId),
        isNull(t.comments().parentId),
        lt(t.comments().createdAt, before),
      ))
      .orderBy(sql`${t.comments().createdAt} DESC`)
      .limit(limit);

    // Get reply counts
    const result: CommentView[] = [];
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const replyRows = await db.select({ count: sql<number>`count(*)` })
        .from(t.comments()).where(eq(t.comments().parentId, r.id as string));
      result.push({
        id: r.id as string, roomId: r.roomId as string, userId: r.userId as string,
        parentId: null, content: r.content as string, createdAt: Number(r.createdAt),
        nickname: r.nickname as string, avatarUrl: (r.avatarUrl ?? '') as string,
        replyCount: Number(replyRows[0]?.count ?? 0),
      });
    }
    return result;
  },

  async listReplies(commentId: string): Promise<ReplyView[]> {
    const { db } = getDb();
    const parentRows = await db.select().from(t.comments()).where(eq(t.comments().id, commentId));
    if (!parentRows[0]) throw new Error('Comment not found');
    if ((parentRows[0] as Record<string, unknown>).parentId) throw new Error('Can only fetch replies for top-level comments');

    const parentUserRows = await db.select().from(t.users())
      .where(eq(t.users().id, (parentRows[0] as Record<string, unknown>).userId as string));
    const parentNickname = parentUserRows[0] ? (parentUserRows[0] as Record<string, unknown>).nickname as string : null;

    const rows = await db
      .select({
        id: t.comments().id, roomId: t.comments().roomId, userId: t.comments().userId,
        parentId: t.comments().parentId, content: t.comments().content, createdAt: t.comments().createdAt,
        nickname: t.users().nickname, avatarUrl: t.users().avatarUrl,
      })
      .from(t.comments())
      .innerJoin(t.users(), eq(t.comments().userId, t.users().id))
      .where(eq(t.comments().parentId, commentId))
      .orderBy(sql`${t.comments().createdAt} ASC`);

    return rows.map((row: Record<string, unknown>) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string, roomId: r.roomId as string, userId: r.userId as string,
        parentId: commentId, content: r.content as string, createdAt: Number(r.createdAt),
        nickname: r.nickname as string, avatarUrl: (r.avatarUrl ?? '') as string,
        parentNickname,
      };
    });
  },

  async findById(id: string): Promise<CommentView | undefined> {
    const { db } = getDb();
    const rows = await db.select({
      id: t.comments().id, roomId: t.comments().roomId, userId: t.comments().userId,
      parentId: t.comments().parentId, content: t.comments().content, createdAt: t.comments().createdAt,
      nickname: t.users().nickname, avatarUrl: t.users().avatarUrl,
    })
    .from(t.comments())
    .innerJoin(t.users(), eq(t.comments().userId, t.users().id))
    .where(eq(t.comments().id, id));
    if (!rows[0]) return undefined;
    const r = rows[0] as Record<string, unknown>;
    return {
      id: r.id as string, roomId: r.roomId as string, userId: r.userId as string,
      parentId: (r.parentId as string | null) ?? null, content: r.content as string,
      createdAt: Number(r.createdAt), nickname: r.nickname as string,
      avatarUrl: (r.avatarUrl ?? '') as string, replyCount: 0,
    };
  },
};
