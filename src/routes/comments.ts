import { Router, Request, Response } from 'express';
import { commentService } from '../services/commentService';
import { ok, fail } from '../types';

const router = Router({ mergeParams: true });

router.post('/', async (req: Request, res: Response) => {
  const { userId, content, parentId } = req.body as { userId?: string; content?: string; parentId?: string };
  if (!userId)  return res.status(400).json(fail('userId is required'));
  if (!content) return res.status(400).json(fail('content is required'));
  try {
    const comment = await commentService.post({ roomId: req.params.id, userId, content, parentId });
    return res.status(201).json(ok(comment));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    const status = msg.includes('not found') ? 404 : msg.includes('join') ? 403 : 400;
    return res.status(status).json(fail(msg));
  }
});

router.get('/', async (req: Request, res: Response) => {
  const limit  = req.query.limit  ? parseInt(req.query.limit  as string, 10) : 30;
  const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;
  if (isNaN(limit) || limit < 1) return res.status(400).json(fail('limit must be a positive integer'));
  try {
    const comments = await commentService.listTopLevel({ roomId: req.params.id, limit, before });
    return res.json(ok(comments));
  } catch (e: unknown) {
    return res.status(400).json(fail(e instanceof Error ? e.message : 'Error'));
  }
});

router.get('/:commentId/replies', async (req: Request, res: Response) => {
  try {
    const replies = await commentService.listReplies(req.params.commentId);
    return res.json(ok(replies));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') ? 404 : 400).json(fail(msg));
  }
});

export default router;
