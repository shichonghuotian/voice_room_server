import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, dbDriver } from '../db';
import {
  roomsTable, mysqlRoomsTable,
  roomMembersTable, mysqlRoomMembersTable,
  seatStateTable, mysqlSeatStateTable,
  joinRequestsTable, mysqlJoinRequestsTable,
  speakerRequestsTable, mysqlSpeakerRequestsTable,
  usersTable, mysqlUsersTable,
  categoriesTable, mysqlCategoriesTable,
  type Room, type RoomMember, type SeatState, type JoinRequest, type JoinRequestView,
  type SpeakerRequestView, type User, type Category,
} from '../db/schema';
import { roomEventBus } from '../realtime/roomEventBus';
import { roomWsManager } from '../ws/roomWsManager';
import { seatCache } from './seatCacheService';

// ─── Table selectors ──────────────────────────────────────────────────────────

const t = {
  rooms:           () => dbDriver === 'mysql' ? mysqlRoomsTable           : roomsTable,
  members:         () => dbDriver === 'mysql' ? mysqlRoomMembersTable      : roomMembersTable,
  seats:           () => dbDriver === 'mysql' ? mysqlSeatStateTable        : seatStateTable,
  joinRequests:    () => dbDriver === 'mysql' ? mysqlJoinRequestsTable     : joinRequestsTable,
  speakerRequests: () => dbDriver === 'mysql' ? mysqlSpeakerRequestsTable  : speakerRequestsTable,
  users:           () => dbDriver === 'mysql' ? mysqlUsersTable            : usersTable,
  categories:      () => dbDriver === 'mysql' ? mysqlCategoriesTable       : categoriesTable,
};

// ─── Row mappers ──────────────────────────────────────────────────────────────

function toRoom(r: Record<string, unknown>): Room {
  return {
    id:          r.id as string,
    name:        r.name as string,
    description: (r.description as string | null) ?? null,
    ownerId:     (r.ownerId ?? r.owner_id) as string,
    categoryId:  (r.categoryId ?? r.category_id ?? null) as string | null,
    imageUrl:    (r.imageUrl ?? r.image_url ?? null) as string | null,
    coverUrl:    (r.coverUrl ?? r.cover_url ?? null) as string | null,
    maxSpeakers: Number(r.maxSpeakers ?? r.max_speakers ?? 8),
    maxAudience: Number(r.maxAudience ?? r.max_audience ?? 100),
    status:      r.status as 'draft' | 'active' | 'closed',
    privacy:     r.privacy as 'public' | 'private',
    micOption:   (r.micOption ?? r.mic_option ?? 'mic_and_comments') as 'mic_and_comments' | 'mic_only',
    announcement: (r.announcement as string | null) ?? null,
    createdAt:   Number(r.createdAt ?? r.created_at),
  };
}

function toMember(r: Record<string, unknown>): RoomMember {
  return {
    id:         r.id as string,
    roomId:     (r.roomId ?? r.room_id) as string,
    userId:     (r.userId ?? r.user_id) as string,
    memberRole: (r.memberRole ?? r.member_role) as 'speaker' | 'audience',
    seatIndex:  Number(r.seatIndex ?? r.seat_index ?? -1),
    joinedAt:   Number(r.joinedAt ?? r.joined_at),
  };
}

function toSeat(r: Record<string, unknown>): SeatState {
  return {
    roomId:     (r.roomId ?? r.room_id) as string,
    seatIndex:  Number(r.seatIndex ?? r.seat_index),
    userId:     (r.userId ?? r.user_id ?? null) as string | null,
    nickname:   (r.nickname as string | null) ?? null,
    status:     r.status as SeatState['status'],
    micEnabled: Boolean(r.micEnabled ?? r.mic_enabled ?? true),
  };
}

function toUser(r: Record<string, unknown>): User {
  return {
    id:        r.id as string,
    nickname:  r.nickname as string,
    avatarUrl: (r.avatarUrl ?? r.avatar_url ?? '') as string,
    role:      r.role as 'free' | 'vip',
    createdAt: Number(r.createdAt ?? r.created_at),
  };
}

// ─── Publish helper ───────────────────────────────────────────────────────────

function publish(roomId: string, event: Parameters<typeof roomEventBus.publish>[0]['event'], data: unknown, targetUserId?: string): void {
  roomEventBus.publish({ roomId, event, data, targetUserId } as Parameters<typeof roomEventBus.publish>[0]);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface RoomSeat {
  seatIndex: number;
  userId: string;
  nickname: string;
  avatarUrl: string;
  micEnabled: boolean;
  status: SeatState['status'];
  isHost: boolean;
}

export interface RoomDetail {
  id: string;
  title: string;
  description: string | null;
  status: Room['status'];
  privacy: Room['privacy'];
  micOption: Room['micOption'];
  imageUrl: string | null;
  coverUrl: string | null;
  announcement: string | null;
  createdAt: number;
  host: { userId: string; nickname: string; avatarUrl: string };
  category: Category | null;
  speakers: { max: number; count: number; seats: RoomSeat[] };
  audience: { max: number; count: number; members: Array<{ userId: string; nickname: string; avatarUrl: string }> };
  onlineCount: number;
  pendingSpeakerRequests: SpeakerRequestView[];
}

export interface RoomCard {
  id: string;
  title: string;
  description: string | null;
  status: Room['status'];
  privacy: Room['privacy'];
  micOption: Room['micOption'];
  coverUrl: string | null;
  category: Category | null;
  host: { userId: string; nickname: string; avatarUrl: string };
  speakerCount: number;
  audienceCount: number;
  onlineCount: number;
  maxSpeakers: number;
  maxAudience: number;
}

export const roomService = {

  // ── Room CRUD ────────────────────────────────────────────────────────────────

  async create(input: {
    name: string;
    ownerId: string;
    description?: string;
    categoryId?: string;
    imageUrl?: string;
    coverUrl?: string;
    maxSpeakers?: number;
    maxAudience?: number;
    privacy?: 'public' | 'private';
    micOption?: 'mic_and_comments' | 'mic_only';
  }): Promise<Room> {
    const { db } = getDb();
    const ownerRows = await db.select().from(t.users()).where(eq(t.users().id, input.ownerId));
    if (!ownerRows[0]) throw new Error('User not found');

    const maxSpeakers = Math.min(input.maxSpeakers ?? 20, 20);
    const maxAudience = Math.min(input.maxAudience ?? 100, 100);
    const room: Room = {
      id: uuidv4(),
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      ownerId: input.ownerId,
      categoryId: input.categoryId ?? null,
      imageUrl: input.imageUrl ?? null,
      coverUrl: input.coverUrl ?? null,
      maxSpeakers,
      maxAudience,
      status: 'active',
      privacy: input.privacy ?? 'private',
      micOption: input.micOption ?? 'mic_and_comments',
      announcement: null,
      createdAt: Date.now(),
    };

    await db.insert(t.rooms()).values({
      id: room.id, name: room.name, description: room.description,
      ownerId: room.ownerId, categoryId: room.categoryId,
      imageUrl: room.imageUrl, coverUrl: room.coverUrl,
      maxSpeakers: room.maxSpeakers, maxAudience: room.maxAudience,
      status: room.status, privacy: room.privacy, micOption: room.micOption,
      announcement: null, createdAt: room.createdAt,
    });

    for (let i = 0; i < maxSpeakers; i++) {
      await db.insert(t.seats()).values({
        roomId: room.id, seatIndex: i,
        userId: null, nickname: null, status: 'idle',
        micEnabled: dbDriver === 'mysql' ? 1 as unknown as boolean : true,
      });
    }
    return room;
  },

  async findById(id: string): Promise<Room | undefined> {
    const { db } = getDb();
    const rows = await db.select().from(t.rooms()).where(eq(t.rooms().id, id));
    return rows[0] ? toRoom(rows[0] as Record<string, unknown>) : undefined;
  },

  async listActive(): Promise<Room[]> {
    const { db } = getDb();
    const rows = await db.select().from(t.rooms()).where(eq(t.rooms().status, 'active'));
    return rows.map((r: Record<string, unknown>) => toRoom(r as Record<string, unknown>));
  },

  async listByCategory(categoryId: string): Promise<RoomCard[]> {
    const { db } = getDb();
    const rows = await db.select().from(t.rooms())
      .where(and(eq(t.rooms().status, 'active'), eq(t.rooms().categoryId, categoryId)))
      .orderBy(desc(t.rooms().createdAt))
      .limit(30);
    return this._toRoomCards(rows as Record<string, unknown>[]);
  },

  async getRecommended(): Promise<RoomCard[]> {
    const { db } = getDb();
    const rows = await db.select().from(t.rooms())
      .where(eq(t.rooms().status, 'active'))
      .orderBy(desc(t.rooms().createdAt))
      .limit(30);
    return this._toRoomCards(rows as Record<string, unknown>[]);
  },

  async _toRoomCards(rows: Record<string, unknown>[]): Promise<RoomCard[]> {
    const { db } = getDb();
    const cards: RoomCard[] = [];
    for (const r of rows) {
      const room = toRoom(r as Record<string, unknown>);
      const [hostRows, catRows, memberRows] = await Promise.all([
        db.select().from(t.users()).where(eq(t.users().id, room.ownerId)),
        room.categoryId ? db.select().from(t.categories()).where(eq(t.categories().id, room.categoryId)) : Promise.resolve([]),
        db.select().from(t.members()).where(eq(t.members().roomId, room.id)),
      ]);
      const host = hostRows[0] ? toUser(hostRows[0] as Record<string, unknown>) : null;
      const cat  = catRows[0]  ? (catRows[0] as Record<string, unknown>) : null;
      const speakers  = (memberRows as Record<string, unknown>[]).filter(m => m.memberRole === 'speaker' || m.member_role === 'speaker').length;
      const audiences = (memberRows as Record<string, unknown>[]).filter(m => m.memberRole === 'audience' || m.member_role === 'audience').length;
      cards.push({
        id: room.id, title: room.name, description: room.description,
        status: room.status, privacy: room.privacy, micOption: room.micOption,
        coverUrl: room.coverUrl,
        category: cat ? { id: cat.id as string, name: cat.name as string, image: (cat.image as string | null) ?? null } : null,
        host: host ? { userId: host.id, nickname: host.nickname, avatarUrl: host.avatarUrl } : { userId: room.ownerId, nickname: 'Unknown', avatarUrl: '' },
        speakerCount: speakers,
        audienceCount: audiences,
        onlineCount: roomWsManager.getClientCount(room.id),
        maxSpeakers: room.maxSpeakers,
        maxAudience: room.maxAudience,
      });
    }
    return cards;
  },

  async close(roomId: string, requesterId: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== requesterId) throw new Error('Only the owner can close the room');
    if (room.status === 'closed') throw new Error('Room is already closed');
    const { db } = getDb();
    await db.update(t.rooms()).set({ status: 'closed' }).where(eq(t.rooms().id, roomId));
    publish(roomId, 'room_closed', { roomId });
  },

  async updateRoom(roomId: string, requesterId: string, fields: {
    name?: string; announcement?: string; description?: string;
    categoryId?: string; imageUrl?: string; coverUrl?: string;
    privacy?: 'public' | 'private'; micOption?: 'mic_and_comments' | 'mic_only';
  }): Promise<Room> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== requesterId) throw new Error('Only the owner can update the room');
    if (room.status === 'closed') throw new Error('Room is closed');
    const { db } = getDb();
    const updates: Record<string, unknown> = {};
    if (fields.name)                    updates.name = fields.name.trim();
    if (fields.announcement !== undefined) updates.announcement = fields.announcement;
    if (fields.description !== undefined)  updates.description = fields.description;
    if (fields.categoryId !== undefined)   updates.categoryId = fields.categoryId;
    if (fields.imageUrl !== undefined)     updates.imageUrl = fields.imageUrl;
    if (fields.coverUrl !== undefined)     updates.coverUrl = fields.coverUrl;
    if (fields.privacy)                    updates.privacy = fields.privacy;
    if (fields.micOption)                  updates.micOption = fields.micOption;
    await db.update(t.rooms()).set(updates).where(eq(t.rooms().id, roomId));
    return (await this.findById(roomId))!;
  },

  async getDetail(roomId: string): Promise<RoomDetail | undefined> {
    const room = await this.findById(roomId);
    if (!room) return undefined;
    const { db } = getDb();

    const [hostRows, catRows, memberRows, seatRows, speakerReqRows] = await Promise.all([
      db.select().from(t.users()).where(eq(t.users().id, room.ownerId)),
      room.categoryId ? db.select().from(t.categories()).where(eq(t.categories().id, room.categoryId)) : Promise.resolve([]),
      db.select({
        id: t.members().id, roomId: t.members().roomId, userId: t.members().userId,
        memberRole: t.members().memberRole, seatIndex: t.members().seatIndex, joinedAt: t.members().joinedAt,
        nickname: t.users().nickname, avatarUrl: t.users().avatarUrl,
      }).from(t.members()).innerJoin(t.users(), eq(t.members().userId, t.users().id)).where(eq(t.members().roomId, roomId)),
      db.select().from(t.seats()).where(and(eq(t.seats().roomId, roomId), eq(t.seats().status, 'occupied'))),
      db.select({
        id: t.speakerRequests().id, roomId: t.speakerRequests().roomId, userId: t.speakerRequests().userId,
        status: t.speakerRequests().status, createdAt: t.speakerRequests().createdAt,
        nickname: t.users().nickname, avatarUrl: t.users().avatarUrl,
      }).from(t.speakerRequests())
        .innerJoin(t.users(), eq(t.speakerRequests().userId, t.users().id))
        .where(and(eq(t.speakerRequests().roomId, roomId), eq(t.speakerRequests().status, 'pending'))),
    ]);

    const host = hostRows[0] ? toUser(hostRows[0] as Record<string, unknown>) : null;
    const cat  = catRows[0]  ? (catRows[0] as Record<string, unknown>) : null;

    const speakerMembers = (memberRows as Record<string, unknown>[]).filter(m => m.memberRole === 'speaker');
    const audienceMembers = (memberRows as Record<string, unknown>[]).filter(m => m.memberRole === 'audience');

    const seats: RoomSeat[] = (seatRows as Record<string, unknown>[]).map(s => {
      const seat = toSeat(s);
      return {
        seatIndex: seat.seatIndex,
        userId: seat.userId!,
        nickname: seat.nickname!,
        avatarUrl: (speakerMembers.find(m => m.userId === seat.userId)?.avatarUrl as string) ?? '',
        micEnabled: seat.micEnabled,
        status: seat.status,
        isHost: seat.userId === room.ownerId,
      };
    });

    const pendingSpeakerRequests: SpeakerRequestView[] = (speakerReqRows as Record<string, unknown>[]).map(r => ({
      id: r.id as string,
      roomId: r.roomId as string,
      userId: r.userId as string,
      status: r.status as 'pending',
      createdAt: Number(r.createdAt),
      nickname: r.nickname as string,
      avatarUrl: (r.avatarUrl as string) ?? '',
    }));

    return {
      id: room.id,
      title: room.name,
      description: room.description,
      status: room.status,
      privacy: room.privacy,
      micOption: room.micOption,
      imageUrl: room.imageUrl,
      coverUrl: room.coverUrl,
      announcement: room.announcement,
      createdAt: room.createdAt,
      host: host
        ? { userId: host.id, nickname: host.nickname, avatarUrl: host.avatarUrl }
        : { userId: room.ownerId, nickname: 'Unknown', avatarUrl: '' },
      category: cat ? { id: cat.id as string, name: cat.name as string, image: (cat.image as string | null) ?? null } : null,
      speakers: {
        max: room.maxSpeakers,
        count: speakerMembers.length,
        seats,
      },
      audience: {
        max: room.maxAudience,
        count: audienceMembers.length,
        members: audienceMembers.map(m => ({
          userId: m.userId as string,
          nickname: m.nickname as string,
          avatarUrl: (m.avatarUrl as string) ?? '',
        })),
      },
      onlineCount: roomWsManager.getClientCount(roomId),
      pendingSpeakerRequests,
    };
  },

  // ── Member Management ────────────────────────────────────────────────────────

  async join(roomId: string, userId: string): Promise<RoomMember> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'closed') throw new Error('Room is closed');
    const { db } = getDb();

    const userRows = await db.select().from(t.users()).where(eq(t.users().id, userId));
    if (!userRows[0]) throw new Error('User not found');
    const user = toUser(userRows[0] as Record<string, unknown>);

    const existing = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (existing[0]) return toMember(existing[0] as Record<string, unknown>);

    if (room.privacy === 'private' && room.ownerId !== userId) throw new Error('APPROVAL_REQUIRED');

    // Owner automatically takes seat 0 as speaker
    if (room.ownerId === userId) {
      const member: RoomMember = { id: uuidv4(), roomId, userId, memberRole: 'speaker', seatIndex: 0, joinedAt: Date.now() };
      await db.insert(t.members()).values({ ...member, roomId: member.roomId, userId: member.userId });
      const micEnabled = dbDriver === 'mysql' ? 1 as unknown as boolean : true;
      await db.update(t.seats()).set({ userId, nickname: user.nickname, status: 'occupied', micEnabled })
        .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, 0)));
      publish(roomId, 'user_joined', { userId, nickname: user.nickname, memberRole: 'speaker' });
      publish(roomId, 'mic_changed', { userId, nickname: user.nickname, seatIndex: 0, memberRole: 'speaker' });
      return member;
    }

    const member: RoomMember = { id: uuidv4(), roomId, userId, memberRole: 'audience', seatIndex: -1, joinedAt: Date.now() };
    await db.insert(t.members()).values({ ...member, roomId: member.roomId, userId: member.userId });
    publish(roomId, 'user_joined', { userId, nickname: user.nickname, memberRole: 'audience' });
    return member;
  },

  async leave(roomId: string, userId: string): Promise<void> {
    const { db } = getDb();
    const userRows = await db.select().from(t.users()).where(eq(t.users().id, userId));
    if (!userRows[0]) throw new Error('User not found');
    const user = toUser(userRows[0] as Record<string, unknown>);

    await db.update(t.seats()).set({ userId: null, nickname: null, status: 'idle' })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().userId, userId)));
    await db.delete(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    publish(roomId, 'user_left', { userId, nickname: user.nickname });
  },

  async kick(roomId: string, requesterId: string, targetUserId: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== requesterId) throw new Error('Only the owner can kick members');
    if (requesterId === targetUserId) throw new Error('Cannot kick yourself');
    if (targetUserId === room.ownerId) throw new Error('Cannot kick the room owner');
    const { db } = getDb();

    const targetRows = await db.select().from(t.users()).where(eq(t.users().id, targetUserId));
    if (!targetRows[0]) throw new Error('User not found');
    const target = toUser(targetRows[0] as Record<string, unknown>);

    await db.update(t.seats()).set({ userId: null, nickname: null, status: 'idle' })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().userId, targetUserId)));
    await db.delete(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, targetUserId)));

    publish(roomId, 'member_kicked', { userId: targetUserId, nickname: target.nickname }, targetUserId);
    publish(roomId, 'member_kicked', { userId: targetUserId, nickname: target.nickname });
  },

  // ── Mic compat layer ─────────────────────────────────────────────────────────

  async changeMic(roomId: string, userId: string, targetRole: 'speaker' | 'audience'): Promise<RoomMember> {
    if (targetRole === 'speaker') {
      const room = await this.findById(roomId);
      if (!room) throw new Error('Room not found');
      
      // Owner always takes seat 0
      if (room.ownerId === userId) {
        return this.takeSeat(roomId, userId, 0);
      }

      // Others take any idle seat except 0
      const seats = await this.listSeats(roomId);
      const idle = seats.find(s => s.status === 'idle' && s.seatIndex > 0);
      if (!idle) {
        throw new Error(`Speaker slots are full (max ${room.maxSpeakers})`);
      }
      return this.takeSeat(roomId, userId, idle.seatIndex);
    }
    return this.leaveSeat(roomId, userId);
  },

  async toggleMicEnabled(roomId: string, userId: string): Promise<{ micEnabled: boolean; seatIndex: number }> {
    const { db } = getDb();

    // Auto-join if user is the room owner but hasn't joined yet
    const memberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (!memberRows[0]) {
      const room = await this.findById(roomId);
      if (room && room.ownerId === userId) {
        await this.join(roomId, userId);
      } else {
        throw new Error('User is not in this room');
      }
    }

    // Re-fetch after potential auto-join
    const freshMemberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    const member = toMember(freshMemberRows[0] as Record<string, unknown>);
    if (member.memberRole !== 'speaker') throw new Error('User is not a speaker');

    const seatRows = await db.select().from(t.seats())
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, member.seatIndex)));
    if (!seatRows[0]) throw new Error('Seat not found');
    const seat = toSeat(seatRows[0] as Record<string, unknown>);

    const newMicEnabled = !seat.micEnabled;
    const micEnabledVal = dbDriver === 'mysql' ? (newMicEnabled ? 1 : 0) as unknown as boolean : newMicEnabled;
    await db.update(t.seats()).set({ micEnabled: micEnabledVal })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, member.seatIndex)));

    seatCache.set(roomId, member.seatIndex, { ...seat, micEnabled: newMicEnabled }).catch(() => {});
    publish(roomId, 'mic_changed', { userId, seatIndex: member.seatIndex, micEnabled: newMicEnabled, memberRole: 'speaker' });

    return { micEnabled: newMicEnabled, seatIndex: member.seatIndex };
  },

  async toggleMic(roomId: string, userId: string): Promise<RoomMember> {
    const { db } = getDb();
    const memberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (!memberRows[0]) throw new Error('User is not in this room');
    
    const member = toMember(memberRows[0] as Record<string, unknown>);
    const targetRole = member.memberRole === 'speaker' ? 'audience' : 'speaker';
    return this.changeMic(roomId, userId, targetRole);
  },

  // ── Seat Management ──────────────────────────────────────────────────────────

  async listSeats(roomId: string): Promise<SeatState[]> {
    const { db } = getDb();
    const rows = await db.select().from(t.seats()).where(eq(t.seats().roomId, roomId));
    return rows.map((r: Record<string, unknown>) => toSeat(r as Record<string, unknown>));
  },

  async takeSeat(roomId: string, userId: string, seatIndex: number): Promise<RoomMember> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'closed') throw new Error('Room is closed');
    const { db } = getDb();

    const memberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (!memberRows[0]) throw new Error('User is not in this room');

    const seatRows = await db.select().from(t.seats())
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, seatIndex)));
    if (!seatRows[0]) throw new Error(`Seat ${seatIndex} does not exist`);
    const seat = toSeat(seatRows[0] as Record<string, unknown>);

    if (seat.status === 'locked') throw new Error(`Seat ${seatIndex} is locked`);
    if (seat.status === 'occupied' && seat.userId !== userId) throw new Error(`Seat ${seatIndex} is already occupied`);

    const userRows = await db.select().from(t.users()).where(eq(t.users().id, userId));
    const user = toUser(userRows[0] as Record<string, unknown>);

    // Free previous seat
    await db.update(t.seats()).set({ userId: null, nickname: null, status: 'idle' })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().userId, userId)));

    const micEnabled = dbDriver === 'mysql' ? (seat.micEnabled ? 1 : 0) as unknown as boolean : seat.micEnabled;
    await db.update(t.seats()).set({ userId, nickname: user.nickname, status: 'occupied', micEnabled })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, seatIndex)));
    await db.update(t.members()).set({ memberRole: 'speaker', seatIndex })
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));

    seatCache.set(roomId, seatIndex, { roomId, seatIndex, userId, nickname: user.nickname, status: 'occupied', micEnabled: seat.micEnabled }).catch(() => {});
    publish(roomId, 'mic_changed', { userId, nickname: user.nickname, seatIndex, memberRole: 'speaker' });
    return { ...toMember(memberRows[0] as Record<string, unknown>), memberRole: 'speaker', seatIndex };
  },

  async leaveSeat(roomId: string, userId: string): Promise<RoomMember> {
    const { db } = getDb();
    const memberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (!memberRows[0]) throw new Error('User is not in this room');

    const prevSeatIndex = Number((memberRows[0] as Record<string, unknown>).seatIndex ?? -1);
    await db.update(t.seats()).set({ userId: null, nickname: null, status: 'idle' })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().userId, userId)));
    await db.update(t.members()).set({ memberRole: 'audience', seatIndex: -1 })
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));

    if (prevSeatIndex >= 0) seatCache.clear(roomId, prevSeatIndex).catch(() => {});
    const userRows = await db.select().from(t.users()).where(eq(t.users().id, userId));
    const user = toUser(userRows[0] as Record<string, unknown>);
    publish(roomId, 'mic_changed', { userId, nickname: user.nickname, seatIndex: -1, memberRole: 'audience' });
    return { ...toMember(memberRows[0] as Record<string, unknown>), memberRole: 'audience', seatIndex: -1 };
  },

  async lockSeat(roomId: string, requesterId: string, seatIndex: number, locked: boolean): Promise<SeatState> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== requesterId) throw new Error('Only the owner can lock seats');
    const { db } = getDb();
    const seatRows = await db.select().from(t.seats())
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, seatIndex)));
    if (!seatRows[0]) throw new Error(`Seat ${seatIndex} does not exist`);
    const newStatus = locked ? 'locked' : 'idle';
    await db.update(t.seats()).set({ status: newStatus })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, seatIndex)));
    const result = { ...toSeat(seatRows[0] as Record<string, unknown>), status: newStatus as SeatState['status'] };
    seatCache.set(roomId, seatIndex, result).catch(() => {});
    publish(roomId, 'seat_locked', { seatIndex, locked });
    return result;
  },

  async muteSeat(roomId: string, requesterId: string, seatIndex: number, muted: boolean): Promise<SeatState> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== requesterId) throw new Error('Only the owner can mute seats');
    const { db } = getDb();
    const seatRows = await db.select().from(t.seats())
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, seatIndex)));
    if (!seatRows[0]) throw new Error(`Seat ${seatIndex} does not exist`);
    const micEnabled = dbDriver === 'mysql' ? (!muted ? 1 : 0) as unknown as boolean : !muted;
    await db.update(t.seats()).set({ micEnabled })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().seatIndex, seatIndex)));
    const result = { ...toSeat(seatRows[0] as Record<string, unknown>), micEnabled: !muted };
    seatCache.set(roomId, seatIndex, result).catch(() => {});
    publish(roomId, 'seat_muted', { seatIndex, muted });
    return result;
  },

  // ── Join Requests ─────────────────────────────────────────────────────────────

  async requestJoin(roomId: string, userId: string): Promise<JoinRequest> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'closed') throw new Error('Room is closed');
    if (room.privacy !== 'private') throw new Error('Room does not require approval');
    const { db } = getDb();

    const userRows = await db.select().from(t.users()).where(eq(t.users().id, userId));
    if (!userRows[0]) throw new Error('User not found');
    const user = toUser(userRows[0] as Record<string, unknown>);

    const memberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (memberRows[0]) throw new Error('Already a member of this room');

    const existing = await db.select().from(t.joinRequests())
      .where(and(eq(t.joinRequests().roomId, roomId), eq(t.joinRequests().userId, userId)));

    if (existing[0]) {
      const ex = existing[0] as Record<string, unknown>;
      if (ex.status === 'pending') throw new Error('Join request already pending');
      if (ex.status === 'approved') throw new Error('Already approved');
      await db.update(t.joinRequests()).set({ status: 'pending' })
        .where(and(eq(t.joinRequests().roomId, roomId), eq(t.joinRequests().userId, userId)));
      const updated: JoinRequest = { id: ex.id as string, roomId, userId, status: 'pending', createdAt: Number(ex.createdAt ?? ex.created_at) };
      publish(roomId, 'join_request', { requestId: updated.id, roomId, userId, nickname: user.nickname, avatarUrl: user.avatarUrl }, room.ownerId);
      return updated;
    }

    const req: JoinRequest = { id: uuidv4(), roomId, userId, status: 'pending', createdAt: Date.now() };
    await db.insert(t.joinRequests()).values({ ...req });
    publish(roomId, 'join_request', { requestId: req.id, roomId, userId, nickname: user.nickname, avatarUrl: user.avatarUrl }, room.ownerId);
    return req;
  },

  async listPendingRequests(roomId: string, requesterId: string): Promise<JoinRequestView[]> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== requesterId) throw new Error('Only the owner can view join requests');
    const { db } = getDb();

    const rows = await db
      .select({
        id: t.joinRequests().id, roomId: t.joinRequests().roomId, userId: t.joinRequests().userId,
        status: t.joinRequests().status, createdAt: t.joinRequests().createdAt,
        nickname: t.users().nickname, avatarUrl: t.users().avatarUrl,
      })
      .from(t.joinRequests())
      .innerJoin(t.users(), eq(t.joinRequests().userId, t.users().id))
      .where(and(eq(t.joinRequests().roomId, roomId), eq(t.joinRequests().status, 'pending')));

    return rows.map((r: Record<string, unknown>) => ({
      id: r.id, roomId: r.roomId, userId: r.userId,
      status: r.status as 'pending', createdAt: Number(r.createdAt),
      nickname: r.nickname, avatarUrl: r.avatarUrl ?? '',
    }));
  },

  async approveRequest(requestId: string, ownerId: string): Promise<RoomMember> {
    const { db } = getDb();
    const reqRows = await db.select().from(t.joinRequests()).where(eq(t.joinRequests().id, requestId));
    if (!reqRows[0]) throw new Error('Join request not found');
    const req = reqRows[0] as Record<string, unknown>;
    const roomId = req.roomId as string;
    const userId = req.userId as string;

    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== ownerId) throw new Error('Only the owner can approve requests');
    if (req.status !== 'pending') throw new Error('Request is no longer pending');

    await db.update(t.joinRequests()).set({ status: 'approved' }).where(eq(t.joinRequests().id, requestId));

    const userRows = await db.select().from(t.users()).where(eq(t.users().id, userId));
    const user = toUser(userRows[0] as Record<string, unknown>);

    const existing = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (existing[0]) return toMember(existing[0] as Record<string, unknown>);

    const member: RoomMember = { id: uuidv4(), roomId, userId, memberRole: 'audience', seatIndex: -1, joinedAt: Date.now() };
    await db.insert(t.members()).values({ ...member });
    publish(roomId, 'join_approved', { requestId, roomId, roomName: room.name }, userId);
    publish(roomId, 'user_joined', { userId, nickname: user.nickname, memberRole: 'audience' });
    return member;
  },

  async rejectRequest(requestId: string, ownerId: string): Promise<void> {
    const { db } = getDb();
    const reqRows = await db.select().from(t.joinRequests()).where(eq(t.joinRequests().id, requestId));
    if (!reqRows[0]) throw new Error('Join request not found');
    const req = reqRows[0] as Record<string, unknown>;
    const roomId = req.roomId as string;
    const userId = req.userId as string;

    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== ownerId) throw new Error('Only the owner can reject requests');
    if (req.status !== 'pending') throw new Error('Request is no longer pending');

    await db.update(t.joinRequests()).set({ status: 'rejected' }).where(eq(t.joinRequests().id, requestId));
    publish(roomId, 'join_rejected', { requestId, roomId, roomName: room.name }, userId);
  },

  // ── Speaker Requests ──────────────────────────────────────────────────────────

  async requestToSpeak(roomId: string, userId: string): Promise<{ status: 'pending'; requestId: string }> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'closed') throw new Error('Room is closed');
    const { db } = getDb();

    const memberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, userId)));
    if (!memberRows[0]) throw new Error('User is not in this room');
    const member = toMember(memberRows[0] as Record<string, unknown>);
    if (member.memberRole === 'speaker') throw new Error('User is already a speaker');

    const existing = await db.select().from(t.speakerRequests())
      .where(and(
        eq(t.speakerRequests().roomId, roomId),
        eq(t.speakerRequests().userId, userId),
        eq(t.speakerRequests().status, 'pending'),
      ));
    if (existing[0]) throw new Error('Speaker request already pending');

    const userRows = await db.select().from(t.users()).where(eq(t.users().id, userId));
    if (!userRows[0]) throw new Error('User not found');
    const user = toUser(userRows[0] as Record<string, unknown>);

    // Always require approval for speaking
    const req = { id: uuidv4(), roomId, userId, status: 'pending' as const, createdAt: Date.now() };
    await db.insert(t.speakerRequests()).values({ ...req });

    publish(roomId, 'speaker_request_created', {
      requestId: req.id,
      roomId,
      userId,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      createdAt: req.createdAt,
    });

    return { status: 'pending', requestId: req.id };
  },

  async approveSpeakerRequest(requestId: string, hostId: string): Promise<void> {
    const { db } = getDb();
    const reqRows = await db.select().from(t.speakerRequests()).where(eq(t.speakerRequests().id, requestId));
    if (!reqRows[0]) throw new Error('Speaker request not found');
    const req = reqRows[0] as Record<string, unknown>;
    const roomId = req.roomId as string;
    const userId = req.userId as string;

    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'closed') throw new Error('Room is closed');
    if (room.ownerId !== hostId) throw new Error('Only the host can approve speaker requests');
    if (req.status !== 'pending') throw new Error('Request is no longer pending');

    await db.delete(t.speakerRequests()).where(eq(t.speakerRequests().id, requestId));

    await this.promoteToSpeaker(roomId, userId);

    publish(roomId, 'speaker_request_approved', { requestId, roomId, userId });
  },

  async rejectSpeakerRequest(requestId: string, hostId: string): Promise<void> {
    const { db } = getDb();
    const reqRows = await db.select().from(t.speakerRequests()).where(eq(t.speakerRequests().id, requestId));
    if (!reqRows[0]) throw new Error('Speaker request not found');
    const req = reqRows[0] as Record<string, unknown>;
    const roomId = req.roomId as string;
    const userId = req.userId as string;

    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.ownerId !== hostId) throw new Error('Only the host can reject speaker requests');
    if (req.status !== 'pending') throw new Error('Request is no longer pending');

    await db.delete(t.speakerRequests()).where(eq(t.speakerRequests().id, requestId));

    publish(roomId, 'speaker_request_rejected', { requestId, roomId, userId });
  },

  // Promote an audience member to speaker by assigning the next available seat
  async promoteToSpeaker(roomId: string, userId: string): Promise<RoomMember> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');

    const seats = await this.listSeats(roomId);
    const idle = seats.find(s => s.status === 'idle' && s.seatIndex > 0);
    if (!idle) throw new Error(`Speaker slots are full (max ${room.maxSpeakers})`);

    return this.takeSeat(roomId, userId, idle.seatIndex);
  },

  // Host forces a speaker to leave the mic
  async forceRemoveSpeaker(roomId: string, hostId: string, targetUserId: string): Promise<void> {
    const room = await this.findById(roomId);
    if (!room) throw new Error('Room not found');
    if (room.status === 'closed') throw new Error('Room is closed');
    if (room.ownerId !== hostId) throw new Error('Only the host can remove speakers');
    if (hostId === targetUserId) throw new Error('Cannot remove yourself');
    if (targetUserId === room.ownerId) throw new Error('Cannot remove the room owner');
    const { db } = getDb();

    const memberRows = await db.select().from(t.members())
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, targetUserId)));
    if (!memberRows[0]) throw new Error('User is not in this room');
    const member = toMember(memberRows[0] as Record<string, unknown>);
    if (member.memberRole !== 'speaker') throw new Error('User is not a speaker');

    const userRows = await db.select().from(t.users()).where(eq(t.users().id, targetUserId));
    const user = toUser(userRows[0] as Record<string, unknown>);

    // Free the seat
    await db.update(t.seats()).set({ userId: null, nickname: null, status: 'idle' })
      .where(and(eq(t.seats().roomId, roomId), eq(t.seats().userId, targetUserId)));
    
    // Demote to audience
    await db.update(t.members()).set({ memberRole: 'audience', seatIndex: -1 })
      .where(and(eq(t.members().roomId, roomId), eq(t.members().userId, targetUserId)));

    if (member.seatIndex >= 0) seatCache.clear(roomId, member.seatIndex).catch(() => {});
    publish(roomId, 'mic_changed', { userId: targetUserId, nickname: user.nickname, seatIndex: -1, memberRole: 'audience' });
  },
};
