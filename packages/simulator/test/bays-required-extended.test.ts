/**
 * Extended unit tests for calculateBaysRequired() covering lines 56–70:
 * the early-return when the hangar has zero bays (sortedValues.length === 0).
 */
import { describe, expect, test } from 'vitest';
import { calculateBaysRequired } from '../src/geometry/bays-required.js';
import { mkHangar } from './helpers/fixtures.js';

const DIMS = {
    wingspan: 11, length: 8, tailHeight: 3,
    rawAircraft: { wingspan: 11, tailHeight: 3 },
    clearanceName: undefined,
};

describe('calculateBaysRequired — zero bays in hangar (lines 56–70)', () => {
    test('hangar with no bays returns baysRequired=0 and empty bayWidthsUsed', () => {
        const emptyHangar = mkHangar('Empty', [], []);
        const result = calculateBaysRequired(DIMS as any, emptyHangar as any);

        expect(result.baysRequired).toBe(0);
        expect(result.bayWidthsUsed).toEqual([]);
        expect(result.ruleId).toBe('DERIVED_BAYS_REQUIRED');
        expect(result.evidence).toMatchObject({
            baysRequired: 0,
            bayWidthsUsed: [],
            calculation: 'no bays in hangar',
        });
    });

    test('zero bays returns the same result for longitudinal span', () => {
        const emptyHangar = mkHangar('Empty', [], []);
        const result = calculateBaysRequired(DIMS as any, emptyHangar as any, 'longitudinal');

        expect(result.baysRequired).toBe(0);
        expect(result.bayWidthsUsed).toEqual([]);
        expect((result.evidence as any).span).toBe('longitudinal');
    });
});
