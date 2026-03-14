/**
 * Unit tests for checkDoorFitEffective() (SFR11).
 *
 * The function takes pre-computed EffectiveDimensions and a mock HangarDoor.
 * No Langium runtime required.
 */
import { describe, expect, test } from 'vitest';
import { checkDoorFitEffective } from '../src/rules/door-fit.js';
import type { EffectiveDimensions } from '../src/types/dimensions.js';
import { mkDoor } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkDims(wingspan: number, tailHeight: number, opts: { rawWingspan?: number; rawTailHeight?: number; clearanceName?: string } = {}): EffectiveDimensions {
    const rw = opts.rawWingspan ?? wingspan;
    const rt = opts.rawTailHeight ?? tailHeight;
    return {
        wingspan,
        length: 10,
        height: tailHeight,
        tailHeight,
        clearanceName: opts.clearanceName,
        rawAircraft: { wingspan: rw, length: 10, height: rt, tailHeight: rt }
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkDoorFitEffective (SFR11)', () => {
    test('wingspan < door width — fits', () => {
        const result = checkDoorFitEffective(mkDims(10, 3), mkDoor('D1', 13, 5) as any, 'Cessna');
        expect(result.ok).toBe(true);
        expect(result.ruleId).toBe('SFR11_DOOR_FIT');
    });

    test('wingspan = door width — fits (boundary)', () => {
        const result = checkDoorFitEffective(mkDims(13, 3), mkDoor('D1', 13, 5) as any, 'Cessna');
        expect(result.ok).toBe(true);
    });

    test('wingspan > door width — does not fit', () => {
        const result = checkDoorFitEffective(mkDims(15, 3), mkDoor('D1', 13, 5) as any, 'Cessna');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('does NOT fit');
    });

    test('tailHeight < door height — fits', () => {
        const result = checkDoorFitEffective(mkDims(10, 4), mkDoor('D1', 13, 5) as any, 'Cessna');
        expect(result.ok).toBe(true);
    });

    test('tailHeight = door height — fits (boundary)', () => {
        const result = checkDoorFitEffective(mkDims(10, 5), mkDoor('D1', 13, 5) as any, 'Cessna');
        expect(result.ok).toBe(true);
    });

    test('tailHeight > door height — does not fit', () => {
        const result = checkDoorFitEffective(mkDims(10, 6), mkDoor('D1', 13, 5) as any, 'Cessna');
        expect(result.ok).toBe(false);
        expect(result.message).toContain('does NOT fit');
    });

    test('clearance makes effective wingspan exceed door width — does not fit', () => {
        // Nominal 11 m, clearance adds 1 m → effective 12 m, door only 11 m wide
        const dims = mkDims(12, 3, { rawWingspan: 11, clearanceName: 'STD' });
        const result = checkDoorFitEffective(dims, mkDoor('D1', 11, 5) as any, 'Cessna');
        expect(result.ok).toBe(false);
        expect(result.evidence.effectiveWingspan).toBe(12);
        expect(result.evidence.rawWingspan).toBe(11);
        expect(result.evidence.clearanceName).toBe('STD');
    });

    test('evidence records door name and aircraft name', () => {
        const result = checkDoorFitEffective(mkDims(10, 3), mkDoor('MainDoor', 13, 5) as any, 'Cessna172');
        expect(result.evidence.doorName).toBe('MainDoor');
        expect(result.evidence.aircraftName).toBe('Cessna172');
    });

    test('both wingspan and height violations reported together', () => {
        const result = checkDoorFitEffective(mkDims(20, 8), mkDoor('D1', 13, 5) as any, 'Widebody');
        expect(result.ok).toBe(false);
        expect(result.evidence.wingspanFits).toBe(false);
        expect(result.evidence.heightFits).toBe(false);
        expect(result.evidence.violations).toHaveLength(2);
    });
});
