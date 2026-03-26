/**
 * Extended unit tests for PlacementEngine covering branches not exercised by
 * the existing simulation tests:
 *
 *   - Lines 135–143: NO_SUITABLE_BAY_SET rejection — aircraft fits door but
 *                    no bay set accommodates it
 *   - Lines 240–241: checkDeparturePath — no hangar cache entry → { clear: true }
 *   - Line  246:     checkDeparturePath — hangar has no access graph → { clear: true }
 */
import { describe, expect, test } from 'vitest';
import { PlacementEngine } from '../src/simulation/placement-engine.js';
import { DEFAULT_SIMULATION_CONFIG } from '../src/simulation/types.js';
import { mkAircraft, mkDoor, mkBay, mkHangar, mkModel } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkState() {
    return {
        currentTime: Date.now(),
        occupiedBays: new Map<string, any>(),
        waitingQueue: [] as any[],
        pendingDepartures: [] as any[],
        activeInductions: [] as any[],
        completedInductions: [] as any[],
        fixedOccupancy: [] as any[],
        eventLog: [] as any[],
    } as any;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// Wide aircraft: wingspan=20 — fits a 25 m door but not a 12 m bay
const WIDE = mkAircraft('WideBody', 20, 15, 4, 4);
const WIDE_DOOR = mkDoor('WideDoor', 25, 5);
const NARROW_BAY = mkBay('NarrowBay', 12, 15, 5, 0, 0);
const NARROW_HANGAR = mkHangar('NarrowHangar', [WIDE_DOOR], [NARROW_BAY], 1, 1);

// Normal aircraft
const CESSNA = mkAircraft('Cessna172', 11, 8, 3, 3);
const MAIN_DOOR = mkDoor('MainDoor', 13, 3);
const BAY1 = mkBay('Bay1', 12, 10, 3, 0, 0);
const ALPHA_HANGAR = mkHangar('Alpha', [MAIN_DOOR], [BAY1], 1, 1);

// ---------------------------------------------------------------------------
// Lines 135–143: NO_SUITABLE_BAY_SET rejection
// ---------------------------------------------------------------------------

describe('PlacementEngine.attemptPlacement — NO_SUITABLE_BAY_SET rejection', () => {
    test('aircraft fits door but not bays → NO_SUITABLE_BAY_SET rejection pushed', () => {
        const model = mkModel([NARROW_HANGAR], [], []) as any;
        const engine = new PlacementEngine(model);
        const state = mkState();

        const result = engine.attemptPlacement(
            'test-id', WIDE as any, undefined, 60 * 60_000,
            NARROW_HANGAR as any, undefined, state, DEFAULT_SIMULATION_CONFIG,
        );

        expect(result.placed).toBe(false);
        const bayRejection = result.rejections.find(
            (r: any) => r.ruleId === 'NO_SUITABLE_BAY_SET'
        );
        expect(bayRejection).toBeDefined();
        expect(bayRejection!.hangar).toBe('NarrowHangar');
    });

    test('NO_SUITABLE_BAY_SET rejection contains aircraft name in evidence', () => {
        const model = mkModel([NARROW_HANGAR], [], []) as any;
        const engine = new PlacementEngine(model);
        const state = mkState();

        const result = engine.attemptPlacement(
            'test-id', WIDE as any, undefined, 60 * 60_000,
            NARROW_HANGAR as any, undefined, state, DEFAULT_SIMULATION_CONFIG,
        );

        const bayRejection = result.rejections.find(
            (r: any) => r.ruleId === 'NO_SUITABLE_BAY_SET'
        ) as any;
        expect(bayRejection.evidence.aircraftName).toBe('WideBody');
    });
});

// ---------------------------------------------------------------------------
// Lines 240–241: checkDeparturePath — no hangar cache entry
// ---------------------------------------------------------------------------

describe('PlacementEngine.checkDeparturePath — missing cache entries', () => {
    test('unknown hangar name returns { clear: true } immediately (lines 240–241)', () => {
        const model = mkModel([ALPHA_HANGAR], [], []) as any;
        const engine = new PlacementEngine(model);
        const state = mkState();

        const result = engine.checkDeparturePath(
            'some-id', 'NonExistentHangar', ['Bay1'], state,
        );

        expect(result.clear).toBe(true);
    });

    test('hangar with no access graph modelled returns { clear: true } (line 246)', () => {
        // Standard fixtures have no accessPaths → buildAccessGraph returns null
        const model = mkModel([ALPHA_HANGAR], [], []) as any;
        const engine = new PlacementEngine(model);
        const state = mkState();

        const result = engine.checkDeparturePath(
            'some-id', 'Alpha', ['Bay1'], state,
        );

        expect(result.clear).toBe(true);
    });
});
