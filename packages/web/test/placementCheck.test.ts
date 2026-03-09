import { describe, it, expect } from 'vitest';
import { checkPlacement } from '../frontend/pages/schedule/utils/placementCheck';
import type { Aircraft, HangarBay, ScheduledPlacement } from '../frontend/pages/schedule/types';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: 1, user_id: 1, name: 'TestAC',
    wingspan: 20, length: 15, height: 5, tail_height: 4,
    created_at: '2024-01-01T00:00',
    ...overrides,
  };
}

function makeBay(overrides: Partial<HangarBay> = {}): HangarBay {
  return {
    id: 1, hangar_id: 1, name: 'Bay1',
    width: 25, depth: 20, height: 6,
    ...overrides,
  };
}

function makePlacement(overrides: Partial<ScheduledPlacement> = {}): ScheduledPlacement {
  return {
    entryId: 99,
    aircraftName: 'OtherAC',
    hangar: 'TestHangar',
    bays: ['Bay1'],
    start: '2024-06-01T10:00',
    end:   '2024-06-01T14:00',
    status: 'scheduled',
    ...overrides,
  };
}

// Fixed time window for tests: 08:00 – 16:00 on 2024-06-01 (local time)
const START = new Date('2024-06-01T08:00').getTime();
const END   = new Date('2024-06-01T16:00').getTime();

// ── No bays ───────────────────────────────────────────────────────────────────

describe('no bays', () => {
  it('returns red with "No bays selected" when bay array is empty', () => {
    const result = checkPlacement(makeAircraft(), [], START, END, [], 'TestHangar');
    expect(result.valid).toBe(false);
    expect(result.color).toBe('red');
    expect(result.issues).toContain('No bays selected');
  });
});

// ── Bay width (wingspan) check ─────────────────────────────────────────────────

describe('bay width vs wingspan', () => {
  it('fails when single bay is narrower than aircraft wingspan', () => {
    const result = checkPlacement(
      makeAircraft({ wingspan: 30 }),
      [makeBay({ width: 25 })],
      START, END, [], 'TestHangar',
    );
    expect(result.valid).toBe(false);
    expect(result.color).toBe('red');
    expect(result.issues[0]).toMatch(/Width.*wingspan/);
  });

  it('passes when single bay width equals aircraft wingspan exactly', () => {
    const result = checkPlacement(
      makeAircraft({ wingspan: 25 }),
      [makeBay({ width: 25 })],
      START, END, [], 'TestHangar',
    );
    expect(result.issues.filter(i => i.includes('wingspan'))).toHaveLength(0);
  });

  it('passes when combined multi-bay width meets wingspan', () => {
    const result = checkPlacement(
      makeAircraft({ wingspan: 30 }),
      [makeBay({ id: 1, name: 'Bay1', width: 15 }), makeBay({ id: 2, name: 'Bay2', width: 15 })],
      START, END, [], 'TestHangar',
    );
    expect(result.valid).toBe(true);
    expect(result.color).toBe('green');
  });

  it('fails when combined multi-bay width is still less than wingspan', () => {
    const result = checkPlacement(
      makeAircraft({ wingspan: 35 }),
      [makeBay({ id: 1, name: 'Bay1', width: 15 }), makeBay({ id: 2, name: 'Bay2', width: 15 })],
      START, END, [], 'TestHangar',
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/Width.*wingspan/);
  });
});

// ── Bay depth (aircraft length) check ─────────────────────────────────────────

describe('bay depth vs aircraft length', () => {
  it('fails when the shallowest bay is shorter than aircraft length', () => {
    const result = checkPlacement(
      makeAircraft({ length: 20 }),
      [makeBay({ depth: 15 })],
      START, END, [], 'TestHangar',
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/Depth.*length/);
  });

  it('passes when bay depth exactly equals aircraft length', () => {
    const result = checkPlacement(
      makeAircraft({ length: 15 }),
      [makeBay({ depth: 15 })],
      START, END, [], 'TestHangar',
    );
    expect(result.issues.filter(i => i.includes('length'))).toHaveLength(0);
  });

  it('uses the minimum depth across multiple bays', () => {
    const result = checkPlacement(
      makeAircraft({ length: 18 }),
      [
        makeBay({ id: 1, name: 'Bay1', depth: 20 }),
        makeBay({ id: 2, name: 'Bay2', depth: 15 }),
      ],
      START, END, [], 'TestHangar',
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/Depth 15\.0 m/);
  });
});

// ── Bay height vs aircraft height check ───────────────────────────────────────

describe('bay height vs aircraft height', () => {
  it('fails when minimum bay height is less than aircraft height', () => {
    const result = checkPlacement(
      makeAircraft({ height: 5 }),
      [makeBay({ height: 4 })],
      START, END, [], 'TestHangar',
    );
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/Height.*aircraft height/);
  });

  it('passes when bay height exactly equals aircraft height', () => {
    const result = checkPlacement(
      makeAircraft({ height: 5 }),
      [makeBay({ height: 5 })],
      START, END, [], 'TestHangar',
    );
    expect(result.issues.filter(i => i.includes('aircraft height'))).toHaveLength(0);
  });

  it('skips height check when aircraft height is zero', () => {
    const result = checkPlacement(
      makeAircraft({ height: 0 }),
      [makeBay({ height: 1 })],
      START, END, [], 'TestHangar',
    );
    expect(result.issues.filter(i => i.includes('aircraft height'))).toHaveLength(0);
  });
});

// ── Time-overlap detection ─────────────────────────────────────────────────────

describe('time-overlap detection', () => {
  const bay  = makeBay({ name: 'Bay1' });
  const ac   = makeAircraft();

  it('detects overlap with an existing placement sharing the same bay and hangar', () => {
    const existing = makePlacement({
      hangar: 'TestHangar',
      bays: ['Bay1'],
      start: '2024-06-01T06:00',
      end:   '2024-06-01T10:00',
    });
    const result = checkPlacement(ac, [bay], START, END, [existing], 'TestHangar');
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/conflict/i);
  });

  it('returns no conflict when existing placement ends before new one starts', () => {
    const existing = makePlacement({
      hangar: 'TestHangar',
      bays: ['Bay1'],
      start: '2024-06-01T04:00',
      end:   '2024-06-01T08:00', // ends exactly at START — no overlap
    });
    const result = checkPlacement(ac, [bay], START, END, [existing], 'TestHangar');
    expect(result.valid).toBe(true);
  });

  it('returns no conflict when existing placement starts at or after new end', () => {
    const existing = makePlacement({
      hangar: 'TestHangar',
      bays: ['Bay1'],
      start: '2024-06-01T16:00', // starts exactly at END
      end:   '2024-06-01T20:00',
    });
    const result = checkPlacement(ac, [bay], START, END, [existing], 'TestHangar');
    expect(result.valid).toBe(true);
  });

  it('ignores placements in a different hangar', () => {
    const existing = makePlacement({
      hangar: 'OtherHangar',
      bays: ['Bay1'],
      start: '2024-06-01T06:00',
      end:   '2024-06-01T12:00',
    });
    const result = checkPlacement(ac, [bay], START, END, [existing], 'TestHangar');
    expect(result.valid).toBe(true);
  });

  it('ignores placements in a different bay', () => {
    const existing = makePlacement({
      hangar: 'TestHangar',
      bays: ['Bay2'],
      start: '2024-06-01T06:00',
      end:   '2024-06-01T12:00',
    });
    const result = checkPlacement(ac, [bay], START, END, [existing], 'TestHangar');
    expect(result.valid).toBe(true);
  });

  it('does not count failed placements as conflicts', () => {
    const existing = makePlacement({
      hangar: 'TestHangar',
      bays: ['Bay1'],
      start: '2024-06-01T06:00',
      end:   '2024-06-01T12:00',
      status: 'failed',
    });
    const result = checkPlacement(ac, [bay], START, END, [existing], 'TestHangar');
    expect(result.valid).toBe(true);
  });

  it('matches when existing placement stores the sanitized bay name', () => {
    const bayWithSpaces = makeBay({ name: 'Bay 1' });
    const existing = makePlacement({
      hangar: 'TestHangar',
      bays: ['Bay_1'],            // sanitized form stored by the scheduler
      start: '2024-06-01T06:00',
      end:   '2024-06-01T12:00',
    });
    const result = checkPlacement(ac, [bayWithSpaces], START, END, [existing], 'TestHangar');
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatch(/conflict/i);
  });

  it('matches when placement hangar name is the sanitized form', () => {
    const existing = makePlacement({
      hangar: 'Test_Hangar',      // sanitized form of "Test Hangar"
      bays: ['Bay1'],
      start: '2024-06-01T06:00',
      end:   '2024-06-01T12:00',
    });
    const result = checkPlacement(ac, [bay], START, END, [existing], 'Test Hangar');
    expect(result.valid).toBe(false);
  });
});

// ── Full green path ───────────────────────────────────────────────────────────

describe('overall valid placement', () => {
  it('returns green when dimensions fit and no time conflicts exist', () => {
    const result = checkPlacement(
      makeAircraft({ wingspan: 20, length: 15, height: 5 }),
      [makeBay({ width: 25, depth: 20, height: 6 })],
      START, END, [], 'TestHangar',
    );
    expect(result.valid).toBe(true);
    expect(result.color).toBe('green');
    expect(result.issues).toHaveLength(0);
  });
});
