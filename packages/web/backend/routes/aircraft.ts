import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  getAircraftByUser,
  getAircraftById,
  createAircraft,
  updateAircraft,
  deleteAircraft,
  type Aircraft
} from '../db/database.js';
import { validateAircraftBody } from '../validators/aircraft-validator.js';

const router = Router();

// GET /api/aircraft - List all aircraft for current user
router.get('/aircraft', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const aircraft = getAircraftByUser(req.user!.id);
  res.json({ aircraft });
});

// GET /api/aircraft/:id - Get single aircraft
router.get('/aircraft/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid aircraft ID' });
    return;
  }

  const aircraft = getAircraftById(id, req.user!.id);
  if (!aircraft) {
    res.status(404).json({ error: 'Aircraft not found' });
    return;
  }

  res.json({ aircraft });
});

// POST /api/aircraft - Create new aircraft
router.post('/aircraft', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const validation = validateAircraftBody(req.body, { requireAll: true });
  if (!validation.valid) {
    res.status(400).json({ error: validation.errors[0] });
    return;
  }

  const { name, wingspan, length, height, tailHeight } = req.body;

  try {
    const aircraft = createAircraft(req.user!.id, {
      name: (name as string).trim(),
      wingspan,
      length,
      height,
      tail_height: tailHeight
    });

    res.status(201).json({ aircraft });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'An aircraft with this name already exists' });
      return;
    }
    throw error;
  }
});

// PUT /api/aircraft/:id - Update aircraft
router.put('/aircraft/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid aircraft ID' });
    return;
  }

  const validation = validateAircraftBody(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: validation.errors[0] });
    return;
  }

  const { name, wingspan, length, height, tailHeight } = req.body;
  const updates: Partial<Omit<Aircraft, 'id' | 'user_id' | 'created_at'>> = {};

  if (name !== undefined) updates.name = (name as string).trim();
  if (wingspan !== undefined) updates.wingspan = wingspan;
  if (length !== undefined) updates.length = length;
  if (height !== undefined) updates.height = height;
  if (tailHeight !== undefined) updates.tail_height = tailHeight;

  try {
    const aircraft = updateAircraft(id, req.user!.id, updates);
    if (!aircraft) {
      res.status(404).json({ error: 'Aircraft not found' });
      return;
    }

    res.json({ aircraft });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'An aircraft with this name already exists' });
      return;
    }
    throw error;
  }
});

// DELETE /api/aircraft/:id - Delete aircraft
router.delete('/aircraft/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid aircraft ID' });
    return;
  }

  const deleted = deleteAircraft(id, req.user!.id);
  if (!deleted) {
    res.status(404).json({ error: 'Aircraft not found' });
    return;
  }

  res.json({ success: true });
});

export default router;
