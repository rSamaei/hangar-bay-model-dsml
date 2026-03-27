/**
 * Business-logic layer for scheduling operations.
 *
 * Separates parse/schedule/extract logic from Express route handlers so that
 * each function can be unit-tested with plain objects (no req/res).
 */

import { parseDocument } from './document-parser.js';
import { analyseAndSchedule, type ExportModel } from '@airfield/simulator';
import { generateDSLCode } from './dsl-helpers.js';
import type { ScheduleEntryWithDetails } from '../db/database.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ScheduledPlacement {
  entryId: number;
  aircraftName: string;
  hangar: string | null;
  bays: string[];
  start: string;
  end: string;
  status: 'scheduled' | 'failed';
  failureReason?: string;
}

export interface ScheduleServiceResult {
  placements: ScheduledPlacement[];
  validationErrors: string[];
  dslCode?: string;
  parseErrors?: string[];
}

// ---------------------------------------------------------------------------
// generateDSLFromEntries
// ---------------------------------------------------------------------------

/**
 * Builds the full airfield DSL string from DB records.
 * Thin wrapper around generateDSLCode to give it a name matching the plan.
 */
export function generateDSLFromEntries(
  userId: number,
  aircraft: any[],
  hangars: any[],
  entries: ScheduleEntryWithDetails[],
): string {
  return generateDSLCode(userId, aircraft, hangars, entries);
}

// ---------------------------------------------------------------------------
// computeSchedule
// ---------------------------------------------------------------------------

/**
 * Parses `dslCode` with Langium and runs the scheduler.
 * Returns placements (or parse errors if the DSL is malformed) and
 * the raw validation errors from the analysis report.
 */
export async function computeSchedule(
  dslCode: string,
  entries: ScheduleEntryWithDetails[],
): Promise<ScheduleServiceResult> {
  const parseResult = await parseDocument(dslCode);

  if (parseResult.hasParseErrors) {
    return {
      placements: entries.map(e => ({
        entryId: e.id,
        aircraftName: e.aircraft_name,
        hangar: null,
        bays: [],
        start: e.start_time,
        end: e.end_time,
        status: 'failed' as const,
        failureReason: 'DSL parse error',
      })),
      validationErrors: parseResult.parseErrors.map(e => e.message),
      parseErrors: parseResult.parseErrors.map(e => e.message),
      dslCode,
    };
  }

  const analysisResult = analyseAndSchedule(parseResult.model!);
  const placements = extractPlacements(entries, analysisResult.exportModel);
  const validationErrors = analysisResult.report.violations.map(v => v.message);

  return { placements, validationErrors, dslCode };
}

// ---------------------------------------------------------------------------
// extractPlacements
// ---------------------------------------------------------------------------

/**
 * Maps simulation output back to schedule entry IDs.
 */
export function extractPlacements(
  entries: ScheduleEntryWithDetails[],
  exportModel: ExportModel,
): ScheduledPlacement[] {
  const scheduled = exportModel.autoSchedule?.scheduled ?? [];
  const unscheduled = exportModel.autoSchedule?.unscheduled ?? [];

  return entries.map(entry => {
    const entryIdPattern = `entry_${entry.id}`;
    const scheduledMatch = scheduled.find(s => s.id === entryIdPattern);

    if (scheduledMatch) {
      return {
        entryId: entry.id,
        aircraftName: entry.aircraft_name,
        hangar: scheduledMatch.hangar,
        bays: scheduledMatch.bays,
        start: scheduledMatch.start,
        end: scheduledMatch.end,
        status: 'scheduled' as const,
      };
    }

    const unscheduledMatch = unscheduled.find(u => u.id === entryIdPattern);
    return {
      entryId: entry.id,
      aircraftName: entry.aircraft_name,
      hangar: null,
      bays: [],
      start: entry.start_time,
      end: entry.end_time,
      status: 'failed' as const,
      failureReason: unscheduledMatch?.reasonRuleId ?? 'SCHEDULING_FAILED',
    };
  });
}
