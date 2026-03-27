/**
 * Unit tests for scheduling-service.ts
 *
 * Covers extractPlacements (pure), generateDSLFromEntries (thin wrapper),
 * and computeSchedule (mocked parseDocument + analyseAndSchedule).
 */
import { describe, expect, test, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before dynamic imports
// ---------------------------------------------------------------------------

vi.mock('../../../backend/services/document-parser.js', () => ({
  parseDocument: vi.fn(),
}));

vi.mock('@airfield/simulator', () => ({
  analyseAndSchedule: vi.fn(),
}));

vi.mock('../../../backend/services/dsl-helpers.js', () => ({
  generateDSLCode: vi.fn().mockReturnValue('airfield Mock {}'),
}));

import { parseDocument } from '../../../backend/services/document-parser.js';
import { analyseAndSchedule } from '@airfield/simulator';
import {
  extractPlacements,
  computeSchedule,
  generateDSLFromEntries,
} from '../../../backend/services/scheduling-service.js';

const mockParseDocument = parseDocument as ReturnType<typeof vi.fn>;
const mockAnalyseAndSchedule = analyseAndSchedule as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkEntry(id: number, aircraftName = 'Cessna') {
  return {
    id,
    user_id: 42,
    aircraft_id: id,
    aircraft_name: aircraftName,
    start_time: '2024-06-01T08:00',
    end_time: '2024-06-01T10:00',
  };
}

// ---------------------------------------------------------------------------
// extractPlacements — pure function
// ---------------------------------------------------------------------------

describe('extractPlacements', () => {
  test('maps scheduled entry correctly', () => {
    const entries = [mkEntry(1)];
    const exportModel: any = {
      autoSchedule: {
        scheduled: [{ id: 'entry_1', hangar: 'AlphaHangar', bays: ['Bay1'], start: '2024-06-01T08:00', end: '2024-06-01T10:00' }],
        unscheduled: [],
      },
    };
    const placements = extractPlacements(entries, exportModel);
    expect(placements).toHaveLength(1);
    expect(placements[0].status).toBe('scheduled');
    expect(placements[0].hangar).toBe('AlphaHangar');
    expect(placements[0].bays).toContain('Bay1');
    expect(placements[0].entryId).toBe(1);
  });

  test('maps unscheduled entry with reasonRuleId', () => {
    const entries = [mkEntry(2, 'Hawk')];
    const exportModel: any = {
      autoSchedule: {
        scheduled: [],
        unscheduled: [{ id: 'entry_2', reasonRuleId: 'NO_SUITABLE_BAY_SET' }],
      },
    };
    const placements = extractPlacements(entries, exportModel);
    expect(placements[0].status).toBe('failed');
    expect(placements[0].failureReason).toBe('NO_SUITABLE_BAY_SET');
  });

  test('falls back to SCHEDULING_FAILED for entry not in either list', () => {
    const entries = [mkEntry(3)];
    const exportModel: any = { autoSchedule: { scheduled: [], unscheduled: [] } };
    const placements = extractPlacements(entries, exportModel);
    expect(placements[0].status).toBe('failed');
    expect(placements[0].failureReason).toBe('SCHEDULING_FAILED');
  });

  test('handles missing autoSchedule block', () => {
    const entries = [mkEntry(1)];
    const placements = extractPlacements(entries, {} as any);
    expect(placements[0].status).toBe('failed');
    expect(placements[0].failureReason).toBe('SCHEDULING_FAILED');
  });

  test('maps multiple entries independently', () => {
    const entries = [mkEntry(1), mkEntry(2, 'Hawk')];
    const exportModel: any = {
      autoSchedule: {
        scheduled: [{ id: 'entry_1', hangar: 'H1', bays: ['B1'], start: '', end: '' }],
        unscheduled: [{ id: 'entry_2', reasonRuleId: 'SFR11_DOOR_FIT' }],
      },
    };
    const placements = extractPlacements(entries, exportModel);
    expect(placements[0].status).toBe('scheduled');
    expect(placements[1].status).toBe('failed');
    expect(placements[1].aircraftName).toBe('Hawk');
  });
});

// ---------------------------------------------------------------------------
// generateDSLFromEntries — thin wrapper
// ---------------------------------------------------------------------------

describe('generateDSLFromEntries', () => {
  test('delegates to generateDSLCode and returns its result', () => {
    const result = generateDSLFromEntries(42, [], [], []);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// computeSchedule
// ---------------------------------------------------------------------------

describe('computeSchedule', () => {
  test('returns parse errors when DSL has parse errors', async () => {
    mockParseDocument.mockResolvedValue({
      hasParseErrors: true,
      parseErrors: [{ message: 'Unexpected token' }],
      model: null,
      document: {},
      validationDiagnostics: [],
    });

    const entries = [mkEntry(1)];
    const result = await computeSchedule('bad dsl', entries);

    expect(result.parseErrors).toBeDefined();
    expect(result.parseErrors![0]).toContain('Unexpected token');
    expect(result.validationErrors[0]).toContain('Unexpected token');
    expect(result.placements[0].status).toBe('failed');
    expect(result.placements[0].failureReason).toBe('DSL parse error');
  });

  test('returns placements when DSL parses successfully', async () => {
    const fakeModel = {};
    mockParseDocument.mockResolvedValue({
      hasParseErrors: false,
      parseErrors: [],
      model: fakeModel,
      document: {},
      validationDiagnostics: [],
    });

    mockAnalyseAndSchedule.mockReturnValue({
      exportModel: {
        autoSchedule: {
          scheduled: [{ id: 'entry_1', hangar: 'H1', bays: ['B1'], start: '2024-06-01T08:00', end: '2024-06-01T10:00' }],
          unscheduled: [],
        },
      },
      report: { violations: [] },
    });

    const entries = [mkEntry(1)];
    const result = await computeSchedule('valid dsl', entries);

    expect(result.parseErrors).toBeUndefined();
    expect(result.placements[0].status).toBe('scheduled');
    expect(result.validationErrors).toHaveLength(0);
  });

  test('includes validation errors from analysis report', async () => {
    const fakeModel = {};
    mockParseDocument.mockResolvedValue({
      hasParseErrors: false,
      parseErrors: [],
      model: fakeModel,
      document: {},
      validationDiagnostics: [],
    });

    mockAnalyseAndSchedule.mockReturnValue({
      exportModel: { autoSchedule: { scheduled: [], unscheduled: [{ id: 'entry_1', reasonRuleId: 'NO_SUITABLE_BAY_SET' }] } },
      report: { violations: [{ message: 'Bay not found' }] },
    });

    const entries = [mkEntry(1)];
    const result = await computeSchedule('valid dsl', entries);

    expect(result.validationErrors).toContain('Bay not found');
    expect(result.placements[0].status).toBe('failed');
  });
});
