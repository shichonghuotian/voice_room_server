import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { getDb, dbDriver } from '../db';
import { usersTable, mysqlUsersTable, type User } from '../db/schema';

function table() {
  return dbDriver === 'mysql' ? mysqlUsersTable : usersTable;
}

export const userService = {
  async create(input: { nickname: string; avatarUrl?: string }): Promise<User> {
    const { db } = getDb();
    const user: User = {
      id:        uuidv4(),
      nickname:  input.nickname.trim(),
      avatarUrl: input.avatarUrl ?? '',
      role:      'free',
      createdAt: Date.now(),
    };
    await db.insert(table()).values({
      id:        user.id,
      nickname:  user.nickname,
      avatarUrl: user.avatarUrl,
      role:      user.role,
      createdAt: user.createdAt,
    });
    return user;
  },

  async regAndLogin(input: {
    userId: string;
    nickname: string;
    avatarUrl?: string;
  }): Promise<User> {
    const { db } = getDb();
    const nickname = input.nickname.trim();
    if (!nickname) throw new Error('nickname is required');
    if (nickname.length > 32) throw new Error('nickname must be 32 characters or less');

    const avatarUrl = input.avatarUrl ?? '';
    const existing = await this.findById(input.userId);
    if (existing) {
      const updated: User = {
        ...existing,
        nickname,
        avatarUrl,
      };
      await db.update(table())
        .set({
          nickname: updated.nickname,
          avatarUrl: updated.avatarUrl,
        })
        .where(eq(table().id, input.userId));
      return updated;
    }

    const user: User = {
      id: input.userId,
      nickname,
      avatarUrl,
      role: 'free',
      createdAt: Date.now(),
    };
    await db.insert(table()).values({
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
    });
    return user;
  },

  async findById(id: string): Promise<User | undefined> {
    const { db } = getDb();
    const rows = await db.select().from(table()).where(eq(table().id, id));
    const row = rows[0];
    if (!row) return undefined;
    return {
      id:        row.id,
      nickname:  row.nickname,
      avatarUrl: row.avatarUrl ?? '',
      role:      row.role as 'free' | 'vip',
      createdAt: Number(row.createdAt),
    };
  },

  async list(): Promise<User[]> {
    const { db } = getDb();
    const rows = await db.select().from(table());
    return rows.map((row: Record<string, unknown>) => ({
      id:        row.id,
      nickname:  row.nickname,
      avatarUrl: row.avatarUrl ?? '',
      role:      row.role as 'free' | 'vip',
      createdAt: Number(row.createdAt),
    }));
  },
};
