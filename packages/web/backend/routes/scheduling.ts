import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import {
  getScheduleEntriesByUser,
  createScheduleEntry,
  createScheduleEntries,
  deleteScheduleEntry,
  clearAllScheduleEntries,
  getAircraftByUser,
  getHangarsByUser,
  getAircraftById,
  type ScheduleEntryWithDetails
} from '../db/database.js';
import { parseDocument } from '../services/document-parser.js';
import { analyzeAndSchedule } from '@airfield/simulator';

const router = Router();

// Type for scheduled placement result
interface ScheduledPlacement {
  entryId: number;
  aircraftName: string;
  hangar: string | null;
  bays: string[];
  start: string;
  end: string;
  status: 'scheduled' | 'failed';
  failureReason?: string;
}

interface ScheduleResult {
  entries: ScheduleEntryWithDetails[];
  placements: ScheduledPlacement[];
  validationErrors: string[];
  dslCode?: string;
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
  const { aircraftId, startTime, endTime } = req.body;
  const userId = req.user!.id;

  // Validation
  if (typeof aircraftId !== 'number') {
    res.status(400).json({ error: 'Aircraft ID is required' });
    return;
  }

  if (!startTime || typeof startTime !== 'string') {
    res.status(400).json({ error: 'Start time is required' });
    return;
  }

  if (!endTime || typeof endTime !== 'string') {
    res.status(400).json({ error: 'End time is required' });
    return;
  }

  // Validate dates
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime())) {
    res.status(400).json({ error: 'Invalid start time format' });
    return;
  }

  if (isNaN(end.getTime())) {
    res.status(400).json({ error: 'Invalid end time format' });
    return;
  }

  if (end <= start) {
    res.status(400).json({ error: 'End time must be after start time' });
    return;
  }

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

  // Validate all entries
  const validatedEntries: Array<{ aircraft_id: number; start_time: string; end_time: string }> = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (typeof entry.aircraftId !== 'number') {
      res.status(400).json({ error: `Entry ${i + 1}: Aircraft ID is required` });
      return;
    }

    if (!entry.startTime || typeof entry.startTime !== 'string') {
      res.status(400).json({ error: `Entry ${i + 1}: Start time is required` });
      return;
    }

    if (!entry.endTime || typeof entry.endTime !== 'string') {
      res.status(400).json({ error: `Entry ${i + 1}: End time is required` });
      return;
    }

    const start = new Date(entry.startTime);
    const end = new Date(entry.endTime);

    if (isNaN(start.getTime())) {
      res.status(400).json({ error: `Entry ${i + 1}: Invalid start time format` });
      return;
    }

    if (isNaN(end.getTime())) {
      res.status(400).json({ error: `Entry ${i + 1}: Invalid end time format` });
      return;
    }

    if (end <= start) {
      res.status(400).json({ error: `Entry ${i + 1}: End time must be after start time` });
      return;
    }

    // Verify aircraft belongs to user
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

// Core function: compute placements for all schedule entries
async function computeSchedule(userId: number): Promise<ScheduleResult> {
  const entries = getScheduleEntriesByUser(userId);
  const aircraft = getAircraftByUser(userId);
  const hangars = getHangarsByUser(userId);

  // If no entries, return empty result
  if (entries.length === 0) {
    return { entries: [], placements: [], validationErrors: [] };
  }

  // If no hangars, all entries fail
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
        failureReason: 'No hangars defined'
      })),
      validationErrors: ['No hangars defined. Please add at least one hangar.']
    };
  }

  // Generate DSL and run scheduler
  const dslCode = generateDSLCode(userId, aircraft, hangars, entries);

  try {
    // Parse the DSL
    const parseResult = await parseDocument(dslCode);

    if (parseResult.hasParseErrors) {
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
          failureReason: 'DSL parse error'
        })),
        validationErrors: parseResult.parseErrors.map(e => e.message),
        dslCode
      };
    }

    if (!parseResult.model) {
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
          failureReason: 'No model parsed'
        })),
        validationErrors: ['Failed to parse model'],
        dslCode
      };
    }

    // Run the scheduler
    const analysisResult = analyzeAndSchedule(parseResult.model);

    // Extract placements from the result
    const placements = extractPlacements(entries, analysisResult.exportModel);
    const validationErrors = analysisResult.report?.violations?.map(v => v.message) || [];

    return { entries, placements, validationErrors, dslCode };
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
        failureReason: error.message || 'Scheduler error'
      })),
      validationErrors: [error.message || 'Failed to run scheduler'],
      dslCode
    };
  }
}

// Extract placements from the scheduler result
function extractPlacements(entries: ScheduleEntryWithDetails[], exportModel: any): ScheduledPlacement[] {
  if (!exportModel) {
    return entries.map(e => ({
      entryId: e.id,
      aircraftName: e.aircraft_name,
      hangar: null,
      bays: [],
      start: e.start_time,
      end: e.end_time,
      status: 'failed' as const,
      failureReason: 'No result from scheduler'
    }));
  }

  const placements: ScheduledPlacement[] = [];

  // Check scheduled auto-inductions
  const scheduled = exportModel.autoSchedule?.scheduled || [];
  const unscheduled = exportModel.autoSchedule?.unscheduled || [];

  for (const entry of entries) {
    // Find matching scheduled induction by ID pattern
    const entryIdPattern = `entry_${entry.id}`;
    const scheduledMatch = scheduled.find((s: any) => s.id === entryIdPattern);

    if (scheduledMatch) {
      placements.push({
        entryId: entry.id,
        aircraftName: entry.aircraft_name,
        hangar: scheduledMatch.hangar,
        bays: scheduledMatch.bays || [],
        start: scheduledMatch.start || entry.start_time,
        end: scheduledMatch.end || entry.end_time,
        status: 'scheduled'
      });
    } else {
      // Check if in unscheduled
      const unscheduledMatch = unscheduled.find((u: any) => u.id === entryIdPattern);

      placements.push({
        entryId: entry.id,
        aircraftName: entry.aircraft_name,
        hangar: null,
        bays: [],
        start: entry.start_time,
        end: entry.end_time,
        status: 'failed',
        failureReason: unscheduledMatch?.reason || 'Could not find suitable placement'
      });
    }
  }

  return placements;
}

// Generate DSL code from database data
function generateDSLCode(
  userId: number,
  aircraft: any[],
  hangars: any[],
  entries: ScheduleEntryWithDetails[]
): string {
  const lines: string[] = [];

  lines.push(`airfield User${userId}_Airfield {`);
  lines.push('');

  // Aircraft definitions
  for (const a of aircraft) {
    lines.push(`  aircraft ${sanitizeName(a.name)} {`);
    lines.push(`    wingspan ${toFloat(a.wingspan)} m`);
    lines.push(`    length ${toFloat(a.length)} m`);
    lines.push(`    height ${toFloat(a.height)} m`);
    lines.push(`    tailHeight ${toFloat(a.tail_height)} m`);
    lines.push('  }');
    lines.push('');
  }

  // Hangar definitions - must have doors and grid structure
  for (const h of hangars) {
    const hangarName = sanitizeName(h.name);
    lines.push(`  hangar ${hangarName} {`);

    // Generate a default door for the hangar
    // Use max bay dimensions for the door
    let maxWidth = 20.0;
    let maxHeight = 10.0;
    for (const bay of h.bays) {
      if (bay.width > maxWidth) maxWidth = bay.width;
      if (bay.height > maxHeight) maxHeight = bay.height;
    }

    lines.push('    doors {');
    lines.push(`      door ${hangarName}Door {`);
    lines.push(`        width ${toFloat(maxWidth)} m`);
    lines.push(`        height ${toFloat(maxHeight)} m`);
    lines.push('      }');
    lines.push('    }');

    // Generate grid with bays
    lines.push('    grid baygrid {');
    for (let i = 0; i < h.bays.length; i++) {
      const bay = h.bays[i];
      lines.push(`      bay ${sanitizeName(bay.name)} {`);
      lines.push(`        width ${toFloat(bay.width)} m`);
      lines.push(`        depth ${toFloat(bay.depth)} m`);
      lines.push(`        height ${toFloat(bay.height)} m`);
      lines.push('      }');
    }
    lines.push('    }');
    lines.push('  }');
    lines.push('');
  }

  // Schedule entries as auto-inductions (system decides where)
  for (const entry of entries) {
    const durationMs = new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime();
    const durationMinutes = Math.max(1, Math.round(durationMs / 60000));

    const aircraftName = sanitizeName(entry.aircraft_name);
    const notBefore = formatDateTime(entry.start_time);
    const notAfter = formatDateTime(entry.end_time);

    // Use first available hangar as preferred if any
    const preferClause = hangars.length > 0 ? `prefer ${sanitizeName(hangars[0].name)}` : '';

    lines.push(`  auto-induct id "entry_${entry.id}" ${aircraftName} duration ${durationMinutes} minutes`);
    if (preferClause) {
      lines.push(`    ${preferClause}`);
    }
    lines.push(`    notBefore ${notBefore}`);
    lines.push(`    notAfter ${notAfter};`);
    lines.push('');
  }

  lines.push('}');

  return lines.join('\n');
}

// Ensure a number is formatted as a FLOAT (with decimal point)
function toFloat(value: number): string {
  const num = Number(value);
  if (Number.isInteger(num)) {
    return num.toFixed(1); // e.g., 32 -> "32.0"
  }
  return num.toString();
}

// Format datetime to YYYY-MM-DDTHH:mm format (required by grammar)
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
}

export default router;
