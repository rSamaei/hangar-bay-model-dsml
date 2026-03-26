/**
 * Tests for scheduling.ts — pure helper functions.
 *
 * Covers the exported pure functions:
 *   - formatSchedulerReason  (all switch branches)
 *   - findAutoInductLine     (found / not found)
 *   - extractPlacements      (scheduled match / unscheduled match / fallback)
 *
 * Route-level tests require complex DB + DSL mocking and are lower priority;
 * the pure function tests provide the majority of the coverage gain here.
 */
import { describe, expect, test } from 'vitest';
import {
  formatSchedulerReason,
  findAutoInductLine,
  extractPlacements
} from '../../../backend/routes/scheduling.js';

// ---------------------------------------------------------------------------
// formatSchedulerReason
// ---------------------------------------------------------------------------

describe('formatSchedulerReason', () => {
  test('NO_SUITABLE_BAY_SET → SCHED_NO_BAY message', () => {
    const msg = formatSchedulerReason('Cessna', 'NO_SUITABLE_BAY_SET');
    expect(msg).toContain('SCHED_NO_BAY');
    expect(msg).toContain('Cessna');
  });

  test('SFR11_DOOR_FIT → SCHED_DOOR_FIT message', () => {
    const msg = formatSchedulerReason('Hawk', 'SFR11_DOOR_FIT');
    expect(msg).toContain('SCHED_DOOR_FIT');
    expect(msg).toContain('Hawk');
  });

  test('SFR16_TIME_OVERLAP → SCHED_TIME_OVERLAP message', () => {
    const msg = formatSchedulerReason('A400M', 'SFR16_TIME_OVERLAP');
    expect(msg).toContain('SCHED_TIME_OVERLAP');
  });

  test('unknown ruleId → SCHED_FAILURE message containing ruleId', () => {
    const msg = formatSchedulerReason('Scout', 'CUSTOM_REASON');
    expect(msg).toContain('SCHED_FAILURE');
    expect(msg).toContain('CUSTOM_REASON');
    expect(msg).toContain('Scout');
  });
});

// ---------------------------------------------------------------------------
// findAutoInductLine
// ---------------------------------------------------------------------------

const SAMPLE_DSL = [
  'airfield X {',
  '    auto-induct id "entry_1" Cessna',
  '        duration 60 minutes;',
  '    auto-induct id "entry_42" Hawk',
  '        duration 120 minutes;',
  '}'
].join('\n');

describe('findAutoInductLine', () => {
  test('returns the 1-based line number when entryId is found', () => {
    const line = findAutoInductLine(SAMPLE_DSL, 1);
    expect(line).toBe(2); // line 2 in 1-based numbering
  });

  test('returns the correct line for a different entryId', () => {
    const line = findAutoInductLine(SAMPLE_DSL, 42);
    expect(line).toBe(4);
  });

  test('returns 1 (fallback) when entryId is not found', () => {
    const line = findAutoInductLine(SAMPLE_DSL, 999);
    expect(line).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// extractPlacements
// ---------------------------------------------------------------------------

function mkEntry(id: number, aircraftName: string) {
  return { id, aircraft_name: aircraftName, start_time: '2030-01-01T08:00', end_time: '2030-01-01T10:00' };
}

function mkExportModel(scheduled: any[], unscheduled: any[]) {
  return { autoSchedule: { scheduled, unscheduled } } as any;
}

describe('extractPlacements', () => {
  test('scheduled entry maps to status=scheduled with hangar and bays', () => {
    const entries = [mkEntry(1, 'Cessna')];
    const model = mkExportModel(
      [{ id: 'entry_1', hangar: 'Alpha', bays: ['Bay1'], start: '2030-01-01T08:00', end: '2030-01-01T09:00' }],
      []
    );
    const placements = extractPlacements(entries, model);
    expect(placements[0].status).toBe('scheduled');
    expect(placements[0].hangar).toBe('Alpha');
    expect(placements[0].bays).toContain('Bay1');
  });

  test('unscheduled entry maps to status=failed with reasonRuleId', () => {
    const entries = [mkEntry(2, 'Hawk')];
    const model = mkExportModel(
      [],
      [{ id: 'entry_2', reasonRuleId: 'SFR11_DOOR_FIT' }]
    );
    const placements = extractPlacements(entries, model);
    expect(placements[0].status).toBe('failed');
    expect(placements[0].failureReason).toBe('SFR11_DOOR_FIT');
  });

  test('entry matching neither scheduled nor unscheduled falls back to SCHEDULING_FAILED', () => {
    const entries = [mkEntry(3, 'Scout')];
    const model = mkExportModel([], []);
    const placements = extractPlacements(entries, model);
    expect(placements[0].status).toBe('failed');
    expect(placements[0].failureReason).toBe('SCHEDULING_FAILED');
  });

  test('multiple entries are mapped independently', () => {
    const entries = [mkEntry(1, 'Cessna'), mkEntry(2, 'Hawk')];
    const model = mkExportModel(
      [{ id: 'entry_1', hangar: 'Alpha', bays: ['Bay1'], start: '2030-01-01T08:00', end: '2030-01-01T09:00' }],
      [{ id: 'entry_2', reasonRuleId: 'NO_SUITABLE_BAY_SET' }]
    );
    const placements = extractPlacements(entries, model);
    expect(placements[0].status).toBe('scheduled');
    expect(placements[1].status).toBe('failed');
  });

  test('handles missing autoSchedule block gracefully', () => {
    const entries = [mkEntry(1, 'Cessna')];
    const model = {} as any; // no autoSchedule
    const placements = extractPlacements(entries, model);
    expect(placements[0].status).toBe('failed');
  });
});
