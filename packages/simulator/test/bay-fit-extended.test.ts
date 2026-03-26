/**
 * Extended unit tests for checkBaySetFitEffective() covering the longitudinal
 * violation message branches not exercised by bay-fit.test.ts:
 *
 *   - Line 104: longitudinal width violation — "min width X < wingspan Y"
 *   - Line 109: longitudinal depth violation — "sum depth X < length Y"
 */
import { describe, expect, test } from 'vitest';
import { checkBaySetFitEffective } from '../src/rules/bay-fit.js';
import { mkBay } from './helpers/fixtures.js';

// Effective dims helper — only the fields used by checkBaySetFitEffective
function mkDims(wingspan: number, length: number, tailHeight: number) {
    return {
        wingspan, length, tailHeight,
        rawAircraft: { wingspan, tailHeight },
        clearanceName: undefined,
    } as any;
}

describe('checkBaySetFitEffective — longitudinal violation messages', () => {
    test('longitudinal width violation uses "min width ... < wingspan" message (line 104)', () => {
        // Longitudinal: minWidth must >= wingspan.
        // Bay: width=10 (narrow), depth=50 (deep enough for length=20), height=5.
        // Aircraft: wingspan=15 > minWidth=10 → width violation.
        // sumDepth=50 >= length=20 → depth OK.
        const bay = mkBay('Bay1', 10, 50, 5, 0, 0);
        const dims = mkDims(15, 20, 4);

        const result = checkBaySetFitEffective(dims, [bay], 'WideBody', 'longitudinal');

        expect(result.ok).toBe(false);
        const widthViolation = result.evidence.violations.find((v: string) =>
            v.includes('min width') && v.includes('wingspan')
        );
        expect(widthViolation).toBeDefined();
        expect(widthViolation).toMatch(/min width 10\.00m \(Bay1\) < wingspan 15\.00m/);
    });

    test('longitudinal depth violation uses "sum depth ... < length" message (line 109)', () => {
        // Longitudinal: sumDepth must >= length.
        // Bay: width=20 (wide enough for wingspan=15), depth=10 (shallow), height=5.
        // minWidth=20 >= wingspan=15 → width OK.
        // sumDepth=10 < length=30 → depth violation.
        const bay = mkBay('Bay1', 20, 10, 5, 0, 0);
        const dims = mkDims(15, 30, 4);

        const result = checkBaySetFitEffective(dims, [bay], 'LongBody', 'longitudinal');

        expect(result.ok).toBe(false);
        const depthViolation = result.evidence.violations.find((v: string) =>
            v.includes('sum depth') && v.includes('length')
        );
        expect(depthViolation).toBeDefined();
        expect(depthViolation).toMatch(/sum depth 10\.00m < length 30\.00m/);
    });
});
