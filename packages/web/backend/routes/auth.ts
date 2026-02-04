import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { findOrCreateUser, createSession, deleteSession, cleanExpiredSessions } from '../db/database.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/auth/login', (req, res: Response) => {
  const { username } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  const trimmedUsername = username.trim().toLowerCase();

  if (trimmedUsername.length < 2 || trimmedUsername.length > 50) {
    res.status(400).json({ error: 'Username must be between 2 and 50 characters' });
    return;
  }

  // Clean expired sessions periodically
  cleanExpiredSessions();

  // Find or create user
  const user = findOrCreateUser(trimmedUsername);

  // Generate session token
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

  createSession(user.id, token, expiresAt);

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username
    }
  });
});

// POST /api/auth/logout
router.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    deleteSession(token);
  }

  res.json({ success: true });
});

// GET /api/auth/me
router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: req.user
  });
});

export default router;
