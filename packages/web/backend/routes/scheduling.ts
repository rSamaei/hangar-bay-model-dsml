import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { validateScheduleEntry, validateScheduleEntries } from '../validators/schedule-validator.js';
import {
  getScheduleEntriesByUser,
  createScheduleEntry,
  createScheduleEntries,
  deleteScheduleEntry,
  updateScheduleEntry,
  clearAllScheduleEntries,
  getAircraftByUser,
  getHangarsByUser,
  getAircraftById,
} from '../db/database.js';
import {
  generateDSLFromEntries,
  computeSchedule as runSchedule,
  extractPlacements as _extractPlacements,
  type ScheduledPlacement,
} from '../services/scheduling-service.js';

// Re-export for backward compatibility with existing tests
export { _extractPlacements as extractPlacements };

const router = Router();

interface SchedulerDiagnosticItem {
  severity: number;
  message: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  source: 'scheduler';
}

interface ScheduleResult {
  entries: import('../db/database.js').ScheduleEntryWithDetails[];
  placements: ScheduledPlacement[];
  validationErrors: string[];
  dslCode?: string;
  schedulerDiagnostics?: SchedulerDiagnosticItem[];
}

export function findAutoInductLine(dslCode: string, entryId: number): number {
  const lines = dslCode.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`auto-induct id "entry_${entryId}"`)) return i + 1;
  }
  return 1;
}

export function formatSchedulerReason(aircraftName: string, reasonRuleId: string): string {
  switch (reasonRuleId) {
    case 'NO_SUITABLE_BAY_SET':
      return `SCHED_NO_BAY: Cannot schedule ${aircraftName} — no bay combination fits the aircraft dimensions`;
    case 'SFR11_DOOR_FIT':
      return `SCHED_DOOR_FIT: Cannot schedule ${aircraftName} — aircraft does not fit through any hangar door`;
    case 'SFR16_TIME_OVERLAP':
      return `SCHED_TIME_OVERLAP: Cannot schedule ${aircraftName} — time slot conflicts with an existing induction`;
    default:
      return `SCHED_FAILURE: Cannot schedule ${aircraftName} — ${reasonRuleId}`;
  }
}

// GET /api/schedule - Get all schedule entries with computed placements
router.get('/schedule', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  try {
    const result = await computeSchedule(userId);
    res.json(result);
  } catch (error: any) {
    console.error('Schedule computation error:', error);
    res.status(500).json({ error: error.message || 'Failed to compute schedule' });
  }
});

// POST /api/schedule/entry - Add a single schedule entry
router.post('/schedule/entry', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;

  const validation = validateScheduleEntry(req.body);
  if (!validation.valid) {
    res.status(400).json({ error: validation.errors[0] });
    return;
  }

  const { aircraftId, startTime, endTime } = req.body;

  // Verify aircraft belongs to user
  const aircraft = getAircraftById(aircraftId, userId);
  if (!aircraft) {
    res.status(404).json({ error: 'Aircraft not found' });
    return;
  }

  // Create the entry
  createScheduleEntry(userId, {
    aircraft_id: aircraftId,
    start_time: startTime,
    end_time: endTime
  });

  try {
    // Re-compute the entire schedule and return results
    const result = await computeSchedule(userId);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Schedule computation error:', error);
    res.status(500).json({ error: error.message || 'Failed to compute schedule' });
  }
});

// POST /api/schedule/entries - Add multiple schedule entries at once
router.post('/schedule/entries', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { entries } = req.body;
  const userId = req.user!.id;

  if (!Array.isArray(entries) || entries.length === 0) {
    res.status(400).json({ error: 'Entries array is required' });
    return;
  }

  const validation = validateScheduleEntries(entries);
  if (!validation.valid) {
    res.status(400).json({ error: validation.errors[0] });
    return;
  }

  // Verify all aircraft belong to user and build DB records
  const validatedEntries: Array<{ aircraft_id: number; start_time: string; end_time: string }> = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const aircraft = getAircraftById(entry.aircraftId, userId);
    if (!aircraft) {
      res.status(404).json({ error: `Entry ${i + 1}: Aircraft not found` });
      return;
    }
    validatedEntries.push({
      aircraft_id: entry.aircraftId,
      start_time: entry.startTime,
      end_time: entry.endTime
    });
  }

  // Create all entries
  createScheduleEntries(userId, validatedEntries);

  try {
    // Re-compute the entire schedule
    const result = await computeSchedule(userId);
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Schedule computation error:', error);
    res.status(500).json({ error: error.message || 'Failed to compute schedule' });
  }
});

// PUT /api/schedule/entry/:id - Update start/end time for a schedule entry
router.put('/schedule/entry/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const userId = req.user!.id;
  const { startTime, endTime } = req.body;

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid entry ID' });
    return;
  }

  // Re-use validateScheduleEntry; supply dummy aircraftId=0 since PUT doesn't change aircraft
  const timeValidation = validateScheduleEntry({ aircraftId: 0, startTime, endTime });
  const timeErrors = timeValidation.errors.filter(e => !e.includes('Aircraft ID'));
  if (timeErrors.length > 0) {
    res.status(400).json({ error: timeErrors[0] });
    return;
  }

  const updated = updateScheduleEntry(id, userId, { start_time: startTime, end_time: endTime });
  if (!updated) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  try {
    const result = await computeSchedule(userId);
    res.json(result);
  } catch (error: any) {
    console.error('Schedule computation error:', error);
    res.status(500).json({ error: error.message || 'Failed to compute schedule' });
  }
});

// DELETE /api/schedule/entry/:id - Delete a schedule entry
router.delete('/schedule/entry/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const userId = req.user!.id;

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid entry ID' });
    return;
  }

  const deleted = deleteScheduleEntry(id, userId);
  if (!deleted) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  try {
    // Re-compute the schedule
    const result = await computeSchedule(userId);
    res.json(result);
  } catch (error: any) {
    console.error('Schedule computation error:', error);
    res.status(500).json({ error: error.message || 'Failed to compute schedule' });
  }
});

// DELETE /api/schedule/clear - Clear all schedule entries
router.delete('/schedule/clear', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  clearAllScheduleEntries(userId);
  res.json({ entries: [], placements: [], validationErrors: [] });
});

// Core orchestrator: fetch DB records, call service, handle errors
async function computeSchedule(userId: number): Promise<ScheduleResult> {
  const entries = getScheduleEntriesByUser(userId);

  if (entries.length === 0) {
    return { entries: [], placements: [], validationErrors: [] };
  }

  const hangars = getHangarsByUser(userId);

  if (hangars.length === 0) {
    return {
      entries,
      placements: entries.map(e => ({
        entryId: e.id,
        aircraftName: e.aircraft_name,
        hangar: null,
        bays: [],
        start: e.start_time,
        end: e.end_time,
        status: 'failed' as const,
        failureReason: 'No hangars defined',
      })),
      validationErrors: ['No hangars defined. Please add at least one hangar.'],
    };
  }

  const aircraft = getAircraftByUser(userId);
  const dslCode = generateDSLFromEntries(userId, aircraft, hangars, entries);

  try {
    const serviceResult = await runSchedule(dslCode, entries);

    if (serviceResult.parseErrors) {
      return {
        entries,
        placements: serviceResult.placements,
        validationErrors: serviceResult.validationErrors,
        dslCode,
      };
    }

    const { placements, validationErrors } = serviceResult;

    // Build scheduler diagnostics for failed entries (pointing at their DSL lines)
    const failedPlacements = placements.filter(p => p.status === 'failed');
    const failedEntryIds = new Set(failedPlacements.map(p => p.entryId));
    const schedulerDiagnostics: SchedulerDiagnosticItem[] = failedPlacements.map(p => ({
      severity: 2,
      message: formatSchedulerReason(p.aircraftName, p.failureReason ?? 'SCHEDULING_FAILED'),
      startLine: findAutoInductLine(dslCode, p.entryId),
      startColumn: 0,
      endLine: findAutoInductLine(dslCode, p.entryId),
      endColumn: 0,
      source: 'scheduler' as const,
    }));

    // Auto-remove infeasible entries so they don't persist across sessions
    for (const id of failedEntryIds) {
      deleteScheduleEntry(id, userId);
    }

    return {
      entries: entries.filter(e => !failedEntryIds.has(e.id)),
      placements: placements.filter(p => p.status === 'scheduled'),
      validationErrors,
      dslCode,
      schedulerDiagnostics,
    };
  } catch (error: any) {
    console.error('Schedule computation error:', error);
    return {
      entries,
      placements: entries.map(e => ({
        entryId: e.id,
        aircraftName: e.aircraft_name,
        hangar: null,
        bays: [],
        start: e.start_time,
        end: e.end_time,
        status: 'failed' as const,
        failureReason: error.message || 'Scheduler error',
      })),
      validationErrors: [error.message || 'Failed to run scheduler'],
      dslCode,
    };
  }
}

export default router;
