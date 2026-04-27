import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  UserSchema, CreateUserSchema,
  RegAndLoginSchema,
  CategorySchema,
  RoomSchema, RoomDetailSchema, RoomCardSchema, CreateRoomSchema, UpdateRoomSchema,
  RoomMemberSchema, SeatStateSchema, JoinRequestSchema,
  CommentViewSchema, ReplyViewSchema, CreateCommentSchema,
  UserIdBodySchema, RequesterTargetSchema,
} from './schemas';

const registry = new OpenAPIRegistry();

// ─── Register all schemas ─────────────────────────────────────────────────────

registry.register('User',             UserSchema);
registry.register('RegAndLogin',      RegAndLoginSchema);
registry.register('Category',         CategorySchema);
registry.register('Room',             RoomSchema);
registry.register('RoomDetail',       RoomDetailSchema);
registry.register('RoomCard',         RoomCardSchema);
registry.register('RoomMember',       RoomMemberSchema);
registry.register('SeatState',        SeatStateSchema);
registry.register('JoinRequest',      JoinRequestSchema);
registry.register('CommentView',      CommentViewSchema);
registry.register('ReplyView',        ReplyViewSchema);

// ─── Helper ───────────────────────────────────────────────────────────────────

function ok(schema: z.ZodTypeAny) {
  return {
    description: 'Success',
    content: { 'application/json': { schema: z.object({ success: z.literal(true), data: schema }) } },
  };
}

const err = {
  400: { description: 'Bad request',       content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } } },
  403: { description: 'Forbidden',         content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } } },
  404: { description: 'Not found',         content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } } },
  500: { description: 'Internal error',    content: { 'application/json': { schema: z.object({ success: z.literal(false), error: z.string() }) } } },
};

// ─── Categories ───────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get', path: '/categories', tags: ['Categories'], summary: 'List all categories',
  responses: { 200: ok(z.array(CategorySchema)) },
});

// ─── Users ────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post', path: '/auth/regAndLogin', tags: ['Auth'], summary: 'Register or log in a voice room user',
  description: 'Upserts the user by userId. If the user already exists, updates nickname/avatarUrl and returns the stored profile.',
  request: { body: { content: { 'application/json': { schema: RegAndLoginSchema } }, required: true } },
  responses: { 200: ok(UserSchema), 400: err[400] },
});

registry.registerPath({
  method: 'post', path: '/users', tags: ['Users'], summary: 'Create a user',
  request: { body: { content: { 'application/json': { schema: CreateUserSchema } }, required: true } },
  responses: { 201: ok(UserSchema), 400: err[400] },
});

registry.registerPath({
  method: 'get', path: '/users/{id}', tags: ['Users'], summary: 'Get user by ID',
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: ok(UserSchema), 404: err[404] },
});

// ─── Rooms ────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get', path: '/rooms', tags: ['Rooms'], summary: 'List all active rooms',
  responses: { 200: ok(z.array(RoomSchema)) },
});

registry.registerPath({
  method: 'get', path: '/rooms/recommended', tags: ['Rooms'],
  summary: 'Get recommended rooms',
  description: 'Returns the 30 most recently created active rooms as lightweight cards.',
  responses: { 200: ok(z.array(RoomCardSchema)) },
});

registry.registerPath({
  method: 'get', path: '/rooms/by-category/{categoryId}', tags: ['Rooms'],
  summary: 'List rooms by category',
  description: 'Returns up to 30 active rooms in the given category, newest first.',
  request: { params: z.object({ categoryId: z.string().openapi({ example: 'cat-music' }) }) },
  responses: { 200: ok(z.array(RoomCardSchema)) },
});

registry.registerPath({
  method: 'post', path: '/rooms', tags: ['Rooms'], summary: 'Create a new room',
  description: 'The owner automatically joins as speaker on seat 0.',
  request: { body: { content: { 'application/json': { schema: CreateRoomSchema } }, required: true } },
  responses: { 201: ok(RoomSchema), 400: err[400] },
});

registry.registerPath({
  method: 'get', path: '/rooms/{id}', tags: ['Rooms'], summary: 'Get room detail',
  description: 'Returns full room detail including host info, occupied seats, and audience members.',
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: ok(RoomDetailSchema), 404: err[404] },
});

registry.registerPath({
  method: 'patch', path: '/rooms/{id}', tags: ['Rooms'], summary: 'Update room (owner only)',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: UpdateRoomSchema } }, required: true },
  },
  responses: { 200: ok(RoomSchema), 403: err[403], 404: err[404] },
});

registry.registerPath({
  method: 'delete', path: '/rooms/{id}', tags: ['Rooms'], summary: 'Close a room (owner only)',
  description: 'Broadcasts `room_closed` event to all connected Socket.IO clients.',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: UserIdBodySchema } }, required: true },
  },
  responses: { 200: ok(z.object({ message: z.string() })), 403: err[403], 404: err[404] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/join', tags: ['Rooms'], summary: 'Join a room',
  description: 'Returns 201 on direct join, 202 if approval is required (privacy=private).',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: UserIdBodySchema } }, required: true },
  },
  responses: {
    201: ok(RoomMemberSchema),
    202: { description: 'Approval pending', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.object({ status: z.literal('pending'), request: JoinRequestSchema }) }) } } },
    400: err[400], 404: err[404],
  },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/leave', tags: ['Rooms'], summary: 'Leave a room',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: UserIdBodySchema } }, required: true },
  },
  responses: { 200: ok(z.object({ message: z.string() })), 400: err[400] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/kick', tags: ['Rooms'], summary: 'Kick a member (owner only)',
  description: 'Owner cannot be kicked. Broadcasts `member_kicked` event.',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: RequesterTargetSchema } }, required: true },
  },
  responses: { 200: ok(z.object({ message: z.string() })), 403: err[403], 404: err[404] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/mic', tags: ['Rooms'], summary: 'Toggle mic role (speaker ↔ audience)',
  description: 'Owner always takes seat 0. Others take the first available seat > 0.',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ userId: z.string(), role: z.enum(['speaker', 'audience']) }) } }, required: true },
  },
  responses: { 200: ok(RoomMemberSchema), 400: err[400], 404: err[404] },
});

// ─── Join Requests ────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get', path: '/rooms/{id}/join-requests', tags: ['Rooms'], summary: 'List pending join requests (owner only)',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ userId: z.string().openapi({ description: 'Must be the room owner' }) }),
  },
  responses: { 200: ok(z.array(JoinRequestSchema)), 403: err[403], 404: err[404] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/join-requests/{requestId}/approve', tags: ['Rooms'], summary: 'Approve a join request (owner only)',
  request: {
    params: z.object({ id: z.string(), requestId: z.string() }),
    body: { content: { 'application/json': { schema: UserIdBodySchema } }, required: true },
  },
  responses: { 200: ok(RoomMemberSchema), 403: err[403], 404: err[404] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/join-requests/{requestId}/reject', tags: ['Rooms'], summary: 'Reject a join request (owner only)',
  request: {
    params: z.object({ id: z.string(), requestId: z.string() }),
    body: { content: { 'application/json': { schema: UserIdBodySchema } }, required: true },
  },
  responses: { 200: ok(z.object({ message: z.string() })), 403: err[403], 404: err[404] },
});

// ─── Seats ────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'get', path: '/rooms/{id}/seats', tags: ['Seats'], summary: 'List all seat states',
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: ok(z.array(SeatStateSchema)), 404: err[404] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/seats/{seatIndex}/take', tags: ['Seats'], summary: 'Take a seat (go on mic)',
  request: {
    params: z.object({ id: z.string(), seatIndex: z.coerce.number().int() }),
    body: { content: { 'application/json': { schema: UserIdBodySchema } }, required: true },
  },
  responses: { 200: ok(RoomMemberSchema), 400: err[400], 404: err[404] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/seats/leave', tags: ['Seats'], summary: 'Leave current seat (go off mic)',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: UserIdBodySchema } }, required: true },
  },
  responses: { 200: ok(RoomMemberSchema), 400: err[400] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/seats/{seatIndex}/lock', tags: ['Seats'], summary: 'Lock or unlock a seat (owner only)',
  request: {
    params: z.object({ id: z.string(), seatIndex: z.coerce.number().int() }),
    body: { content: { 'application/json': { schema: z.object({ userId: z.string(), locked: z.boolean() }) } }, required: true },
  },
  responses: { 200: ok(SeatStateSchema), 403: err[403], 404: err[404] },
});

registry.registerPath({
  method: 'post', path: '/rooms/{id}/seats/{seatIndex}/mute', tags: ['Seats'], summary: 'Mute or unmute a seat (owner only)',
  request: {
    params: z.object({ id: z.string(), seatIndex: z.coerce.number().int() }),
    body: { content: { 'application/json': { schema: z.object({ userId: z.string(), muted: z.boolean() }) } }, required: true },
  },
  responses: { 200: ok(SeatStateSchema), 403: err[403], 404: err[404] },
});

// ─── Comments ─────────────────────────────────────────────────────────────────

registry.registerPath({
  method: 'post', path: '/rooms/{id}/comments', tags: ['Comments'], summary: 'Post a comment or reply',
  description: 'Broadcasts a `message` Socket.IO event to all room members.',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: CreateCommentSchema } }, required: true },
  },
  responses: {
    201: { description: 'Comment created', content: { 'application/json': { schema: z.object({ success: z.literal(true), data: z.union([CommentViewSchema, ReplyViewSchema]) }) } } },
    400: err[400], 403: err[403], 404: err[404],
  },
});

registry.registerPath({
  method: 'get', path: '/rooms/{id}/comments', tags: ['Comments'], summary: 'List top-level comments (newest first)',
  description: 'Cursor-based pagination: pass `createdAt` of the oldest item as `before` for the next page.',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({
      limit:  z.coerce.number().int().min(1).max(100).default(30).optional(),
      before: z.coerce.number().int().optional().openapi({ description: 'Cursor: return comments older than this timestamp (ms)' }),
    }),
  },
  responses: { 200: ok(z.array(CommentViewSchema)), 400: err[400] },
});

registry.registerPath({
  method: 'get', path: '/rooms/{id}/comments/{commentId}/replies', tags: ['Comments'], summary: 'List replies for a comment',
  request: { params: z.object({ id: z.string(), commentId: z.string() }) },
  responses: { 200: ok(z.array(ReplyViewSchema)), 404: err[404] },
});

// ─── Generate spec ────────────────────────────────────────────────────────────

const generator = new OpenApiGeneratorV3(registry.definitions);

export const swaggerSpec = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'Voice Room API',
    version: '3.0.0',
    description:
      'REST + Socket.IO API for a voice room server.\n\n' +
      '## Real-time (Socket.IO)\n\n' +
      '```js\n' +
      "const socket = io('http://localhost:3000', {\n" +
      "  path: '/socket.io',\n" +
      "  auth: { userId: '<userId>', roomId: '<roomId>' }\n" +
      '});\n```\n\n' +
      'See [/ws-docs](/ws-docs) for the full Socket.IO event reference.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local dev server' }],
});
