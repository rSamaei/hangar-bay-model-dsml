import { Request, Response, NextFunction } from 'express';
import { getSessionByToken } from '../db/database.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.substring(7);
  const session = getSessionByToken(token);

  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.user = {
    id: session.user_id,
    username: session.username
  };

  next();
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const session = getSessionByToken(token);

    if (session) {
      req.user = {
        id: session.user_id,
        username: session.username
      };
    }
  }

  next();
}
