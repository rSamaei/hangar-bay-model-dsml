/**
 * Unit tests for findSuitableDoors().
 *
 * The function wraps checkDoorFitEffective() over all doors in a hangar,
 * separating suitable doors from rejected ones. No Langium runtime required.
 */
import { describe, expect, test } from 'vitest';
import { findSuitableDoors } from '../src/search/doors.js';
import { mkAircraft, mkDoor, mkHangar, mkClearance } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findSuitableDoors', () => {
    test('single door that fits — returned in doors list', () => {
        const hangar = mkHangar('TestHangar', [mkDoor('MainDoor', 13, 5)]);
        const aircraft = mkAircraft('Cessna', 11, 10, 3);
        const { doors, rejections } = findSuitableDoors(aircraft as any, hangar as any);
        expect(doors).toHaveLength(1);
        expect(doors[0].name).toBe('MainDoor');
        expect(rejections).toHaveLength(0);
    });

    test('single door too narrow — not returned, rejection recorded', () => {
        const hangar = mkHangar('TestHangar', [mkDoor('SmallDoor', 10, 5)]);
        const aircraft = mkAircraft('Widebody', 15, 10, 3);
        const { doors, rejections } = findSuitableDoors(aircraft as any, hangar as any);
        expect(doors).toHaveLength(0);
        expect(rejections).toHaveLength(1);
        expect(rejections[0].ok).toBe(false);
    });

    test('single door too low — not returned, rejection recorded', () => {
        const hangar = mkHangar('TestHangar', [mkDoor('LowDoor', 20, 3)]);
        const aircraft = mkAircraft('TailDragger', 11, 10, 5);
        const { doors, rejections } = findSuitableDoors(aircraft as any, hangar as any);
        expect(doors).toHaveLength(0);
        expect(rejections).toHaveLength(1);
    });

    test('multiple doors — fitting ones returned, non-fitting rejected', () => {
        const hangar = mkHangar('TestHangar', [
            mkDoor('LargeDoor', 20, 8),  // fits
            mkDoor('SmallDoor', 8, 3),   // too narrow (wingspan=11 > 8)
            mkDoor('MidDoor', 15, 6),    // fits
        ], []);
        const aircraft = mkAircraft('Cessna', 11, 10, 3);
        const { doors, rejections } = findSuitableDoors(aircraft as any, hangar as any);
        expect(doors).toHaveLength(2);
        expect(doors.map(d => d.name)).toContain('LargeDoor');
        expect(doors.map(d => d.name)).toContain('MidDoor');
        expect(rejections).toHaveLength(1);
    });

    test('no doors in hangar — both arrays empty', () => {
        const hangar = mkHangar('TestHangar', [], []);
        const aircraft = mkAircraft('Cessna', 11, 10, 3);
        const { doors, rejections } = findSuitableDoors(aircraft as any, hangar as any);
        expect(doors).toHaveLength(0);
        expect(rejections).toHaveLength(0);
    });

    test('clearance envelope makes effective wingspan exceed door width — door excluded', () => {
        // Nominal wingspan=11 + lateralMargin=2 → effective=13; door width=12 → does not fit
        const hangar = mkHangar('TestHangar', [mkDoor('TightDoor', 12, 5)]);
        const aircraft = mkAircraft('Cessna', 11, 10, 3);
        const clearance = mkClearance('STD', 2, 0, 0);
        const { doors, rejections } = findSuitableDoors(aircraft as any, hangar as any, clearance as any);
        expect(doors).toHaveLength(0);
        expect(rejections).toHaveLength(1);
    });

    test('clearance envelope — door wide enough for effective wingspan still fits', () => {
        // Nominal wingspan=11 + lateralMargin=2 → effective=13; door width=14 → fits
        const hangar = mkHangar('TestHangar', [mkDoor('WideDoor', 14, 5)]);
        const aircraft = mkAircraft('Cessna', 11, 10, 3);
        const clearance = mkClearance('STD', 2, 0, 0);
        const { doors, rejections } = findSuitableDoors(aircraft as any, hangar as any, clearance as any);
        expect(doors).toHaveLength(1);
        expect(rejections).toHaveLength(0);
    });
});
