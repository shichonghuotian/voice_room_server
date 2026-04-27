import { Router, Request, Response } from 'express';
import { userService } from '../services/userService';
import { fail, ok } from '../types';

const router = Router();

/**
 * POST /auth/regAndLogin
 * Upsert a user by external userId and return the stored user profile.
 */
router.post('/regAndLogin', async (req: Request, res: Response) => {
  const { userId, nickname, avatarUrl } = req.body as {
    userId?: string;
    nickname?: string;
    avatarUrl?: string;
  };

  if (!userId || userId.trim().length === 0) {
    return res.status(400).json(fail('userId is required'));
  }
  if (!nickname || nickname.trim().length === 0) {
    return res.status(400).json(fail('nickname is required'));
  }
  if (nickname.trim().length > 32) {
    return res.status(400).json(fail('nickname must be 32 characters or less'));
  }

  try {
    const user = await userService.regAndLogin({
      userId: userId.trim(),
      nickname,
      avatarUrl,
    });
    return res.status(200).json(ok(user));
  } catch (error) {
    return res.status(400).json(
      fail(error instanceof Error ? error.message : 'Failed to regAndLogin'),
    );
  }
});

export default router;
