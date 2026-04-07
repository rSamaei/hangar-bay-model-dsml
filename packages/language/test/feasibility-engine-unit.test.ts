/**
 * Unit tests for feasibility-engine.ts (L10).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses plain structural mocks — no Langium runtime.
 *
 * Coverage targets:
 *  - checkDoorFit: wingspan, height, tailHeight fallback, clearance, ok/fail
 *  - checkBayFit: width/depth/height, clearance, ok/fail
 *  - checkBaySetFit: lateral and longitudinal spans, height limiting bay
 *  - checkBayContiguity: single-bay early return, connected, disconnected
 *  - checkBayOwnership / checkDoorOwnership: membership check
 *  - checkTimeOverlap: overlap/touch/disjoint, interval evidence
 *  - validateInduction: with/without door, multi-bay contiguity call
 *  - findSuitableBays: filter semantics
 *  - generateValidationReport: filters failing results
 */
import { describe, expect, test } from 'vitest';
import {
    checkDoorFit,
    checkBayFit,
    checkBaySetFit,
    checkBayContiguity,
    checkBayOwnership,
    checkDoorOwnership,
    checkTimeOverlap,
    validateInduction,
    findSuitableBays,
    generateValidationReport,
} from '../src/feasibility-engine.js';
import type { AircraftType, HangarBay, HangarDoor, ClearanceEnvelope, Hangar } from '../src/generated/ast.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkAircraft(opts: {
    name?: string; wingspan?: number; length?: number; height?: number; tailHeight?: number;
} = {}): AircraftType {
    return {
        name:       opts.name       ?? 'Hawk',
        wingspan:   opts.wingspan   ?? 10,
        length:     opts.length     ?? 12,
        height:     opts.height     ?? 4,
        tailHeight: opts.tailHeight,
    } as unknown as AircraftType;
}

function mkDoor(name: string, width: number, height: number): HangarDoor {
    return { name, width, height } as unknown as HangarDoor;
}

function mkBay(
    name: string,
    dims: { width?: number; depth?: number; height?: number } = {},
    opts: { row?: number; col?: number; adjacent?: HangarBay[] } = {}
): HangarBay {
    return {
        name,
        width:  dims.width  ?? 20,
        depth:  dims.depth  ?? 20,
        height: dims.height ?? 6,
        row:    opts.row,
        col:    opts.col,
        adjacent: (opts.adjacent ?? []).map(b => ({ ref: b })),
    } as unknown as HangarBay;
}

function mkClearance(opts: {
    name?: string; lateralMargin?: number; longitudinalMargin?: number; verticalMargin?: number;
} = {}): ClearanceEnvelope {
    return {
        name:               opts.name               ?? 'C',
        lateralMargin:      opts.lateralMargin      ?? 0,
        longitudinalMargin: opts.longitudinalMargin ?? 0,
        verticalMargin:     opts.verticalMargin     ?? 0,
    } as unknown as ClearanceEnvelope;
}

function mkHangar(doors: HangarDoor[], bays: HangarBay[]): Hangar {
    return {
        name: 'H',
        doors,
        grid: { bays, rows: undefined, cols: undefined },
    } as unknown as Hangar;
}

// ---------------------------------------------------------------------------
// checkDoorFit — SFR11
// ---------------------------------------------------------------------------

describe('checkDoorFit', () => {
    test('aircraft fits through door → ok=true, ruleId=SFR11_DOOR_FIT', () => {
        const result = checkDoorFit(mkAircraft({ wingspan: 10, height: 4 }), mkDoor('D1', 12, 5));
        expect(result.ok).toBe(true);
        expect(result.ruleId).toBe('SFR11_DOOR_FIT');
    });

    test('wingspan too wide → ok=false, violation in message', () => {
        const result = checkDoorFit(mkAircraft({ wingspan: 15 }), mkDoor('D1', 12, 10));
        expect(result.ok).toBe(false);
        expect(result.message).toContain('wingspan');
    });

    test('height too tall → ok=false', () => {
        const result = checkDoorFit(mkAircraft({ wingspan: 10, height: 8 }), mkDoor('D1', 12, 6));
        expect(result.ok).toBe(false);
        expect(result.message).toContain('height');
    });

    test('uses tailHeight when set, not height', () => {
        // tailHeight=5 fits door height=6; regular height=9 would not fit
        const result = checkDoorFit(mkAircraft({ height: 9, tailHeight: 5 }), mkDoor('D1', 12, 6));
        expect(result.ok).toBe(true);
        expect(result.evidence.effectiveHeight).toBe(5);
    });

    test('clearance lateral margin added to wingspan', () => {
        // wingspan 10 + margin 3 = 13 > door width 12 → fail
        const result = checkDoorFit(
            mkAircraft({ wingspan: 10 }),
            mkDoor('D1', 12, 10),
            mkClearance({ lateralMargin: 3 })
        );
        expect(result.ok).toBe(false);
        expect(result.evidence.effectiveWingspan).toBe(13);
    });

    test('clearance vertical margin added to height', () => {
        // height 4 + margin 3 = 7 > door height 6 → fail
        const result = checkDoorFit(
            mkAircraft({ height: 4 }),
            mkDoor('D1', 20, 6),
            mkClearance({ verticalMargin: 3 })
        );
        expect(result.ok).toBe(false);
        expect(result.evidence.effectiveHeight).toBe(7);
    });
});

// ---------------------------------------------------------------------------
// checkBayFit — SFR12
// ---------------------------------------------------------------------------

describe('checkBayFit', () => {
    test('aircraft fits in bay → ok=true, ruleId=SFR12_BAY_FIT', () => {
        const result = checkBayFit(mkAircraft({ wingspan: 10, length: 12, height: 4 }), mkBay('B1', { width: 12, depth: 15, height: 5 }));
        expect(result.ok).toBe(true);
        expect(result.ruleId).toBe('SFR12_BAY_FIT');
    });

    test('wingspan too wide for bay → ok=false', () => {
        const result = checkBayFit(mkAircraft({ wingspan: 15 }), mkBay('B1', { width: 12 }));
        expect(result.ok).toBe(false);
        expect(result.message).toContain('wingspan');
    });

    test('length too long for bay depth → ok=false', () => {
        const result = checkBayFit(mkAircraft({ length: 25 }), mkBay('B1', { depth: 20 }));
        expect(result.ok).toBe(false);
        expect(result.message).toContain('length');
    });

    test('height too tall for bay → ok=false', () => {
        const result = checkBayFit(mkAircraft({ height: 8 }), mkBay('B1', { height: 5 }));
        expect(result.ok).toBe(false);
        expect(result.message).toContain('height');
    });

    test('clearance all margins applied', () => {
        const aircraft = mkAircraft({ wingspan: 10, length: 12, height: 4 });
        const bay = mkBay('B1', { width: 12, depth: 14, height: 5 });
        const clearance = mkClearance({ lateralMargin: 3, longitudinalMargin: 3, verticalMargin: 3 });
        // effective: 13 > 12, 15 > 14, 7 > 5 → all three fail
        const result = checkBayFit(aircraft, bay, clearance);
        expect(result.ok).toBe(false);
        expect(result.evidence.widthFits).toBe(false);
        expect(result.evidence.depthFits).toBe(false);
        expect(result.evidence.heightFits).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkBaySetFit — SFR12_COMBINED
// ---------------------------------------------------------------------------

describe('checkBaySetFit', () => {
    test('lateral span: sum of widths fits wingspan → ok=true', () => {
        const aircraft = mkAircraft({ wingspan: 22, length: 12, height: 4 });
        const bays = [mkBay('B1', { width: 12, depth: 20, height: 6 }), mkBay('B2', { width: 12, depth: 20, height: 6 })];
        const result = checkBaySetFit(aircraft, bays, undefined, 'lateral');
        expect(result.ok).toBe(true);
        expect(result.ruleId).toBe('SFR12_COMBINED');
    });

    test('lateral span: sum of widths too narrow → ok=false', () => {
        const aircraft = mkAircraft({ wingspan: 30 });
        const bays = [mkBay('B1', { width: 12 }), mkBay('B2', { width: 12 })];
        const result = checkBaySetFit(aircraft, bays, undefined, 'lateral');
        expect(result.ok).toBe(false);
        expect(result.evidence.widthFits).toBe(false);
    });

    test('longitudinal span: sum of depths fits length → ok=true', () => {
        const aircraft = mkAircraft({ wingspan: 10, length: 35, height: 4 });
        const bays = [mkBay('B1', { width: 12, depth: 20, height: 6 }), mkBay('B2', { width: 12, depth: 20, height: 6 })];
        const result = checkBaySetFit(aircraft, bays, undefined, 'longitudinal');
        expect(result.ok).toBe(true);
        expect(result.evidence.sumDepth).toBe(40);
    });

    test('longitudinal span: sum of depths too short → ok=false', () => {
        const aircraft = mkAircraft({ wingspan: 10, length: 50 });
        const bays = [mkBay('B1', { depth: 20 }), mkBay('B2', { depth: 20 })];
        const result = checkBaySetFit(aircraft, bays, undefined, 'longitudinal');
        expect(result.ok).toBe(false);
        expect(result.evidence.depthFits).toBe(false);
    });

    test('height limiting bay reported in evidence', () => {
        const aircraft = mkAircraft({ height: 5.5 });
        const bays = [mkBay('BHigh', { width: 30, depth: 30, height: 7 }), mkBay('BLow', { width: 30, depth: 30, height: 5 })];
        const result = checkBaySetFit(aircraft, bays, undefined, 'lateral');
        expect(result.ok).toBe(false);
        expect(result.evidence.limitingHeightBay).toBe('BLow');
    });

    test('default span parameter is lateral', () => {
        const aircraft = mkAircraft({ wingspan: 22, length: 12, height: 4 });
        const bays = [mkBay('B1', { width: 12, depth: 20, height: 6 }), mkBay('B2', { width: 12, depth: 20, height: 6 })];
        // No span arg → should behave as lateral
        const result = checkBaySetFit(aircraft, bays);
        expect(result.ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// checkBayContiguity — SFR13
// ---------------------------------------------------------------------------

describe('checkBayContiguity', () => {
    test('single bay → ok=true (early return, no adjacency check)', () => {
        const bay = mkBay('B1');
        const result = checkBayContiguity([bay], { bays: [bay] });
        expect(result.ok).toBe(true);
        expect(result.message).toContain('Single bay');
    });

    test('two adjacent bays (explicit refs) → ok=true', () => {
        const B1 = mkBay('B1');
        const B2 = mkBay('B2');
        (B1 as any).adjacent = [{ ref: B2 }];
        const result = checkBayContiguity([B1, B2], { bays: [B1, B2] });
        expect(result.ok).toBe(true);
    });

    test('two non-adjacent bays (no refs, no grid) → ok=false', () => {
        const B1 = mkBay('B1');
        const B2 = mkBay('B2');
        const result = checkBayContiguity([B1, B2], { bays: [B1, B2] });
        expect(result.ok).toBe(false);
        expect(result.evidence.reachableCount).toBe(1);
    });

    test('three bays in grid row — middle bay connects outer two → ok=true', () => {
        const A = mkBay('A', {}, { row: 0, col: 0 });
        const B = mkBay('B', {}, { row: 0, col: 1 });
        const C = mkBay('C', {}, { row: 0, col: 2 });
        const result = checkBayContiguity([A, B, C], { rows: 1, cols: 3, bays: [A, B, C] });
        expect(result.ok).toBe(true);
    });

    test('A and C without B (gap) in grid → ok=false', () => {
        const A = mkBay('A', {}, { row: 0, col: 0 });
        const B = mkBay('B', {}, { row: 0, col: 1 });
        const C = mkBay('C', {}, { row: 0, col: 2 });
        // Selected: A and C (skipping B); B still in grid for coord lookup
        const result = checkBayContiguity([A, C], { rows: 1, cols: 3, bays: [A, B, C] });
        expect(result.ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkBayOwnership — SFR14
// ---------------------------------------------------------------------------

describe('checkBayOwnership', () => {
    test('bay included in hangar grid → ok=true', () => {
        const bay = mkBay('B1');
        const hangar = mkHangar([], [bay]);
        expect(checkBayOwnership(bay, hangar).ok).toBe(true);
    });

    test('bay from different hangar → ok=false', () => {
        const bay    = mkBay('B1');
        const other  = mkBay('Other');
        const hangar = mkHangar([], [other]);
        expect(checkBayOwnership(bay, hangar).ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkDoorOwnership — SFR15
// ---------------------------------------------------------------------------

describe('checkDoorOwnership', () => {
    test('door in hangar doors list → ok=true', () => {
        const door   = mkDoor('D1', 15, 6);
        const hangar = mkHangar([door], []);
        expect(checkDoorOwnership(door, hangar).ok).toBe(true);
    });

    test('door not in hangar doors list → ok=false', () => {
        const door    = mkDoor('D1', 15, 6);
        const other   = mkDoor('D2', 15, 6);
        const hangar  = mkHangar([other], []);
        const result  = checkDoorOwnership(door, hangar);
        expect(result.ok).toBe(false);
        expect(result.ruleId).toBe('SFR18_DOOR_OWNERSHIP');
    });
});

// ---------------------------------------------------------------------------
// checkTimeOverlap — SFR16
// ---------------------------------------------------------------------------

describe('checkTimeOverlap', () => {
    test('overlapping periods → ok=false, interval in evidence', () => {
        const result = checkTimeOverlap(
            '2025-06-01T08:00', '2025-06-01T14:00',
            '2025-06-01T12:00', '2025-06-01T18:00'
        );
        expect(result.ok).toBe(false);
        expect(result.ruleId).toBe('SFR23_TIME_OVERLAP');
        expect(result.evidence.overlapInterval).not.toBeNull();
    });

    test('touching periods (end1 === start2) → ok=true (no overlap)', () => {
        const result = checkTimeOverlap(
            '2025-06-01T08:00', '2025-06-01T12:00',
            '2025-06-01T12:00', '2025-06-01T18:00'
        );
        expect(result.ok).toBe(true);
    });

    test('disjoint periods → ok=true', () => {
        const result = checkTimeOverlap(
            '2025-06-01T08:00', '2025-06-01T10:00',
            '2025-06-01T14:00', '2025-06-01T18:00'
        );
        expect(result.ok).toBe(true);
        expect(result.evidence.overlapInterval).toBeNull();
    });

    test('first period contained inside second → ok=false', () => {
        const result = checkTimeOverlap(
            '2025-06-01T10:00', '2025-06-01T12:00',
            '2025-06-01T08:00', '2025-06-01T18:00'
        );
        expect(result.ok).toBe(false);
    });

    test('overlap interval start = max(s1,s2), end = min(e1,e2)', () => {
        const result = checkTimeOverlap(
            '2025-06-01T09:00:00Z', '2025-06-01T13:00:00Z',
            '2025-06-01T11:00:00Z', '2025-06-01T15:00:00Z'
        );
        const interval = result.evidence.overlapInterval as { start: string; end: string };
        expect(interval.start).toContain('T11:00');
        expect(interval.end).toContain('T13:00');
    });
});

// ---------------------------------------------------------------------------
// validateInduction
// ---------------------------------------------------------------------------

describe('validateInduction', () => {
    test('no door: only bay-fit and ownership results returned', () => {
        const aircraft = mkAircraft();
        const bay      = mkBay('B1');
        const hangar   = mkHangar([], [bay]);
        const results  = validateInduction({ aircraft, hangar, bays: [bay] });
        expect(results.some(r => r.ruleId === 'SFR12_BAY_FIT')).toBe(true);
        expect(results.some(r => r.ruleId === 'SFR11_DOOR_FIT')).toBe(false);
    });

    test('with door: includes door fit and door ownership', () => {
        const aircraft = mkAircraft();
        const door     = mkDoor('D1', 20, 10);
        const bay      = mkBay('B1');
        const hangar   = mkHangar([door], [bay]);
        const results  = validateInduction({ aircraft, hangar, bays: [bay], door });
        expect(results.some(r => r.ruleId === 'SFR11_DOOR_FIT')).toBe(true);
        expect(results.some(r => r.ruleId === 'SFR18_DOOR_OWNERSHIP')).toBe(true);
    });

    test('multi-bay: contiguity result included', () => {
        const aircraft = mkAircraft();
        const B1 = mkBay('B1', {}, { row: 0, col: 0 });
        const B2 = mkBay('B2', {}, { row: 0, col: 1 });
        const hangar = mkHangar([], [B1, B2]);
        (hangar.grid as any).rows = 1;
        (hangar.grid as any).cols = 2;
        const results = validateInduction({ aircraft, hangar, bays: [B1, B2] });
        expect(results.some(r => r.ruleId === 'SFR16_CONTIGUITY')).toBe(true);
    });

    test('single bay: no contiguity result', () => {
        const aircraft = mkAircraft();
        const bay      = mkBay('B1');
        const hangar   = mkHangar([], [bay]);
        const results  = validateInduction({ aircraft, hangar, bays: [bay] });
        expect(results.some(r => r.ruleId === 'SFR16_CONTIGUITY')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// findSuitableBays
// ---------------------------------------------------------------------------

describe('findSuitableBays', () => {
    test('returns only bays where aircraft fits', () => {
        const aircraft = mkAircraft({ wingspan: 14, length: 12, height: 4 });
        const narrow   = mkBay('Narrow', { width: 12, depth: 20, height: 6 });  // too narrow
        const wide     = mkBay('Wide',   { width: 20, depth: 20, height: 6 });  // fits
        const hangar   = mkHangar([], [narrow, wide]);
        const suitable = findSuitableBays(aircraft, hangar);
        expect(suitable.map(b => b.name)).toEqual(['Wide']);
    });

    test('returns empty array when nothing fits', () => {
        const aircraft = mkAircraft({ wingspan: 100 });
        const bay      = mkBay('B1', { width: 10 });
        const hangar   = mkHangar([], [bay]);
        expect(findSuitableBays(aircraft, hangar)).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// generateValidationReport
// ---------------------------------------------------------------------------

describe('generateValidationReport', () => {
    test('only failing results appear in violations', () => {
        const pass: any = { ok: true,  ruleId: 'SFR11_DOOR_FIT', message: '', evidence: {} };
        const fail: any = { ok: false, ruleId: 'SFR12_BAY_FIT',  message: '', evidence: {} };
        const report = generateValidationReport([pass, fail]);
        expect(report.violations).toHaveLength(1);
        expect(report.violations[0].ruleId).toBe('SFR12_BAY_FIT');
    });

    test('all passing results → empty violations, timestamp present', () => {
        const pass: any = { ok: true, ruleId: 'R', message: '', evidence: {} };
        const report = generateValidationReport([pass]);
        expect(report.violations).toHaveLength(0);
        expect(report.timestamp).toBeTruthy();
    });
});
