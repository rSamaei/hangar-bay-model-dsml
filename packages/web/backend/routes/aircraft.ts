import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  getAircraftByUser,
  getAircraftById,
  createAircraft,
  updateAircraft,
  deleteAircraft
} from '../db/database.js';

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
  const { name, wingspan, length, height, tailHeight } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Aircraft name is required' });
    return;
  }

  if (typeof wingspan !== 'number' || wingspan <= 0) {
    res.status(400).json({ error: 'Wingspan must be a positive number' });
    return;
  }

  if (typeof length !== 'number' || length <= 0) {
    res.status(400).json({ error: 'Length must be a positive number' });
    return;
  }

  if (typeof height !== 'number' || height <= 0) {
    res.status(400).json({ error: 'Height must be a positive number' });
    return;
  }

  if (typeof tailHeight !== 'number' || tailHeight <= 0) {
    res.status(400).json({ error: 'Tail height must be a positive number' });
    return;
  }

  try {
    const aircraft = createAircraft(req.user!.id, {
      name: name.trim(),
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

  const { name, wingspan, length, height, tailHeight } = req.body;

  const updates: any = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Aircraft name cannot be empty' });
      return;
    }
    updates.name = name.trim();
  }

  if (wingspan !== undefined) {
    if (typeof wingspan !== 'number' || wingspan <= 0) {
      res.status(400).json({ error: 'Wingspan must be a positive number' });
      return;
    }
    updates.wingspan = wingspan;
  }

  if (length !== undefined) {
    if (typeof length !== 'number' || length <= 0) {
      res.status(400).json({ error: 'Length must be a positive number' });
      return;
    }
    updates.length = length;
  }

  if (height !== undefined) {
    if (typeof height !== 'number' || height <= 0) {
      res.status(400).json({ error: 'Height must be a positive number' });
      return;
    }
    updates.height = height;
  }

  if (tailHeight !== undefined) {
    if (typeof tailHeight !== 'number' || tailHeight <= 0) {
      res.status(400).json({ error: 'Tail height must be a positive number' });
      return;
    }
    updates.tail_height = tailHeight;
  }

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
