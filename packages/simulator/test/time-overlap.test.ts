/**
 * Unit tests for checkTimeOverlap() and detectConflicts().
 *
 * Both functions operate on plain Date objects and InductionInfo records —
 * no Langium runtime required.
 */
import { describe, expect, test } from 'vitest';
import { checkTimeOverlap, detectConflicts } from '../src/rules/time-overlap.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Convenience: build a Date on 2024-01-01 at the given hour/minute. */
function h(hour: number, minute = 0): Date {
    return new Date(2024, 0, 1, hour, minute);
}

function mkInduction(id: string, hangar: string, bays: string[], startH: number, endH: number) {
    return { id, aircraft: id, hangar, bays, start: h(startH), end: h(endH) };
}

// ---------------------------------------------------------------------------
// checkTimeOverlap tests
// ---------------------------------------------------------------------------

describe('checkTimeOverlap', () => {
    test('[08:00, 10:00] vs [09:00, 11:00] — overlapping intervals', () => {
        const { overlaps } = checkTimeOverlap(h(8), h(10), h(9), h(11));
        expect(overlaps).toBe(true);
    });

    test('[08:00, 10:00] vs [10:00, 12:00] — touching boundary, no overlap', () => {
        const { overlaps } = checkTimeOverlap(h(8), h(10), h(10), h(12));
        expect(overlaps).toBe(false);
    });

    test('[08:00, 12:00] vs [09:00, 10:00] — second contained in first, overlaps', () => {
        const { overlaps } = checkTimeOverlap(h(8), h(12), h(9), h(10));
        expect(overlaps).toBe(true);
    });

    test('[08:00, 10:00] vs [11:00, 13:00] — disjoint, no overlap', () => {
        const { overlaps } = checkTimeOverlap(h(8), h(10), h(11), h(13));
        expect(overlaps).toBe(false);
    });

    test('identical intervals — overlaps', () => {
        const { overlaps } = checkTimeOverlap(h(9), h(10), h(9), h(10));
        expect(overlaps).toBe(true);
    });

    test('overlap interval is the intersection of the two windows', () => {
        const { overlapInterval } = checkTimeOverlap(h(8), h(10), h(9), h(11));
        expect(overlapInterval).not.toBeNull();
        expect(overlapInterval!.start).toEqual(h(9));
        expect(overlapInterval!.end).toEqual(h(10));
    });

    test('no overlap — overlapInterval is null', () => {
        const { overlapInterval } = checkTimeOverlap(h(8), h(10), h(11), h(13));
        expect(overlapInterval).toBeNull();
    });

    test('touching boundary — overlapInterval is null', () => {
        const { overlapInterval } = checkTimeOverlap(h(8), h(10), h(10), h(12));
        expect(overlapInterval).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// detectConflicts tests
// ---------------------------------------------------------------------------

describe('detectConflicts', () => {
    test('empty induction list — no conflicts', () => {
        expect(detectConflicts([])).toHaveLength(0);
    });

    test('single induction — no conflicts', () => {
        expect(detectConflicts([mkInduction('IND1', 'H1', ['Bay1'], 8, 10)])).toHaveLength(0);
    });

    test('same bay, overlapping times — conflict detected', () => {
        const inductions = [
            mkInduction('IND1', 'H1', ['Bay1'], 8, 10),
            mkInduction('IND2', 'H1', ['Bay1'], 9, 11),
        ];
        const conflicts = detectConflicts(inductions);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].ruleId).toBe('SFR23_TIME_OVERLAP');
        expect(conflicts[0].intersectingBays).toContain('Bay1');
    });

    test('same bay, touching times — no conflict', () => {
        const inductions = [
            mkInduction('IND1', 'H1', ['Bay1'], 8, 10),
            mkInduction('IND2', 'H1', ['Bay1'], 10, 12),
        ];
        expect(detectConflicts(inductions)).toHaveLength(0);
    });

    test('same bay, disjoint times — no conflict', () => {
        const inductions = [
            mkInduction('IND1', 'H1', ['Bay1'], 8, 10),
            mkInduction('IND2', 'H1', ['Bay1'], 11, 13),
        ];
        expect(detectConflicts(inductions)).toHaveLength(0);
    });

    test('different bays, overlapping times — no conflict', () => {
        const inductions = [
            mkInduction('IND1', 'H1', ['Bay1'], 8, 10),
            mkInduction('IND2', 'H1', ['Bay2'], 9, 11),
        ];
        expect(detectConflicts(inductions)).toHaveLength(0);
    });

    test('different hangars, same bay name, overlapping times — no conflict', () => {
        const inductions = [
            mkInduction('IND1', 'H1', ['Bay1'], 8, 10),
            mkInduction('IND2', 'H2', ['Bay1'], 9, 11),
        ];
        expect(detectConflicts(inductions)).toHaveLength(0);
    });

    test('conflict message identifies both inductions', () => {
        const inductions = [
            mkInduction('IND1', 'H1', ['Bay1'], 8, 10),
            mkInduction('IND2', 'H1', ['Bay1'], 9, 11),
        ];
        const conflicts = detectConflicts(inductions);
        expect(conflicts[0].message).toContain('IND1');
        expect(conflicts[0].message).toContain('IND2');
    });

    test('induction without id uses aircraft as fallback in message (line 66 ?? branch)', () => {
        // ind.id = undefined → message uses ind.aircraft fallback
        const ind1 = { id: undefined, aircraft: 'Cessna', hangar: 'H1', bays: ['Bay1'], start: h(8), end: h(10) };
        const ind2 = { id: undefined, aircraft: 'Piper', hangar: 'H1', bays: ['Bay1'], start: h(9), end: h(11) };
        const conflicts = detectConflicts([ind1 as any, ind2 as any]);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].message).toContain('Cessna');
        expect(conflicts[0].message).toContain('Piper');
    });
});

// ---------------------------------------------------------------------------
// checkTimeOverlap — line 23 true branch (startA > startB)
// ---------------------------------------------------------------------------

describe('checkTimeOverlap — overlap interval when A starts after B', () => {
    test('[09:00,11:00] vs [08:00,10:00] — startA > startB, start of interval = startA', () => {
        const { overlaps, overlapInterval } = checkTimeOverlap(h(9), h(11), h(8), h(10));
        expect(overlaps).toBe(true);
        // startA(9) > startB(8) → true branch of ternary → start = startA = h(9)
        expect(overlapInterval!.start).toEqual(h(9));
        // endA(11) > endB(10) → false branch of end ternary → end = endB = h(10)
        expect(overlapInterval!.end).toEqual(h(10));
    });
});
