import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// ─── Primitives ───────────────────────────────────────────────────────────────

export const UuidSchema = z.string().uuid().openapi({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
export const TimestampSchema = z.number().int().openapi({ description: 'Unix timestamp (ms)', example: 1713600000000 });

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id:        z.string().openapi({ example: 'user-alice' }),
  nickname:  z.string().max(32).openapi({ example: 'Alice' }),
  avatarUrl: z.string().openapi({ example: '' }),
  role:      z.enum(['free', 'vip']).openapi({ example: 'free' }),
  createdAt: TimestampSchema,
}).openapi('User');

export const CreateUserSchema = z.object({
  nickname:  z.string().min(1).max(32).openapi({ example: 'Alice' }),
  avatarUrl: z.string().optional().openapi({ example: 'https://example.com/avatar.png' }),
}).openapi('CreateUser');

export const RegAndLoginSchema = z.object({
  userId:    z.string().min(1).openapi({ example: 'user-alice' }),
  nickname:  z.string().min(1).max(32).openapi({ example: 'Alice' }),
  avatarUrl: z.string().optional().openapi({ example: 'https://example.com/avatar.png' }),
  source:    z.string().optional().openapi({ example: 'mainapp' }),
}).openapi('RegAndLogin');

// ─── Category ─────────────────────────────────────────────────────────────────

export const CategorySchema = z.object({
  id:    z.string().openapi({ example: 'cat-music' }),
  name:  z.string().openapi({ example: 'Music' }),
  image: z.string().nullable().openapi({ example: null }),
}).openapi('Category');

// ─── Room ─────────────────────────────────────────────────────────────────────

export const RoomPrivacySchema = z.enum(['public', 'private']).openapi({
  description: 'public = anyone can join directly; private = requires host approval',
});

export const RoomMicOptionSchema = z.enum(['mic_and_comments', 'mic_only']);
export const RoomStatusSchema    = z.enum(['draft', 'active', 'closed']);

export const RoomSchema = z.object({
  id:           z.string().openapi({ example: 'room-uuid' }),
  name:         z.string().openapi({ example: 'Friday Music Night' }),
  description:  z.string().nullable(),
  ownerId:      z.string(),
  categoryId:   z.string().nullable(),
  imageUrl:     z.string().nullable(),
  coverUrl:     z.string().nullable(),
  maxSpeakers:  z.number().int().openapi({ example: 8 }),
  maxAudience:  z.number().int().openapi({ example: 100 }),
  status:       RoomStatusSchema,
  privacy:      RoomPrivacySchema,
  micOption:    RoomMicOptionSchema,
  announcement: z.string().nullable(),
  createdAt:    TimestampSchema,
}).openapi('Room');

export const CreateRoomSchema = z.object({
  name:         z.string().min(1).max(128).openapi({ example: 'Friday Music Night' }),
  ownerId:      z.string().openapi({ example: 'user-alice' }),
  description:  z.string().optional(),
  categoryId:   z.string().optional(),
  imageUrl:     z.string().url().optional(),
  coverUrl:     z.string().url().optional(),
  maxSpeakers:  z.number().int().min(1).max(20).default(20).optional(),
  maxAudience:  z.number().int().min(1).max(100).default(100).optional(),
  privacy:      RoomPrivacySchema.default('private').optional(),
  micOption:    RoomMicOptionSchema.default('mic_and_comments').optional(),
}).openapi('CreateRoom');

export const UpdateRoomSchema = z.object({
  userId:       z.string(),
  name:         z.string().min(1).max(128).optional(),
  description:  z.string().optional(),
  announcement: z.string().optional(),
  categoryId:   z.string().optional(),
  imageUrl:     z.string().url().optional(),
  coverUrl:     z.string().url().optional(),
  privacy:      RoomPrivacySchema.optional(),
  micOption:    RoomMicOptionSchema.optional(),
}).openapi('UpdateRoom');

// ─── Room Seat ────────────────────────────────────────────────────────────────

export const RoomSeatSchema = z.object({
  seatIndex:  z.number().int().openapi({ example: 0, description: '0 = host seat' }),
  userId:     z.string(),
  nickname:   z.string(),
  avatarUrl:  z.string(),
  micEnabled: z.boolean(),
  status:     z.enum(['occupied', 'locked']),
  isHost:     z.boolean(),
}).openapi('RoomSeat');

// ─── Room Detail ──────────────────────────────────────────────────────────────

export const HostInfoSchema = z.object({
  userId:    z.string(),
  nickname:  z.string(),
  avatarUrl: z.string(),
}).openapi('HostInfo');

export const AudienceMemberSchema = z.object({
  userId:    z.string(),
  nickname:  z.string(),
  avatarUrl: z.string(),
}).openapi('AudienceMember');

export const RoomDetailSchema = z.object({
  id:           z.string(),
  title:        z.string().openapi({ example: 'Friday Music Night' }),
  description:  z.string().nullable(),
  status:       RoomStatusSchema,
  privacy:      RoomPrivacySchema,
  micOption:    RoomMicOptionSchema,
  imageUrl:     z.string().nullable(),
  coverUrl:     z.string().nullable(),
  announcement: z.string().nullable(),
  createdAt:    TimestampSchema,
  host:         HostInfoSchema,
  category:     CategorySchema.nullable(),
  speakers: z.object({
    max:   z.number().int(),
    count: z.number().int(),
    seats: z.array(RoomSeatSchema).openapi({ description: 'Only occupied seats are returned' }),
  }),
  audience: z.object({
    max:     z.number().int(),
    count:   z.number().int(),
    members: z.array(AudienceMemberSchema),
  }),
  onlineCount: z.number().int().openapi({ description: 'Active Socket.IO connections' }),
}).openapi('RoomDetail');

// ─── Room Card (list / recommended) ──────────────────────────────────────────

export const RoomCardSchema = z.object({
  id:           z.string(),
  title:        z.string(),
  description:  z.string().nullable(),
  status:       RoomStatusSchema,
  privacy:      RoomPrivacySchema,
  micOption:    RoomMicOptionSchema,
  coverUrl:     z.string().nullable(),
  category:     CategorySchema.nullable(),
  host:         HostInfoSchema,
  speakerCount:  z.number().int(),
  audienceCount: z.number().int(),
  onlineCount:   z.number().int(),
  maxSpeakers:   z.number().int(),
  maxAudience:   z.number().int(),
}).openapi('RoomCard');

// ─── Room Member ──────────────────────────────────────────────────────────────

export const RoomMemberSchema = z.object({
  id:         z.string(),
  roomId:     z.string(),
  userId:     z.string(),
  memberRole: z.enum(['speaker', 'audience']),
  seatIndex:  z.number().int().openapi({ description: '-1 = audience (no seat)' }),
  joinedAt:   TimestampSchema,
}).openapi('RoomMember');

// ─── Seat State ───────────────────────────────────────────────────────────────

export const SeatStateSchema = z.object({
  roomId:     z.string(),
  seatIndex:  z.number().int(),
  userId:     z.string().nullable(),
  nickname:   z.string().nullable(),
  status:     z.enum(['idle', 'occupied', 'locked', 'muted']),
  micEnabled: z.boolean(),
}).openapi('SeatState');

// ─── Join Request ─────────────────────────────────────────────────────────────

export const JoinRequestSchema = z.object({
  id:        z.string(),
  roomId:    z.string(),
  userId:    z.string(),
  status:    z.enum(['pending', 'approved', 'rejected']),
  createdAt: TimestampSchema,
  nickname:  z.string(),
  avatarUrl: z.string(),
}).openapi('JoinRequest');

// ─── Comment ──────────────────────────────────────────────────────────────────

export const CommentViewSchema = z.object({
  id:         z.string(),
  roomId:     z.string(),
  userId:     z.string(),
  parentId:   z.string().nullable(),
  content:    z.string().max(500),
  createdAt:  TimestampSchema,
  nickname:   z.string(),
  avatarUrl:  z.string(),
  replyCount: z.number().int(),
}).openapi('CommentView');

export const ReplyViewSchema = z.object({
  id:             z.string(),
  roomId:         z.string(),
  userId:         z.string(),
  parentId:       z.string(),
  content:        z.string().max(500),
  createdAt:      TimestampSchema,
  nickname:       z.string(),
  avatarUrl:      z.string(),
  parentNickname: z.string().nullable(),
}).openapi('ReplyView');

export const CreateCommentSchema = z.object({
  userId:   z.string(),
  content:  z.string().min(1).max(500),
  parentId: z.string().optional(),
}).openapi('CreateComment');

// ─── Common request bodies ────────────────────────────────────────────────────

export const UserIdBodySchema    = z.object({ userId: z.string() }).openapi('UserIdBody');
export const RequesterTargetSchema = z.object({ requesterId: z.string(), targetUserId: z.string() }).openapi('RequesterTarget');
