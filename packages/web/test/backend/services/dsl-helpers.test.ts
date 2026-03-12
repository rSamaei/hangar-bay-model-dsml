import { describe, it, expect } from 'vitest';
import {
  toFloat,
  formatDateTime,
  sanitizeName,
  generateDSLCode,
  type ScheduleEntryForDSL,
} from '../../../backend/services/dsl-helpers';

// ── toFloat ───────────────────────────────────────────────────────────────────

describe('toFloat', () => {
  it('appends .0 to an integer value', () => {
    expect(toFloat(32)).toBe('32.0');
  });

  it('appends .0 to zero', () => {
    expect(toFloat(0)).toBe('0.0');
  });

  it('preserves a fractional value as-is', () => {
    expect(toFloat(32.5)).toBe('32.5');
  });

  it('treats a JS float that equals an integer as an integer (e.g. 10.0)', () => {
    // Number.isInteger(10.0) === true in JS
    expect(toFloat(10.0)).toBe('10.0');
  });

  it('preserves a non-trivial decimal', () => {
    expect(toFloat(7.25)).toBe('7.25');
  });
});

// ── formatDateTime ─────────────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('round-trips a local-time datetime string', () => {
    expect(formatDateTime('2024-06-01T08:30')).toBe('2024-06-01T08:30');
  });

  it('round-trips a datetime at midnight', () => {
    expect(formatDateTime('2024-06-01T00:00')).toBe('2024-06-01T00:00');
  });

  it('pads single-digit month and day', () => {
    const result = formatDateTime('2024-01-05T09:05');
    expect(result).toBe('2024-01-05T09:05');
  });

  it('outputs the correct YYYY-MM-DDTHH:mm format', () => {
    const result = formatDateTime('2024-12-31T23:59');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ── sanitizeName ──────────────────────────────────────────────────────────────

describe('sanitizeName', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeName('Alpha Hangar')).toBe('Alpha_Hangar');
  });

  it('replaces hyphens with underscores', () => {
    expect(sanitizeName('Bay-A')).toBe('Bay_A');
  });

  it('replaces multiple special characters', () => {
    expect(sanitizeName('Bay-A/B')).toBe('Bay_A_B');
  });

  it('prepends underscore when name starts with a digit', () => {
    expect(sanitizeName('1Bay')).toBe('_1Bay');
  });

  it('leaves an already-valid identifier unchanged', () => {
    expect(sanitizeName('AlphaHangar')).toBe('AlphaHangar');
  });

  it('handles a name that is only a digit', () => {
    expect(sanitizeName('7')).toBe('_7');
  });
});

// ── generateDSLCode ───────────────────────────────────────────────────────────

describe('generateDSLCode', () => {
  const cessna = {
    id: 1, name: 'Cessna172', wingspan: 11, length: 8, height: 3, tail_height: 2,
  };

  const singleBayHangar = {
    id: 1, name: 'AlphaHangar',
    bays: [{ id: 1, name: 'Bay1', width: 15, depth: 12, height: 5 }],
  };

  const entry: ScheduleEntryForDSL = {
    id: 7,
    aircraft_name: 'Cessna172',
    start_time: '2024-06-01T08:00',
    end_time:   '2024-06-01T12:00',
  };

  it('opens with the correct airfield identifier', () => {
    const dsl = generateDSLCode(42, [cessna], [singleBayHangar], [entry]);
    expect(dsl).toContain('airfield User42_Airfield {');
  });

  it('emits an aircraft block with correct dimensions', () => {
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], []);
    expect(dsl).toContain('aircraft Cessna172 {');
    expect(dsl).toContain('wingspan 11.0 m');
    expect(dsl).toContain('length 8.0 m');
    expect(dsl).toContain('height 3.0 m');
    expect(dsl).toContain('tailHeight 2.0 m');
  });

  it('sanitizes aircraft name with spaces', () => {
    const dsl = generateDSLCode(1, [{ ...cessna, name: 'Cessna 172' }], [singleBayHangar], []);
    expect(dsl).toContain('aircraft Cessna_172 {');
  });

  it('emits a hangar block with a door', () => {
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], []);
    expect(dsl).toContain('hangar AlphaHangar {');
    expect(dsl).toContain('door AlphaHangarDoor {');
  });

  it('door defaults to 20×10 when all bays are smaller', () => {
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], []);
    expect(dsl).toContain('width 20.0 m');
    expect(dsl).toContain('height 10.0 m');
  });

  it('door uses max bay dimensions when they exceed the 20×10 floor', () => {
    const wideBayHangar = {
      id: 2, name: 'BigHangar',
      bays: [{ id: 1, name: 'WBay', width: 30, depth: 20, height: 12 }],
    };
    const dsl = generateDSLCode(1, [cessna], [wideBayHangar], []);
    // Door width should use 30 m (from bay), height 12 m (from bay)
    expect(dsl).toContain('width 30.0 m');
    expect(dsl).toContain('height 12.0 m');
  });

  it('emits a bay block with correct placement and dimensions', () => {
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], []);
    expect(dsl).toContain('bay Bay1 {');
    expect(dsl).toContain('at row 0 col 0');
    expect(dsl).toContain('width 15.0 m');
    expect(dsl).toContain('depth 12.0 m');
    expect(dsl).toContain('height 5.0 m');
  });

  it('does NOT emit an adjacent clause for a single-bay hangar', () => {
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], []);
    expect(dsl).not.toContain('adjacent');
  });

  it('emits bidirectional adjacent clauses for a two-bay hangar', () => {
    const twoBayHangar = {
      id: 1, name: 'TwoHangar',
      bays: [
        { id: 1, name: 'BayA', width: 15, depth: 12, height: 5 },
        { id: 2, name: 'BayB', width: 15, depth: 12, height: 5 },
      ],
    };
    const dsl = generateDSLCode(1, [cessna], [twoBayHangar], []);
    // BayA neighbours BayB and vice-versa
    expect(dsl).toMatch(/bay BayA \{[^}]*adjacent \{ BayB \}/s);
    expect(dsl).toMatch(/bay BayB \{[^}]*adjacent \{ BayA \}/s);
  });

  it('emits correct adjacent neighbours for the middle bay in a three-bay row', () => {
    const threeBayHangar = {
      id: 1, name: 'ThreeHangar',
      bays: [
        { id: 1, name: 'X', width: 10, depth: 10, height: 5 },
        { id: 2, name: 'Y', width: 10, depth: 10, height: 5 },
        { id: 3, name: 'Z', width: 10, depth: 10, height: 5 },
      ],
    };
    const dsl = generateDSLCode(1, [cessna], [threeBayHangar], []);
    // Middle bay Y lists both X and Z
    expect(dsl).toMatch(/bay Y \{[^}]*adjacent \{ X Z \}/s);
  });

  it('emits an auto-induct block for a schedule entry', () => {
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], [entry]);
    expect(dsl).toContain('auto-induct id "entry_7" Cessna172 duration 240 minutes');
  });

  it('calculates duration in minutes correctly', () => {
    const shortEntry: ScheduleEntryForDSL = {
      id: 1,
      aircraft_name: 'Cessna172',
      start_time: '2024-06-01T08:00',
      end_time:   '2024-06-01T09:30', // 90 minutes
    };
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], [shortEntry]);
    expect(dsl).toContain('duration 90 minutes');
  });

  it('uses 1 minute as minimum duration', () => {
    const instantEntry: ScheduleEntryForDSL = {
      id: 2,
      aircraft_name: 'Cessna172',
      start_time: '2024-06-01T08:00',
      end_time:   '2024-06-01T08:00', // 0 ms → clamped to 1 minute
    };
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], [instantEntry]);
    expect(dsl).toContain('duration 1 minutes');
  });

  it('emits correct notBefore and notAfter for an entry', () => {
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], [entry]);
    expect(dsl).toContain('notBefore 2024-06-01T08:00');
    expect(dsl).toContain('notAfter 2024-06-01T12:00');
  });

  it('includes all aircraft when multiple are provided', () => {
    const spitfire = {
      id: 2, name: 'Spitfire', wingspan: 11, length: 9, height: 3, tail_height: 2,
    };
    const dsl = generateDSLCode(1, [cessna, spitfire], [singleBayHangar], []);
    expect(dsl).toContain('aircraft Cessna172 {');
    expect(dsl).toContain('aircraft Spitfire {');
  });

  it('includes all hangars when multiple are provided', () => {
    const hangar2 = {
      id: 2, name: 'BetaHangar',
      bays: [{ id: 2, name: 'Bay2', width: 20, depth: 15, height: 6 }],
    };
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar, hangar2], []);
    expect(dsl).toContain('hangar AlphaHangar {');
    expect(dsl).toContain('hangar BetaHangar {');
  });

  it('sanitizes hangar and bay names containing spaces', () => {
    const spacedHangar = {
      id: 1, name: 'Alpha Hangar',
      bays: [{ id: 1, name: 'Bay 1', width: 15, depth: 12, height: 5 }],
    };
    const dsl = generateDSLCode(1, [cessna], [spacedHangar], []);
    expect(dsl).toContain('hangar Alpha_Hangar {');
    expect(dsl).toContain('bay Bay_1 {');
    expect(dsl).toContain('door Alpha_HangarDoor {');
  });

  it('closes the airfield block with a closing brace', () => {
    const dsl = generateDSLCode(1, [cessna], [singleBayHangar], [entry]);
    expect(dsl.trimEnd()).toMatch(/\}$/);
  });
});
