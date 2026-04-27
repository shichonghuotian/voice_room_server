import { Router, Request, Response } from 'express';
import { roomService } from '../services/roomService';
import { ok, fail } from '../types';

const router = Router({ mergeParams: true });

router.get('/', async (req: Request, res: Response) => {
  const room = await roomService.findById(req.params.id);
  if (!room) return res.status(404).json(fail('Room not found'));
  return res.json(ok(await roomService.listSeats(req.params.id)));
});

router.post('/:seatIndex/take', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  const seatIndex = parseInt(req.params.seatIndex, 10);
  if (!userId) return res.status(400).json(fail('userId is required'));
  if (isNaN(seatIndex)) return res.status(400).json(fail('seatIndex must be a number'));
  try {
    const member = await roomService.takeSeat(req.params.id, userId, seatIndex);
    return res.json(ok(member));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('not found') || msg.includes('not in') ? 404 : 400).json(fail(msg));
  }
});

router.post('/leave', async (req: Request, res: Response) => {
  const { userId } = req.body as { userId?: string };
  if (!userId) return res.status(400).json(fail('userId is required'));
  try {
    const member = await roomService.leaveSeat(req.params.id, userId);
    return res.json(ok(member));
  } catch (e: unknown) {
    return res.status(400).json(fail(e instanceof Error ? e.message : 'Error'));
  }
});

router.post('/:seatIndex/lock', async (req: Request, res: Response) => {
  const { userId, locked } = req.body as { userId?: string; locked?: boolean };
  const seatIndex = parseInt(req.params.seatIndex, 10);
  if (!userId) return res.status(400).json(fail('userId is required'));
  if (typeof locked !== 'boolean') return res.status(400).json(fail('locked must be a boolean'));
  if (isNaN(seatIndex)) return res.status(400).json(fail('seatIndex must be a number'));
  try {
    const seat = await roomService.lockSeat(req.params.id, userId, seatIndex, locked);
    return res.json(ok(seat));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('owner') ? 403 : 400).json(fail(msg));
  }
});

router.post('/:seatIndex/mute', async (req: Request, res: Response) => {
  const { userId, muted } = req.body as { userId?: string; muted?: boolean };
  const seatIndex = parseInt(req.params.seatIndex, 10);
  if (!userId) return res.status(400).json(fail('userId is required'));
  if (typeof muted !== 'boolean') return res.status(400).json(fail('muted must be a boolean'));
  if (isNaN(seatIndex)) return res.status(400).json(fail('seatIndex must be a number'));
  try {
    const seat = await roomService.muteSeat(req.params.id, userId, seatIndex, muted);
    return res.json(ok(seat));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error';
    return res.status(msg.includes('owner') ? 403 : 400).json(fail(msg));
  }
});

export default router;
