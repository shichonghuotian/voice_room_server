import { Router, Request, Response } from 'express';
import { sseManager } from '../sse/manager';
import { roomService } from '../services/roomService';
import { fail } from '../types';

const router = Router();

router.get('/:id/sse', async (req: Request, res: Response) => {
  const roomId = req.params.id;
  const userId = req.query.userId as string | undefined;

  if (!userId) return res.status(400).json(fail('userId query param is required'));

  const room = await roomService.findById(roomId);
  if (!room) return res.status(404).json(fail('Room not found'));
  if (room.status === 'closed') return res.status(400).json(fail('Room is closed'));

  sseManager.addClient(roomId, userId, res);
});

export default router;
