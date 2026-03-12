/**
 * Unit tests for checkBaySetFitEffective() (SFR12).
 *
 * The function takes pre-computed EffectiveDimensions and mock HangarBay objects.
 * No Langium runtime required.
 */
import { describe, expect, test } from 'vitest';
import { checkBaySetFitEffective } from '../src/rules/bay-fit.js';
import type { EffectiveDimensions } from '../src/types/dimensions.js';
import { mkBay } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkDims(wingspan: number, length: number, tailHeight: number, clearanceName?: string): EffectiveDimensions {
    return {
        wingspan,
        length,
        height: tailHeight,
        tailHeight,
        clearanceName,
        rawAircraft: { wingspan, length, height: tailHeight, tailHeight }
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkBaySetFitEffective (SFR12)', () => {
    test('no bays provided — not ok', () => {
        const result = checkBaySetFitEffective(mkDims(11, 8, 3), [], 'Cessna');
        expect(result.ok).toBe(false);
        expect(result.message).toBe('No bays provided');
        expect(result.ruleId).toBe('SFR12_BAY_FIT');
    });

    test('wingspan < single bay width — fits', () => {
        const result = checkBaySetFitEffective(mkDims(11, 8, 3), [mkBay('Bay1', 15, 20, 5)] as any, 'Cessna');
        expect(result.ok).toBe(true);
    });

    test('wingspan = single bay width — fits (boundary)', () => {
        const result = checkBaySetFitEffective(mkDims(15, 8, 3), [mkBay('Bay1', 15, 20, 5)] as any, 'Cessna');
        expect(result.ok).toBe(true);
    });

    test('wingspan > single bay width — does not fit', () => {
        const result = checkBaySetFitEffective(mkDims(20, 8, 3), [mkBay('Bay1', 15, 20, 5)] as any, 'Cessna');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('does NOT fit');
        expect(result.evidence.widthFits).toBe(false);
    });

    test('aircraft length > bay depth — does not fit', () => {
        const result = checkBaySetFitEffective(mkDims(10, 25, 3), [mkBay('Bay1', 15, 20, 5)] as any, 'Cessna');
        expect(result.ok).toBe(false);
        expect(result.evidence.depthFits).toBe(false);
    });

    test('aircraft tailHeight > bay height — does not fit', () => {
        const result = checkBaySetFitEffective(mkDims(10, 8, 6), [mkBay('Bay1', 15, 20, 5)] as any, 'Cessna');
        expect(result.ok).toBe(false);
        expect(result.evidence.heightFits).toBe(false);
    });

    test('sum of two bay widths accommodates wide aircraft', () => {
        const bays = [mkBay('Bay1', 10, 20, 5), mkBay('Bay2', 10, 20, 5)];
        const result = checkBaySetFitEffective(mkDims(18, 15, 3), bays as any, 'Widebody');
        expect(result.ok).toBe(true);
        expect(result.evidence.sumWidth).toBe(20);
    });

    test('sum of two bay widths still insufficient — does not fit', () => {
        const bays = [mkBay('Bay1', 10, 20, 5), mkBay('Bay2', 10, 20, 5)];
        const result = checkBaySetFitEffective(mkDims(25, 15, 3), bays as any, 'VeryWide');
        expect(result.ok).toBe(false);
    });

    test('limiting bay constrains depth across multi-bay set', () => {
        const bays = [mkBay('Bay1', 10, 20, 5), mkBay('Bay2', 10, 12, 5)];
        const result = checkBaySetFitEffective(mkDims(18, 15, 3), bays as any, 'Widebody');
        expect(result.ok).toBe(false);
        expect(result.evidence.limitingDepthBay).toBe('Bay2');
        expect(result.evidence.minDepth).toBe(12);
    });

    test('limiting bay constrains height across multi-bay set', () => {
        const bays = [mkBay('Bay1', 10, 20, 5), mkBay('Bay2', 10, 20, 3)];
        const result = checkBaySetFitEffective(mkDims(18, 15, 4), bays as any, 'Widebody');
        expect(result.ok).toBe(false);
        expect(result.evidence.limitingHeightBay).toBe('Bay2');
    });

    test('with clearance applied — effective dimensions are used', () => {
        // Nominal 11m wingspan, clearance makes it 13m, bay is 12m — fails
        const dims = mkDims(13, 8, 3, 'STD');
        const result = checkBaySetFitEffective(dims, [mkBay('Bay1', 12, 20, 5)] as any, 'Cessna');
        expect(result.ok).toBe(false);
        expect(result.evidence.effectiveWingspan).toBe(13);
        expect(result.evidence.clearanceName).toBe('STD');
    });

    test('ruleId is SFR12_BAY_FIT', () => {
        const result = checkBaySetFitEffective(mkDims(11, 8, 3), [mkBay('Bay1', 15, 20, 5)] as any, 'Cessna');
        expect(result.ruleId).toBe('SFR12_BAY_FIT');
    });
});
