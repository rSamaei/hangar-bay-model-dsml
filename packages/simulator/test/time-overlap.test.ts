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
        expect(conflicts[0].ruleId).toBe('SFR16_TIME_OVERLAP');
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
});
