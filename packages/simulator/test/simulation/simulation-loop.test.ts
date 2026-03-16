/**
 * Integration tests for DiscreteEventSimulator — real event handlers.
 *
 * Tests use structural mocks (no Langium runtime) matching AST interfaces.
 * Manual inductions set the search window start; auto-inductions arrive
 * at max(windowStart, notBefore).
 */
import { describe, expect, test } from 'vitest';
import { DiscreteEventSimulator } from '../../src/simulation/simulation-loop.js';

// ---------------------------------------------------------------------------
// Langium reference wrapper
// ---------------------------------------------------------------------------

function ref<T>(val: T | undefined) {
    return { ref: val, $refText: (val as any)?.name ?? '' };
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkAircraft(name: string, wingspan = 11, length = 8, height = 3, tailHeight?: number) {
    return {
        name, wingspan, length, height,
        tailHeight: tailHeight ?? height,
        $type: 'AircraftType' as const,
    };
}

function mkDoor(name: string, width = 15, height = 5, accessNode?: any) {
    return {
        name, width, height,
        accessNode: accessNode ? ref(accessNode) : undefined,
        $type: 'HangarDoor' as const,
    };
}

function mkBay(
    name: string, width = 12, depth = 10, height = 5,
    row?: number, col?: number, adjacent: any[] = [], accessNode?: any,
    traversable?: boolean,
) {
    return {
        name, width, depth, height, row, col, adjacent,
        accessNode: accessNode ? ref(accessNode) : undefined,
        traversable: traversable ?? undefined,
        $type: 'HangarBay' as const,
    };
}

function mkHangar(name: string, doors: any[], bays: any[], rows?: number, cols?: number) {
    return { name, doors, grid: { bays, rows, cols }, $type: 'Hangar' as const };
}

function mkNode(name: string, width?: number) {
    return { name, width, $type: 'AccessNode' as const };
}

function mkLink(fromNode: any, toNode: any, bidirectional = false) {
    return { from: ref(fromNode), to: ref(toNode), bidirectional, $type: 'AccessLink' as const };
}

function mkPath(name: string, nodes: any[], links: any[]) {
    return { name, nodes, links, $type: 'AccessPath' as const };
}

/**
 * Create a manual Induction AST node.
 * start/end are DATETIME strings like "2024-06-01T08:00".
 */
function mkManualInduction(
    id: string,
    aircraft: any,
    hangar: any,
    bays: any[],
    door: any,
    start: string,
    end: string,
) {
    return {
        id,
        aircraft: ref(aircraft),
        hangar: ref(hangar),
        bays: bays.map((b: any) => ref(b)),
        door: ref(door),
        start,
        end,
        $type: 'Induction' as const,
    };
}

/**
 * Create an AutoInduction AST node.
 * duration is in minutes.
 */
function mkAutoInduction(
    id: string,
    aircraft: any,
    duration: number,
    opts: {
        notBefore?: string;
        notAfter?: string;
        preferredHangar?: any;
        requires?: number;
        precedingInductions?: any[];
        clearance?: any;
    } = {},
) {
    return {
        id,
        aircraft: ref(aircraft),
        duration,
        notBefore: opts.notBefore,
        notAfter: opts.notAfter,
        preferredHangar: opts.preferredHangar ? ref(opts.preferredHangar) : undefined,
        requires: opts.requires,
        precedingInductions: (opts.precedingInductions ?? []).map((p: any) => ref(p)),
        clearance: opts.clearance ? ref(opts.clearance) : undefined,
        $type: 'AutoInduction' as const,
    };
}

function mkModel(hangars: any[], inductions: any[] = [], autoInductions: any[] = [], accessPaths: any[] = []) {
    return {
        name: 'TestAirfield',
        hangars,
        inductions,
        autoInductions,
        accessPaths,
        $type: 'Model' as const,
    };
}

// ---------------------------------------------------------------------------
// Standard fixtures
// ---------------------------------------------------------------------------

const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);
const WIDE_JET = mkAircraft('WideJet', 30, 20, 5, 5);

const DOOR1 = mkDoor('Door1', 15, 5);
const BAY1 = mkBay('Bay1', 12, 10, 5, 0, 0);
const BAY2 = mkBay('Bay2', 12, 10, 5, 0, 1);
const HANGAR = mkHangar('Alpha', [DOOR1], [BAY1, BAY2], 1, 2);

const HOUR_MS = 60 * 60 * 1000;

// Baseline manual induction to anchor search window
const BASELINE_START = '2024-06-01T08:00';
const BASELINE_END = '2024-06-01T10:00';
const BASELINE_START_MS = new Date(BASELINE_START).getTime();

// ===========================================================================
// Basic placement — single auto-induction
// ===========================================================================

describe('DiscreteEventSimulator — single auto-induction placement', () => {
    test('places a single auto-induction into empty hangar', () => {
        const auto = mkAutoInduction('AUTO1', CESSNA, 120);
        // Use a manual induction to anchor the search window
        const manual = mkManualInduction('M1', CESSNA, HANGAR, [BAY1], DOOR1,
            BASELINE_START, BASELINE_END);
        const model = mkModel([HANGAR], [manual], [auto]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(1);
        const placed = result.scheduledInductions[0];
        expect(placed.inductionId).toBe('AUTO1');
        expect(placed.hangarName).toBe('Alpha');
        expect(placed.aircraftName).toBe('Cessna172');
    });

    test('aircraft too wide for door → failed induction', () => {
        const auto = mkAutoInduction('WIDE1', WIDE_JET, 120);
        const manual = mkManualInduction('M1', CESSNA, HANGAR, [BAY1], DOOR1,
            BASELINE_START, BASELINE_END);
        const model = mkModel([HANGAR], [manual], [auto]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.failedInductions.length).toBe(1);
        expect(result.failedInductions[0].inductionId).toBe('WIDE1');
    });
});

// ===========================================================================
// Wait and retry — aircraft waits when bays full, gets placed when bay frees
// ===========================================================================

describe('DiscreteEventSimulator — wait and retry', () => {
    test('aircraft waits when bays full, gets placed when bay frees', () => {
        // Manual induction occupies Bay1 from 08:00 to 10:00
        const manual = mkManualInduction('M1', CESSNA, HANGAR, [BAY1], DOOR1,
            '2024-06-01T08:00', '2024-06-01T10:00');

        // Second manual occupies Bay2 from 08:00 to 09:00
        const manual2 = mkManualInduction('M2', CESSNA, HANGAR, [BAY2], DOOR1,
            '2024-06-01T08:00', '2024-06-01T09:00');

        // Auto-induction arrives at window start — both bays occupied initially
        // Bay2 frees at 09:00, so the auto should be placed there
        const auto = mkAutoInduction('AUTO1', CESSNA, 60); // 60 min = 1 hour

        const model = mkModel([HANGAR], [manual, manual2], [auto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(1);
        const placed = result.scheduledInductions[0];
        expect(placed.inductionId).toBe('AUTO1');
        // Should be placed at or after Bay2 frees (09:00)
        const bay2FreeTime = new Date('2024-06-01T09:00').getTime();
        expect(placed.actualStart).toBeGreaterThanOrEqual(bay2FreeTime);
        expect(placed.bayNames).toContain('Bay2');

        // Check that ARRIVAL_QUEUED was logged (placement initially failed)
        const queuedLog = result.eventLog.find(
            e => e.kind === 'ARRIVAL_QUEUED' && e.inductionId === 'AUTO1',
        );
        expect(queuedLog).toBeDefined();

        // Check that RETRY_PLACED was logged (placed on retry)
        const retryLog = result.eventLog.find(
            e => e.kind === 'RETRY_PLACED' && e.inductionId === 'AUTO1',
        );
        expect(retryLog).toBeDefined();
    });
});

// ===========================================================================
// Departure blocked and retry
// ===========================================================================

describe('DiscreteEventSimulator — departure blocked and retry', () => {
    test('departure delayed when exit path blocked, succeeds on retry', () => {
        // Layout: Door → NodeD → NodeB1(Bay1, narrow=5m) → NodeB2(Bay2, wide=12m)
        //
        // CESSNA (wingspan=11) can't fit Bay1 (width=5) → forced into Bay2.
        // SMALL aircraft (wingspan=4) fits Bay1 (width=5).
        //
        // Timeline:
        //   Manual M0 in Bay2: 04:00→05:00 (anchors search window to 04:00)
        //   Auto A (CESSNA): notBefore=06:00 → placed in Bay2 at 06:00, 1h → done 07:00
        //   Auto B (SMALL): notBefore=06:00 → placed in Bay1 at 06:00, 2h → done 08:00
        //   At 07:00: A tries to depart via NodeB2→NodeB1→NodeD. NodeB1 blocked by B → blocked
        //   At 08:00: B departs, NodeB1 free → A departs. departureDelay = 1h
        const SMALL = mkAircraft('SmallPlane', 4, 4, 2, 2);
        const nodeD = mkNode('NodeD');
        const nodeB1 = mkNode('NodeB1');
        const nodeB2 = mkNode('NodeB2');
        const path = mkPath('P1',
            [nodeD, nodeB1, nodeB2],
            [mkLink(nodeD, nodeB1, true), mkLink(nodeB1, nodeB2, true)],
        );
        const doorAcc = mkDoor('Door1', 15, 5, nodeD);
        // Bay1 is narrow (width=5) — only SMALL fits
        const bay1Narrow = mkBay('Bay1', 5, 10, 5, 0, 0, [], nodeB1);
        // Bay2 is wide (width=12) — CESSNA fits
        const bay2Wide = mkBay('Bay2', 12, 10, 5, 0, 1, [], nodeB2);
        const hangarAcc = mkHangar('H', [doorAcc], [bay1Narrow, bay2Wide], 1, 2);

        // Dummy manual to anchor search window at 04:00
        const manualAnchor = mkManualInduction('M0', SMALL, hangarAcc, [bay2Wide], doorAcc,
            '2024-06-01T04:00', '2024-06-01T05:00');

        // Auto A (CESSNA, can't fit Bay1) — 60min duration, arrives at 06:00
        const autoA = mkAutoInduction('A', CESSNA, 60, { notBefore: '2024-06-01T06:00' });
        // Auto B (SMALL, fits Bay1) — 120min duration, arrives at 06:00
        const autoB = mkAutoInduction('B', SMALL, 120, { notBefore: '2024-06-01T06:00' });

        const model = mkModel([hangarAcc], [manualAnchor], [autoA, autoB], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const placedA = result.scheduledInductions.find(s => s.inductionId === 'A');
        expect(placedA).toBeDefined();
        expect(placedA!.bayNames).toContain('Bay2');

        // A's departure should be delayed (blocked by B in Bay1 until 08:00)
        expect(placedA!.departureDelay).toBeGreaterThan(0);

        // Check that DEPARTURE_BLOCKED was logged for A
        const blockedLog = result.eventLog.find(
            e => e.kind === 'DEPARTURE_BLOCKED' && e.inductionId === 'A',
        );
        expect(blockedLog).toBeDefined();

        // Check that A eventually departed
        const clearedLog = result.eventLog.find(
            e => e.kind === 'DEPARTURE_CLEARED' && e.inductionId === 'A',
        );
        expect(clearedLog).toBeDefined();
    });
});

// ===========================================================================
// Cascading — A blocks B's exit, A departs, B departs, C gets placed
// ===========================================================================

describe('DiscreteEventSimulator — cascading departures and placement', () => {
    test('B blocks A exit → B departs → A departs → C placed in freed bay', () => {
        // Layout: Door → NodeD → NodeB1(Bay1, narrow=5m) → NodeB2(Bay2, wide=12m)
        //
        // Same topology as departure-blocked test.
        // Auto A (CESSNA): forced into Bay2 (Bay1 too narrow), 1h duration
        // Auto B (SMALL): fits Bay1, 2h duration
        // Auto C (CESSNA): waiting — both bays occupied, gets placed after B+A depart
        //
        // Timeline:
        //   06:00: A placed in Bay2, B placed in Bay1
        //   07:00: A done, departure blocked (B in Bay1)
        //   08:00: B departs → A unblocked → A departs → C placed
        const SMALL = mkAircraft('SmallPlane', 4, 4, 2, 2);
        const nodeD = mkNode('NodeD');
        const nodeB1 = mkNode('NodeB1');
        const nodeB2 = mkNode('NodeB2');
        const path = mkPath('P1',
            [nodeD, nodeB1, nodeB2],
            [mkLink(nodeD, nodeB1, true), mkLink(nodeB1, nodeB2, true)],
        );
        const doorAcc = mkDoor('Door1', 15, 5, nodeD);
        const bay1Narrow = mkBay('Bay1', 5, 10, 5, 0, 0, [], nodeB1);
        const bay2Wide = mkBay('Bay2', 12, 10, 5, 0, 1, [], nodeB2);
        const hangarAcc = mkHangar('H', [doorAcc], [bay1Narrow, bay2Wide], 1, 2);

        const manualAnchor = mkManualInduction('M0', SMALL, hangarAcc, [bay2Wide], doorAcc,
            '2024-06-01T04:00', '2024-06-01T05:00');

        const autoA = mkAutoInduction('A', CESSNA, 60, { notBefore: '2024-06-01T06:00' });
        const autoB = mkAutoInduction('B', SMALL, 120, { notBefore: '2024-06-01T06:00' });
        const autoC = mkAutoInduction('C', CESSNA, 60, { notBefore: '2024-06-01T06:00' });

        const model = mkModel([hangarAcc], [manualAnchor], [autoA, autoB, autoC], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const placedA = result.scheduledInductions.find(s => s.inductionId === 'A');
        const placedC = result.scheduledInductions.find(s => s.inductionId === 'C');
        expect(placedA).toBeDefined();
        expect(placedC).toBeDefined();

        // A's departure should be delayed (blocked by B)
        expect(placedA!.departureDelay).toBeGreaterThan(0);

        // C should be placed after A departs (at or after 08:00)
        const bEndMs = new Date('2024-06-01T08:00').getTime();
        expect(placedC!.actualStart).toBeGreaterThanOrEqual(bEndMs);
    });
});

// ===========================================================================
// notAfter deadline — aircraft expires while waiting
// ===========================================================================

describe('DiscreteEventSimulator — notAfter deadline expiry', () => {
    test('aircraft exceeds notAfter while waiting → marked as failed', () => {
        // Both bays occupied from 08:00 to 12:00
        const manual1 = mkManualInduction('M1', CESSNA, HANGAR, [BAY1], DOOR1,
            '2024-06-01T08:00', '2024-06-01T12:00');
        const manual2 = mkManualInduction('M2', CESSNA, HANGAR, [BAY2], DOOR1,
            '2024-06-01T08:00', '2024-06-01T12:00');

        // Auto-induction with notAfter at 10:00 — bays don't free until 12:00
        const auto = mkAutoInduction('EXPIRED1', CESSNA, 60, {
            notAfter: '2024-06-01T10:00',
        });

        const model = mkModel([HANGAR], [manual1, manual2], [auto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        // Should be failed, not scheduled
        expect(result.scheduledInductions.find(s => s.inductionId === 'EXPIRED1')).toBeUndefined();
        expect(result.failedInductions.length).toBeGreaterThanOrEqual(1);
        const failed = result.failedInductions.find(f => f.inductionId === 'EXPIRED1');
        expect(failed).toBeDefined();
        expect(failed!.reason).toBe('SIM_DEADLINE_EXCEEDED');

        // DEADLINE_EXPIRED should appear in event log
        const expiredLog = result.eventLog.find(
            e => e.kind === 'DEADLINE_EXPIRED' && e.inductionId === 'EXPIRED1',
        );
        expect(expiredLog).toBeDefined();
    });
});

// ===========================================================================
// `after` dependency — auto waits for manual induction to finish
// ===========================================================================

describe('DiscreteEventSimulator — after dependency on manual induction', () => {
    test('auto-induction waits for manual induction to finish before arriving', () => {
        // Manual induction in Bay1: 08:00–12:00
        const manual = mkManualInduction('M1', CESSNA, HANGAR, [BAY1], DOOR1,
            '2024-06-01T08:00', '2024-06-01T12:00');

        // Auto after M1 — should arrive at max(windowStart, manual.end) = 12:00
        const auto = mkAutoInduction('AFTER_M', CESSNA, 60, {
            precedingInductions: [manual],
        });

        const model = mkModel([HANGAR], [manual], [auto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(1);
        const placed = result.scheduledInductions[0];
        expect(placed.inductionId).toBe('AFTER_M');

        // Should start at or after manual end (12:00)
        const manualEndMs = new Date('2024-06-01T12:00').getTime();
        expect(placed.actualStart).toBeGreaterThanOrEqual(manualEndMs);
    });
});

// ===========================================================================
// `after` chain — auto A after auto B, B after manual C
// ===========================================================================

describe('DiscreteEventSimulator — after chain (auto→auto→manual)', () => {
    test('chain: auto A after auto B, B after manual C', () => {
        // Manual C: 08:00–10:00
        const manualC = mkManualInduction('C', CESSNA, HANGAR, [BAY1], DOOR1,
            '2024-06-01T08:00', '2024-06-01T10:00');

        // Auto B after C — arrives at 10:00 (when C ends), 1-hour duration
        const autoB = mkAutoInduction('B', CESSNA, 60, {
            precedingInductions: [manualC],
        });

        // Auto A after B — deferred until B departs
        const autoA = mkAutoInduction('A', CESSNA, 60, {
            precedingInductions: [{ id: 'B', $type: 'Induction' as const } as any],
        });

        const model = mkModel([HANGAR], [manualC], [autoB, autoA]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        // Both A and B should be scheduled
        expect(result.scheduledInductions.length).toBe(2);
        const placedB = result.scheduledInductions.find(s => s.inductionId === 'B');
        const placedA = result.scheduledInductions.find(s => s.inductionId === 'A');
        expect(placedB).toBeDefined();
        expect(placedA).toBeDefined();

        // B should start at or after C ends (10:00)
        const cEndMs = new Date('2024-06-01T10:00').getTime();
        expect(placedB!.actualStart).toBeGreaterThanOrEqual(cEndMs);

        // A should start at or after B departs
        expect(placedA!.actualStart).toBeGreaterThanOrEqual(placedB!.actualEnd);
    });
});

// ===========================================================================
// Statistics tracking
// ===========================================================================

describe('DiscreteEventSimulator — statistics', () => {
    test('tracks peak occupancy and event counts', () => {
        const manual = mkManualInduction('M1', CESSNA, HANGAR, [BAY1], DOOR1,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const auto = mkAutoInduction('AUTO1', CESSNA, 60);
        const model = mkModel([HANGAR], [manual], [auto]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.statistics.totalEvents).toBeGreaterThan(0);
        expect(result.statistics.peakOccupancy).toBeGreaterThanOrEqual(1);
        expect(result.statistics.totalAutoInductions).toBe(1);
        expect(result.statistics.placedCount).toBe(1);
        expect(result.statistics.failedCount).toBe(0);
    });
});
