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

type ValidatedBay = { name: string; width: number; depth: number; height: number };

/**
 * Validates and normalises the `bays` array from a request body.
 * Returns parsed bays on success, or an `{ error: string }` object on failure.
 */
function parseBays(bays: unknown): ValidatedBay[] | { error: string } {
  if (!Array.isArray(bays) || bays.length === 0) {
    return { error: 'At least one bay is required' };
  }

  const validated: ValidatedBay[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < bays.length; i++) {
    const bay = bays[i];

    if (!bay.name || typeof bay.name !== 'string' || bay.name.trim().length === 0) {
      return { error: `Bay ${i + 1}: name is required` };
    }

    const bayName = bay.name.trim();
    if (seen.has(bayName)) {
      return { error: `Duplicate bay name: ${bayName}` };
    }
    seen.add(bayName);

    if (typeof bay.width !== 'number' || bay.width <= 0) {
      return { error: `Bay ${bayName}: width must be a positive number` };
    }
    if (typeof bay.depth !== 'number' || bay.depth <= 0) {
      return { error: `Bay ${bayName}: depth must be a positive number` };
    }
    if (typeof bay.height !== 'number' || bay.height <= 0) {
      return { error: `Bay ${bayName}: height must be a positive number` };
    }

    validated.push({ name: bayName, width: bay.width, depth: bay.depth, height: bay.height });
  }

  return validated;
}

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

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Hangar name is required' });
    return;
  }

  const parsedBays = parseBays(bays);
  if ('error' in parsedBays) {
    res.status(400).json({ error: parsedBays.error });
    return;
  }

  try {
    const hangar = createHangar(req.user!.id, name.trim(), parsedBays);
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

  const parsedBays = parseBays(bays);
  if ('error' in parsedBays) {
    res.status(400).json({ error: parsedBays.error });
    return;
  }

  try {
    const hangar = updateHangar(id, req.user!.id, name.trim(), parsedBays);
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
