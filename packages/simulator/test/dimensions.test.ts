/**
 * Unit tests for calculateEffectiveDimensions().
 *
 * Uses structural mocks for AircraftType and ClearanceEnvelope — no Langium
 * runtime required.
 */
import { describe, expect, test } from 'vitest';
import { calculateEffectiveDimensions } from '../src/geometry/dimensions.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkAircraft(wingspan: number, length: number, height: number, tailHeight?: number) {
    return {
        name: 'TestAircraft',
        wingspan,
        length,
        height,
        tailHeight: tailHeight ?? height,
        $type: 'AircraftType'
    };
}

function mkClearance(name: string, lateral: number, longitudinal: number, vertical: number) {
    return {
        name,
        lateralMargin: lateral,
        longitudinalMargin: longitudinal,
        verticalMargin: vertical,
        $type: 'ClearanceEnvelope'
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateEffectiveDimensions', () => {
    test('no clearance — effective dimensions equal nominal', () => {
        const dims = calculateEffectiveDimensions(mkAircraft(11, 8.3, 2.7) as any);
        expect(dims.wingspan).toBe(11);
        expect(dims.length).toBe(8.3);
        expect(dims.height).toBe(2.7);
        expect(dims.tailHeight).toBe(2.7);
        expect(dims.clearanceName).toBeUndefined();
    });

    test('uses aircraft.tailHeight when explicitly provided', () => {
        const dims = calculateEffectiveDimensions(mkAircraft(11, 8.3, 2.7, 3.5) as any);
        expect(dims.tailHeight).toBe(3.5);
        expect(dims.height).toBe(2.7); // height unchanged
    });

    test('lateral clearance (lateralMargin) adds to effective wingspan', () => {
        const dims = calculateEffectiveDimensions(mkAircraft(11, 8.3, 2.7) as any, mkClearance('STD', 1, 0, 0) as any);
        expect(dims.wingspan).toBe(12);
        expect(dims.length).toBe(8.3);  // unchanged
        expect(dims.tailHeight).toBe(2.7); // unchanged
    });

    test('longitudinal clearance (longitudinalMargin) adds to effective length', () => {
        const dims = calculateEffectiveDimensions(mkAircraft(11, 8, 2.7) as any, mkClearance('STD', 0, 0.5, 0) as any);
        expect(dims.length).toBeCloseTo(8.5);
        expect(dims.wingspan).toBe(11); // unchanged
    });

    test('vertical clearance (verticalMargin) adds to effective height and tailHeight', () => {
        const dims = calculateEffectiveDimensions(mkAircraft(11, 8.3, 2.7) as any, mkClearance('STD', 0, 0, 0.3) as any);
        expect(dims.height).toBeCloseTo(3.0);
        expect(dims.tailHeight).toBeCloseTo(3.0);
    });

    test('vertical clearance also adds to explicit tailHeight', () => {
        const dims = calculateEffectiveDimensions(mkAircraft(11, 8.3, 2.7, 3.5) as any, mkClearance('STD', 0, 0, 0.5) as any);
        expect(dims.tailHeight).toBeCloseTo(4.0);
        expect(dims.height).toBeCloseTo(3.2);
    });

    test('rawAircraft preserves nominal (pre-clearance) dimensions', () => {
        const dims = calculateEffectiveDimensions(mkAircraft(11, 8.3, 2.7, 3.5) as any, mkClearance('STD', 1, 0.5, 0.3) as any);
        expect(dims.rawAircraft.wingspan).toBe(11);
        expect(dims.rawAircraft.length).toBe(8.3);
        expect(dims.rawAircraft.height).toBe(2.7);
        expect(dims.rawAircraft.tailHeight).toBe(3.5);
    });

    test('clearanceName is captured from the clearance envelope', () => {
        const dims = calculateEffectiveDimensions(mkAircraft(11, 8, 3) as any, mkClearance('MILITARY', 1, 1, 0.5) as any);
        expect(dims.clearanceName).toBe('MILITARY');
    });

    test('all three margins applied simultaneously', () => {
        const dims = calculateEffectiveDimensions(
            mkAircraft(10, 8, 3) as any,
            mkClearance('FULL', 2, 1, 0.5) as any
        );
        expect(dims.wingspan).toBe(12);
        expect(dims.length).toBe(9);
        expect(dims.height).toBeCloseTo(3.5);
        expect(dims.tailHeight).toBeCloseTo(3.5);
    });
});
