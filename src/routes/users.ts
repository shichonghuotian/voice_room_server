import { Router, Request, Response } from 'express';
import { userService } from '../services/userService';
import { ok, fail } from '../types';

const router = Router();

/**
 * POST /users
 * Create a user.
 * Body: { nickname: string, avatarUrl?: string }
 */
router.post('/', async (req: Request, res: Response) => {
  const { nickname, avatarUrl } = req.body as { nickname?: string; avatarUrl?: string };

  if (!nickname || nickname.trim().length === 0) {
    return res.status(400).json(fail('nickname is required'));
  }
  if (nickname.trim().length > 32) {
    return res.status(400).json(fail('nickname must be 32 characters or less'));
  }

  const user = await userService.create({ nickname, avatarUrl });
  return res.status(201).json(ok(user));
});

/**
 * GET /users/:id
 * Get user by id
 */
router.get('/:id', async (req: Request, res: Response) => {
  const user = await userService.findById(req.params.id);
  if (!user) return res.status(404).json(fail('User not found'));
  return res.json(ok(user));
});

export default router;
