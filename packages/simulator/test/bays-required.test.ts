/**
 * Unit tests for calculateBaysRequired().
 *
 * The function uses a greedy sum-of-widths approach: sort all hangar bay widths
 * descending, accumulate until the sum >= effectiveWingspan, and return the count
 * of bays consumed. When all bays together cannot cover the wingspan, baysRequired
 * equals the total bay count.
 */
import { describe, expect, test } from 'vitest';
import { calculateBaysRequired } from '../src/geometry/bays-required.js';
import type { EffectiveDimensions } from '../src/types/dimensions.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkBay(name: string, width: number) {
    return { name, width, depth: 20, height: 5, adjacent: [], $type: 'HangarBay' };
}

function mkHangar(bays: any[]) {
    return { name: 'TestHangar', doors: [], grid: { bays }, $type: 'Hangar' };
}

function mkDims(wingspan: number): EffectiveDimensions {
    return {
        wingspan,
        length: 10,
        height: 3,
        tailHeight: 3,
        rawAircraft: { wingspan, length: 10, height: 3, tailHeight: 3 }
    };
}

// ---------------------------------------------------------------------------
// Tests — behaviour preserved from old algorithm (uniform bay widths)
// ---------------------------------------------------------------------------

describe('calculateBaysRequired', () => {
    test('wingspan fits in 1 bay — returns 1', () => {
        const hangar = mkHangar([mkBay('Bay1', 15), mkBay('Bay2', 15)]);
        const result = calculateBaysRequired(mkDims(11), hangar as any);
        expect(result.baysRequired).toBe(1);
    });

    test('wingspan exactly = 1 bay width — returns 1', () => {
        const hangar = mkHangar([mkBay('Bay1', 15)]);
        const result = calculateBaysRequired(mkDims(15), hangar as any);
        expect(result.baysRequired).toBe(1);
    });

    test('wingspan needs exactly 2 bays (exact multiple)', () => {
        const hangar = mkHangar([mkBay('Bay1', 10), mkBay('Bay2', 10)]);
        const result = calculateBaysRequired(mkDims(20), hangar as any);
        expect(result.baysRequired).toBe(2);
    });

    test('wingspan fractionally above 1 bay — rounds up to 2', () => {
        const hangar = mkHangar([mkBay('Bay1', 10), mkBay('Bay2', 10), mkBay('Bay3', 10)]);
        const result = calculateBaysRequired(mkDims(11), hangar as any);
        expect(result.baysRequired).toBe(2);
    });

    test('zero wingspan — returns 0', () => {
        const hangar = mkHangar([mkBay('Bay1', 10)]);
        const result = calculateBaysRequired(mkDims(0), hangar as any);
        expect(result.baysRequired).toBe(0);
    });

    test('greedy picks widths descending — bayWidthsUsed reflects this', () => {
        // Bay widths: 10, 15, 12 — greedy sorted desc: [15, 12, 10]; first bay (15) covers 11m
        const hangar = mkHangar([mkBay('Bay1', 10), mkBay('Bay2', 15), mkBay('Bay3', 12)]);
        const result = calculateBaysRequired(mkDims(11), hangar as any);
        expect(result.baysRequired).toBe(1);
        expect(result.bayWidthsUsed).toEqual([15]);
    });

    test('ruleId is DERIVED_BAYS_REQUIRED', () => {
        const hangar = mkHangar([mkBay('Bay1', 10)]);
        const result = calculateBaysRequired(mkDims(5), hangar as any);
        expect(result.ruleId).toBe('DERIVED_BAYS_REQUIRED');
    });

    test('evidence contains greedy calculation string', () => {
        const hangar = mkHangar([mkBay('Bay1', 10)]);
        const result = calculateBaysRequired(mkDims(25), hangar as any);
        expect(result.evidence.calculation).toContain('greedy(');
        expect(result.baysRequired).toBe(1); // all bays exhausted (10 < 25) → total = 1
    });
});

// ---------------------------------------------------------------------------
// Tests — new greedy behaviour (the 4 requested cases)
// ---------------------------------------------------------------------------

describe('calculateBaysRequired — greedy sum-of-widths', () => {

    /**
     * Uniform bay widths: result matches the old ceil(wingspan/width) heuristic.
     * 3 bays of 12m, wingspan = 25m. Greedy: 12 < 25, 12+12 = 24 < 25, 12+12+12 = 36 >= 25 → 3.
     */
    test('uniform bay widths — same result as naive ceil heuristic', () => {
        const hangar = mkHangar([mkBay('Bay1', 12), mkBay('Bay2', 12), mkBay('Bay3', 12)]);
        const result = calculateBaysRequired(mkDims(25), hangar as any);
        expect(result.baysRequired).toBe(3);
        expect(result.bayWidthsUsed).toEqual([12, 12, 12]);
    });

    /**
     * Mixed bay widths: greedy gives a lower (more accurate) estimate.
     * Hangar: [20m, 20m, 10m], wingspan = 45m.
     * Greedy (sorted desc: [20, 20, 10]): 20 < 45, 40 < 45, 50 >= 45 → 3 bays.
     * Old ceil(45 / minBayWidth=10) = 5 — the greedy approach saves 2 bays.
     */
    test('mixed bay widths (10m + 20m) — 45m aircraft needs 3 bays, not 5', () => {
        const hangar = mkHangar([
            mkBay('Wide1', 20), mkBay('Wide2', 20), mkBay('Narrow', 10)
        ]);
        const result = calculateBaysRequired(mkDims(45), hangar as any);
        expect(result.baysRequired).toBe(3);
        expect(result.bayWidthsUsed).toEqual([20, 20, 10]);
    });

    /**
     * Aircraft cannot fit even using all bays: baysRequired = total bay count.
     * 4 bays of 12m each, wingspan = 200m → total = 48m < 200m.
     * baysRequired = 4 (the total), not Infinity or an error.
     */
    test('aircraft wingspan exceeds sum of all bay widths — baysRequired = total bay count', () => {
        const hangar = mkHangar([
            mkBay('Bay1', 12), mkBay('Bay2', 12), mkBay('Bay3', 12), mkBay('Bay4', 12)
        ]);
        const result = calculateBaysRequired(mkDims(200), hangar as any);
        expect(result.baysRequired).toBe(4); // total bay count
        expect(result.bayWidthsUsed).toEqual([12, 12, 12, 12]);
    });

    /**
     * Single-bay hangar: baysRequired is always 1 (regardless of whether the
     * aircraft fits — bay-fit checks handle the dimension violation separately).
     */
    test('single-bay hangar — baysRequired = 1', () => {
        const hangar = mkHangar([mkBay('OnlyBay', 30)]);
        // wingspan < bay width
        const fits = calculateBaysRequired(mkDims(20), hangar as any);
        expect(fits.baysRequired).toBe(1);
        // wingspan > bay width (still 1, but SFR12 will fire separately)
        const wide = calculateBaysRequired(mkDims(100), hangar as any);
        expect(wide.baysRequired).toBe(1);
    });
});
