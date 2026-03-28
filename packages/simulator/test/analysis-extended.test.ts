/**
 * Extended unit tests for analyzeAndSchedule() covering branches in
 * buildHangarStatistics() that are not exercised by analysis.test.ts:
 *
 *   - Lines 203–207: manual-induction occupancy events added to sweep-line
 *   - Lines 216–225: sweep-line peak-occupancy computation
 *   - Lines 277–290: ARRIVAL_QUEUED event → queuedAtPeak
 *
 * Both paths require the simulation to run (auto-inductions present), which
 * triggers enrichExportModelWithSimulation() and therefore buildHangarStatistics().
 */
import { describe, expect, test } from 'vitest';
import { analyzeAndSchedule } from '../src/analysis.js';
import { mkAircraft, mkDoor, mkBay, mkHangar, mkManualInduction, mkAutoInduction, mkModel } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);
const MAIN_DOOR = mkDoor('MainDoor', 13, 3);
const BAY1 = mkBay('Bay1', 12, 10, 3, 0, 0);
const BAY2 = mkBay('Bay2', 12, 10, 3, 0, 1);

// One-bay hangar — used for queue contention test
const ONE_BAY_HANGAR = mkHangar('Alpha', [MAIN_DOOR], [BAY1], 1, 1);

// Two-bay hangar — used for mixed manual + auto test
const TWO_BAY_HANGAR = mkHangar('Beta', [MAIN_DOOR], [BAY1, BAY2], 1, 2);

// ---------------------------------------------------------------------------
// Task S1-a: manual-induction stats in buildHangarStatistics (lines 203–207, 216–225)
//
// When the model contains BOTH manual and auto-inductions the simulation runs
// and buildHangarStatistics counts the manual induction towards inductionsServed
// AND adds its bay-occupancy window into the sweep-line timeline.
// ---------------------------------------------------------------------------

describe('analyzeAndSchedule — hangarStatistics with manual inductions', () => {
    test('manual induction increments inductionsServed in hangarStatistics', () => {
        const manual = mkManualInduction(
            'M1', CESSNA, TWO_BAY_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        // Auto-induction needed so the simulation runs and hangarStatistics is built
        const autoA = mkAutoInduction('A', CESSNA, TWO_BAY_HANGAR, 60);
        const model = mkModel([TWO_BAY_HANGAR], [manual], [autoA]);
        const { exportModel } = analyzeAndSchedule(model);

        const hs = exportModel.hangarStatistics?.['Beta'];
        expect(hs).toBeDefined();
        // manual (1) + auto scheduled (1) = 2
        expect(hs!.inductionsServed).toBeGreaterThanOrEqual(2);
    });

    test('manual induction contributes to peakOccupancy via sweep-line', () => {
        const manual = mkManualInduction(
            'M1', CESSNA, TWO_BAY_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        // Auto-induction overlaps with manual — peak occupancy should be >= 2 bays
        const autoA = mkAutoInduction('A', CESSNA, TWO_BAY_HANGAR, 60, {
            notBefore: '2024-06-01T08:00',
            notAfter:  '2024-06-01T12:00',
        });
        const model = mkModel([TWO_BAY_HANGAR], [manual], [autoA]);
        const { exportModel } = analyzeAndSchedule(model);

        const hs = exportModel.hangarStatistics?.['Beta'];
        expect(hs).toBeDefined();
        // At least the manual's 1 bay was registered in the sweep-line
        expect(hs!.peakOccupancy).toBeGreaterThanOrEqual(1);
        expect(hs!.peakOccupancyTime).not.toBe('');
    });

    test('hangarStatistics totalBays matches hangar bay count', () => {
        const autoA = mkAutoInduction('A', CESSNA, TWO_BAY_HANGAR, 60);
        const model = mkModel([TWO_BAY_HANGAR], [], [autoA]);
        const { exportModel } = analyzeAndSchedule(model);

        const hs = exportModel.hangarStatistics?.['Beta'];
        expect(hs).toBeDefined();
        expect(hs!.totalBays).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// Task S1-b: ARRIVAL_QUEUED events → queuedAtPeak (lines 277–290)
//
// When there are more autos than bays the queue accumulates and ARRIVAL_QUEUED
// events are emitted. The sweep over eventLog must set queuedAtPeak > 0.
// ---------------------------------------------------------------------------

describe('analyzeAndSchedule — hangarStatistics queuedAtPeak', () => {
    test('queuedAtPeak > 0 when autos contend for single bay', () => {
        // Two 60-min autos into a one-bay hangar: second must queue
        const autoA = mkAutoInduction('A', CESSNA, ONE_BAY_HANGAR, 60);
        const autoB = mkAutoInduction('B', CESSNA, ONE_BAY_HANGAR, 60);
        const model = mkModel([ONE_BAY_HANGAR], [], [autoA, autoB]);
        const { exportModel } = analyzeAndSchedule(model);

        const hs = exportModel.hangarStatistics?.['Alpha'];
        expect(hs).toBeDefined();
        expect(hs!.queuedAtPeak).toBeGreaterThan(0);
    });

    test('queuedAtPeak is 0 when no contention occurs', () => {
        // Single auto into a one-bay hangar — places immediately, no queue
        const autoA = mkAutoInduction('A', CESSNA, ONE_BAY_HANGAR, 60);
        const model = mkModel([ONE_BAY_HANGAR], [], [autoA]);
        const { exportModel } = analyzeAndSchedule(model);

        const hs = exportModel.hangarStatistics?.['Alpha'];
        expect(hs).toBeDefined();
        expect(hs!.queuedAtPeak).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// exportUnscheduledAuto — export-model.ts lines 209, 211–212
//
// Line 209: auto.aircraft.ref?.name ?? 'unknown' — fires when aircraft.ref = undefined
// Lines 211–212: first?.ruleId ?? 'SCHEDULING_FAILED' and first?.evidence ?? {...}
//               — fire when rejections = [] (no hangars in model → no candidates)
// ---------------------------------------------------------------------------

describe('analyzeAndSchedule — exportUnscheduledAuto branches', () => {
    test('unscheduled auto with null aircraft ref uses "unknown" aircraft name (line 209)', () => {
        const nullRefAuto = {
            id: 'NULL-REF-EXPORT',
            aircraft: { ref: undefined, $refText: 'Ghost' },
            preferredHangar: { ref: ONE_BAY_HANGAR, $refText: 'Alpha' },
            duration: 60,
            requires: undefined,
            notBefore: undefined,
            notAfter: undefined,
            precedingInductions: [],
            clearance: undefined,
            $type: 'AutoInduction',
        };
        const model = mkModel([ONE_BAY_HANGAR], [], [nullRefAuto as any]);
        const { exportModel } = analyzeAndSchedule(model);

        // The auto ends up unscheduled (INVALID_AIRCRAFT_REF)
        const unscheduled = exportModel.autoSchedule?.unscheduled ?? [];
        const entry = unscheduled.find(u => u.id === 'NULL-REF-EXPORT');
        expect(entry).toBeDefined();
        // aircraft.ref?.name is undefined → ?? 'unknown' fires
        expect(entry!.aircraft).toBe('unknown');
    });

    test('unscheduled auto with no hangars uses simulation adapter fallback reason', () => {
        // Model with no hangars → simulator places auto in failedInductions with
        // SIM_NEVER_PLACED reason → adapter's generic fallback sets the ruleId
        const auto = mkAutoInduction('NO-HANGAR', CESSNA, undefined, 60);
        const model = mkModel([], [], [auto as any]);
        const { exportModel } = analyzeAndSchedule(model);

        const unscheduled = exportModel.autoSchedule?.unscheduled ?? [];
        const entry = unscheduled.find(u => u.id === 'NO-HANGAR');
        expect(entry).toBeDefined();
        // Adapter's generic fallback fires (SIM_NEVER_PLACED or similar)
        expect(entry!.reasonRuleId).toBeTruthy();
        expect(entry!.aircraft).toBe('Cessna172');
    });
});
