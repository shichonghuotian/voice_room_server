import { Router, Request, Response } from 'express';
import { roomService } from '../services/roomService';
import { ok, fail } from '../types';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rooms = await roomService.listActive();
    return res.json(ok(rooms));
  } catch (e: unknown) {
    return res.status(500).json(fail(e instanceof Error ? e.message : 'Error'));
  }
});

router.get('/recommended', async (_req: Request, res: Response) => {
  try {
    const rooms = await roomService.getRecommended();
    return res.json(ok(rooms));
  } catch (e: unknown) {
    return res.status(500).json(fail(e instanceof Error ? e.message : 'Error'));
  }
});

router.get('/by-category/:categoryId', async (req: Request, res: Response) => {
  try {
    const rooms = await roomService.listByCategory(req.params.categoryId);
    return res.json(ok(rooms));
  } catch (e: unknown) {
    return res.status(500).json(fail(e instanceof Error ? e.message : 'Error'));
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, ownerId, description, categoryId, imageUrl, coverUrl, maxSpeakers, maxAudience, privacy, micOption } = req.body as {
    name?: string; ownerId?: string; description?: string; categoryId?: string;
    imageUrl?: string; coverUrl?: string; maxSpeakers?: number; maxAudience?: number;
    privacy?: string; micOption?: string;
  };
  if (!name?.trim()) return res.status(400).json(fail('name is required'));
  if (!ownerId)       return res.status(400).json(fail('ownerId is required'));
  if (maxSpeakers !== undefined && (maxSpeakers < 1 || maxSpeakers > 20))
    return res.status(400).json(fail('maxSpeakers must be between 1 and 20'));
  if (privacy !== undefined && privacy !== 'public' && privacy !== 'private')
    return res.status(400).json(fail('privacy must be "public" or "private"'));
  if (micOption !== undefined && micOption !== 'mic_and_comments' && micOption !== 'mic_only')
    return res.status(400).json(fail('micOption must be "mic_and_comments" or "mic_only"'));
  try {
    const room = await roomService.create({
      name, ownerId, description, categoryId, imageUrl, coverUrl,
      maxSpeakers, maxAudience,
      privacy: privacy as 'public' | 'private' | undefined,
      micOption: micOption as 'mic_and_comments' | 'mic_only' | undefined,
    });
    return res.status(201).json(ok(room));
  } catch (e: unknown) {
    return res.status(400).json(fail(e instanceof Error ? e.message : 'Error'));
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { userId, name, announcement, description, categoryId, imageUrl, coverUrl, privacy, micOption } = req.body as {
    userId?: string; name?: string; announcement?: string; description?: string;
    categoryId?: string; imageUrl?: string; coverUrl?: string;
    privacy?: string; micOption?: string;
  };
  if (!userId) return res.status(400).json(fail('userId is required'));
  if (!name && announcement === undefined && description === undefined && !categoryId && !imageUrl && !coverUrl && !privacy && !micOption)
    return res.status(400).json(fail('At least one field to update is required'));
  try {
    const room = await roomService.updateRoom(req.params.id, userId, { name, announcement, description, categoryId, imageUrl, coverUrl, privacy: privacy as any, micOption: micOption as any });
    return res.json(ok(room));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') ? 404 : 403).json(fail(msg));
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const detail = await roomService.getDetail(req.params.id);
  if (!detail) return res.status(404).json(fail('Room not found'));
  return res.json(ok(detail));
});

router.delete('/:id', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json(fail('userId is required'));
  try {
    await roomService.close(req.params.id, userId);
    return res.json(ok({ message: 'Room closed' }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') ? 404 : 403).json(fail(msg));
  }
});

router.post('/:id/join', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json(fail('userId is required'));
  try {
    const member = await roomService.join(req.params.id, userId);
    return res.status(201).json(ok(member));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    if (msg === 'APPROVAL_REQUIRED') {
      try {
        const joinReq = await roomService.requestJoin(req.params.id, userId);
        return res.status(202).json(ok({ status: 'pending', request: joinReq }));
      } catch (e2: unknown) {
        return res.status(400).json(fail(e2 instanceof Error ? e2.message : 'Error'));
      }
    }
    return res.status(msg.includes('not found') ? 404 : 400).json(fail(msg));
  }
});

router.post('/:id/leave', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json(fail('userId is required'));
  try {
    await roomService.leave(req.params.id, userId);
    return res.json(ok({ message: 'Left room' }));
  } catch (e: unknown) {
    return res.status(400).json(fail(e instanceof Error ? e.message : 'Error'));
  }
});

router.post('/:id/kick', async (req: Request, res: Response) => {
  const { requesterId, targetUserId } = req.body as { requesterId?: string; targetUserId?: string };
  if (!requesterId || !targetUserId) return res.status(400).json(fail('requesterId and targetUserId are required'));
  try {
    await roomService.kick(req.params.id, requesterId, targetUserId);
    return res.json(ok({ message: 'Member kicked' }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') ? 404 : 403).json(fail(msg));
  }
});

router.post('/:id/mic', async (req: Request, res: Response) => {
  const { userId, role } = req.body as { userId?: string; role?: string };
  if (!userId) return res.status(400).json(fail('userId is required'));
  if (role !== 'speaker' && role !== 'audience') return res.status(400).json(fail('role must be "speaker" or "audience"'));
  try {
    const member = await roomService.changeMic(req.params.id, userId, role);
    return res.json(ok(member));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') ? 404 : 400).json(fail(msg));
  }
});

router.get('/:id/join-requests', async (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) return res.status(400).json(fail('userId query param is required'));
  try {
    const requests = await roomService.listPendingRequests(req.params.id, userId);
    return res.json(ok(requests));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') ? 404 : 403).json(fail(msg));
  }
});

router.post('/:id/join-requests/:requestId/approve', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json(fail('userId is required'));
  try {
    const member = await roomService.approveRequest(req.params.requestId, userId);
    return res.json(ok(member));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') ? 404 : 403).json(fail(msg));
  }
});

router.post('/:id/join-requests/:requestId/reject', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json(fail('userId is required'));
  try {
    await roomService.rejectRequest(req.params.requestId, userId);
    return res.json(ok({ message: 'Request rejected' }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') ? 404 : 403).json(fail(msg));
  }
});

export default router;
