import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  getHangarsByUser,
  getHangarById,
  createHangar,
  updateHangar,
  deleteHangar
} from '../db/database.js';

const router = Router();

// GET /api/hangars - List all hangars for current user
router.get('/hangars', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const hangars = getHangarsByUser(req.user!.id);
  res.json({ hangars });
});

// GET /api/hangars/:id - Get single hangar with bays
router.get('/hangars/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid hangar ID' });
    return;
  }

  const hangar = getHangarById(id, req.user!.id);
  if (!hangar) {
    res.status(404).json({ error: 'Hangar not found' });
    return;
  }

  res.json({ hangar });
});

// POST /api/hangars - Create new hangar with bays
router.post('/hangars', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { name, bays } = req.body;

  // Validation
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Hangar name is required' });
    return;
  }

  if (!Array.isArray(bays) || bays.length === 0) {
    res.status(400).json({ error: 'At least one bay is required' });
    return;
  }

  // Validate each bay
  const validatedBays: Array<{ name: string; width: number; depth: number; height: number }> = [];
  const bayNames = new Set<string>();

  for (let i = 0; i < bays.length; i++) {
    const bay = bays[i];

    if (!bay.name || typeof bay.name !== 'string' || bay.name.trim().length === 0) {
      res.status(400).json({ error: `Bay ${i + 1}: name is required` });
      return;
    }

    const bayName = bay.name.trim();
    if (bayNames.has(bayName)) {
      res.status(400).json({ error: `Duplicate bay name: ${bayName}` });
      return;
    }
    bayNames.add(bayName);

    if (typeof bay.width !== 'number' || bay.width <= 0) {
      res.status(400).json({ error: `Bay ${bayName}: width must be a positive number` });
      return;
    }

    if (typeof bay.depth !== 'number' || bay.depth <= 0) {
      res.status(400).json({ error: `Bay ${bayName}: depth must be a positive number` });
      return;
    }

    if (typeof bay.height !== 'number' || bay.height <= 0) {
      res.status(400).json({ error: `Bay ${bayName}: height must be a positive number` });
      return;
    }

    validatedBays.push({
      name: bayName,
      width: bay.width,
      depth: bay.depth,
      height: bay.height
    });
  }

  try {
    const hangar = createHangar(req.user!.id, name.trim(), validatedBays);
    res.status(201).json({ hangar });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'A hangar with this name already exists' });
      return;
    }
    throw error;
  }
});

// PUT /api/hangars/:id - Update hangar and bays
router.put('/hangars/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid hangar ID' });
    return;
  }

  const { name, bays } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Hangar name is required' });
    return;
  }

  if (!Array.isArray(bays) || bays.length === 0) {
    res.status(400).json({ error: 'At least one bay is required' });
    return;
  }

  // Validate each bay
  const validatedBays2: Array<{ name: string; width: number; depth: number; height: number }> = [];
  const bayNames2 = new Set<string>();

  for (let i = 0; i < bays.length; i++) {
    const bay = bays[i];

    if (!bay.name || typeof bay.name !== 'string' || bay.name.trim().length === 0) {
      res.status(400).json({ error: `Bay ${i + 1}: name is required` });
      return;
    }

    const bayName = bay.name.trim();
    if (bayNames2.has(bayName)) {
      res.status(400).json({ error: `Duplicate bay name: ${bayName}` });
      return;
    }
    bayNames2.add(bayName);

    if (typeof bay.width !== 'number' || bay.width <= 0) {
      res.status(400).json({ error: `Bay ${bayName}: width must be a positive number` });
      return;
    }

    if (typeof bay.depth !== 'number' || bay.depth <= 0) {
      res.status(400).json({ error: `Bay ${bayName}: depth must be a positive number` });
      return;
    }

    if (typeof bay.height !== 'number' || bay.height <= 0) {
      res.status(400).json({ error: `Bay ${bayName}: height must be a positive number` });
      return;
    }

    validatedBays2.push({
      name: bayName,
      width: bay.width,
      depth: bay.depth,
      height: bay.height
    });
  }

  try {
    const hangar = updateHangar(id, req.user!.id, name.trim(), validatedBays2);
    if (!hangar) {
      res.status(404).json({ error: 'Hangar not found' });
      return;
    }

    res.json({ hangar });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'A hangar with this name already exists' });
      return;
    }
    throw error;
  }
});

// DELETE /api/hangars/:id - Delete hangar
router.delete('/hangars/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid hangar ID' });
    return;
  }

  const deleted = deleteHangar(id, req.user!.id);
  if (!deleted) {
    res.status(404).json({ error: 'Hangar not found' });
    return;
  }

  res.json({ success: true });
});

export default router;
