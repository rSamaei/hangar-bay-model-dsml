/**
 * End-to-end simulation scenarios for DiscreteEventSimulator.
 *
 * Each scenario exercises a distinct behavioural path through the simulation
 * engine: sequential placement, bay contention, access-path blocking,
 * cascading delays, multi-bay placement, hangar fallback, dependency chains,
 * deadline expiry, and traversable bay pass-through.
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
// Fixture helpers (local — mirrors simulation-loop.test.ts)
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

function mkManualInduction(
    id: string, aircraft: any, hangar: any, bays: any[],
    door: any, start: string, end: string,
) {
    return {
        id,
        aircraft: ref(aircraft),
        hangar: ref(hangar),
        bays: bays.map((b: any) => ref(b)),
        door: ref(door),
        start, end,
        $type: 'Induction' as const,
    };
}

function mkAutoInduction(
    id: string, aircraft: any, duration: number,
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
        hangars, inductions, autoInductions, accessPaths,
        $type: 'Model' as const,
    };
}

// ---------------------------------------------------------------------------
// Common constants
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

// ===========================================================================
// Scenario 1 — Simple sequential: no waiting
// ===========================================================================

describe('Scenario 1: Simple sequential — no waiting', () => {
    // 1 hangar, 4 bays, 1 door
    // 2 auto-inductions that fit sequentially (non-overlapping notBefore/notAfter)
    const CESSNA = mkAircraft('Cessna', 11, 8, 3);
    const DOOR = mkDoor('D1', 15, 5);
    const B1 = mkBay('B1', 12, 10, 5, 0, 0);
    const B2 = mkBay('B2', 12, 10, 5, 0, 1);
    const B3 = mkBay('B3', 12, 10, 5, 0, 2);
    const B4 = mkBay('B4', 12, 10, 5, 0, 3);
    const HANGAR = mkHangar('H1', [DOOR], [B1, B2, B3, B4], 1, 4);

    // Anchor with a short manual induction
    const ANCHOR = mkManualInduction('M0', CESSNA, HANGAR, [B4], DOOR,
        '2024-06-01T06:00', '2024-06-01T06:30');

    test('both placed immediately with zero wait time', () => {
        // A1: 08:00-09:00 (60 min), A2: 10:00-11:00 (60 min) — non-overlapping
        const a1 = mkAutoInduction('A1', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const a2 = mkAutoInduction('A2', CESSNA, 60, { notBefore: '2024-06-01T10:00' });
        const model = mkModel([HANGAR], [ANCHOR], [a1, a2]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(2);
        expect(result.failedInductions.length).toBe(0);

        for (const placed of result.scheduledInductions) {
            expect(placed.waitTime).toBe(0);
        }

        // No ARRIVAL_QUEUED events should appear
        const queued = result.eventLog.filter(e => e.kind === 'ARRIVAL_QUEUED');
        expect(queued.length).toBe(0);
    });

    test('both placed into ARRIVAL_PLACED events', () => {
        const a1 = mkAutoInduction('A1', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const a2 = mkAutoInduction('A2', CESSNA, 60, { notBefore: '2024-06-01T10:00' });
        const model = mkModel([HANGAR], [ANCHOR], [a1, a2]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const placedLogs = result.eventLog.filter(e => e.kind === 'ARRIVAL_PLACED');
        expect(placedLogs.length).toBe(2);
        const ids = placedLogs.map(e => e.inductionId).sort();
        expect(ids).toEqual(['A1', 'A2']);
    });
});

// ===========================================================================
// Scenario 2 — Waiting queue: bay contention
// ===========================================================================

describe('Scenario 2: Waiting queue — bay contention', () => {
    // 1 hangar, 2 bays (each wide enough for 1 aircraft), 1 door
    // 3 auto-inductions all want to start at the same time
    const CESSNA = mkAircraft('Cessna', 11, 8, 3);
    const DOOR = mkDoor('D1', 15, 5);
    const B1 = mkBay('B1', 12, 10, 5, 0, 0);
    const B2 = mkBay('B2', 12, 10, 5, 0, 1);
    const HANGAR = mkHangar('H1', [DOOR], [B1, B2], 1, 2);

    // Anchor manual induction to fix search window
    const ANCHOR = mkManualInduction('M0', CESSNA, HANGAR, [B1], DOOR,
        '2024-06-01T06:00', '2024-06-01T06:30');

    test('2 placed immediately, 1 waits and gets placed after first departure', () => {
        const a1 = mkAutoInduction('A1', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const a2 = mkAutoInduction('A2', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const a3 = mkAutoInduction('A3', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const model = mkModel([HANGAR], [ANCHOR], [a1, a2, a3]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(3);
        expect(result.failedInductions.length).toBe(0);

        // Exactly 1 aircraft should have been queued
        const queuedLogs = result.eventLog.filter(e => e.kind === 'ARRIVAL_QUEUED');
        expect(queuedLogs.length).toBe(1);

        // The queued aircraft should have a RETRY_PLACED event
        const retryLogs = result.eventLog.filter(e => e.kind === 'RETRY_PLACED');
        expect(retryLogs.length).toBe(1);
    });

    test('waiting aircraft has wait time ≈ 60 minutes', () => {
        const a1 = mkAutoInduction('A1', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const a2 = mkAutoInduction('A2', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const a3 = mkAutoInduction('A3', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const model = mkModel([HANGAR], [ANCHOR], [a1, a2, a3]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        // Find the one that waited (waitTime > 0)
        const waiter = result.scheduledInductions.find(s => s.waitTime > 0);
        expect(waiter).toBeDefined();
        // Wait time should be ~60 min (the first departure frees a bay at 09:00)
        expect(waiter!.waitTime).toBe(60 * 60 * 1000);
    });

    test('the waiter starts at 09:00 (after first departure)', () => {
        const a1 = mkAutoInduction('A1', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const a2 = mkAutoInduction('A2', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const a3 = mkAutoInduction('A3', CESSNA, 60, { notBefore: '2024-06-01T08:00' });
        const model = mkModel([HANGAR], [ANCHOR], [a1, a2, a3]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const t09 = new Date('2024-06-01T09:00').getTime();
        const waiter = result.scheduledInductions.find(s => s.waitTime > 0);
        expect(waiter).toBeDefined();
        expect(waiter!.actualStart).toBe(t09);
    });
});

// ===========================================================================
// Scenario 3 — Access path blocking delays departure
// ===========================================================================

describe('Scenario 3: Access path blocking delays departure', () => {
    // Layout: Door → NodeD → NodeB1(Bay1) → NodeB2(Bay2) → NodeB3(Bay3)
    // Aircraft A in Bay3 must pass through Bay2 to exit.
    // Aircraft B in Bay2 blocks A's exit until B departs.
    const CESSNA = mkAircraft('Cessna', 11, 8, 3);
    const SMALL = mkAircraft('SmallPlane', 4, 4, 2, 2);

    const nodeD  = mkNode('NodeD');
    const nodeB1 = mkNode('NodeB1');
    const nodeB2 = mkNode('NodeB2');
    const nodeB3 = mkNode('NodeB3');
    const path = mkPath('P1',
        [nodeD, nodeB1, nodeB2, nodeB3],
        [
            mkLink(nodeD, nodeB1, true),
            mkLink(nodeB1, nodeB2, true),
            mkLink(nodeB2, nodeB3, true),
        ],
    );

    // Bay1 narrow (only SMALL fits) — forces CESSNA to Bay2 or Bay3
    const B1 = mkBay('Bay1', 5, 10, 5, 0, 0, [], nodeB1);
    const B2 = mkBay('Bay2', 12, 10, 5, 0, 1, [], nodeB2);
    const B3 = mkBay('Bay3', 12, 10, 5, 0, 2, [], nodeB3);
    const DOOR = mkDoor('Door1', 15, 5, nodeD);
    const HANGAR = mkHangar('H1', [DOOR], [B1, B2, B3], 1, 3);

    // Anchor
    const ANCHOR = mkManualInduction('M0', SMALL, HANGAR, [B1], DOOR,
        '2024-06-01T04:00', '2024-06-01T05:00');

    test('aircraft in Bay3 has departure delayed until Bay2 clears', () => {
        // A (CESSNA) in Bay3, 1h duration (done at 07:00)
        // B (SMALL) in Bay1, 2h duration (done at 08:00) — blocks exit from Bay3 via Bay1
        // Wait — actually SMALL in Bay1 doesn't block Bay3→Bay2→Bay1→Door.
        // We need B in Bay2 to block A in Bay3.
        // CESSNA goes to Bay3 (it fits), CESSNA2 goes to Bay2 (it fits).
        // CESSNA2 in Bay2, 2h → done at 08:00, blocks A's exit from Bay3.
        const CESSNA2 = mkAircraft('Cessna2', 11, 8, 3);
        const autoA = mkAutoInduction('A', CESSNA, 60, { notBefore: '2024-06-01T06:00' });
        const autoB = mkAutoInduction('B', CESSNA2, 120, { notBefore: '2024-06-01T06:00' });

        const model = mkModel([HANGAR], [ANCHOR], [autoA, autoB], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        // Both should be placed
        const placedA = result.scheduledInductions.find(s => s.inductionId === 'A');
        const placedB = result.scheduledInductions.find(s => s.inductionId === 'B');
        expect(placedA).toBeDefined();
        expect(placedB).toBeDefined();

        // One is in Bay2, the other in Bay3 (or both CESSNA-sized, placement picks closest)
        // The one deeper in the corridor should have departure delayed
        const deeper = [placedA!, placedB!].find(p => p.bayNames.includes('Bay3'));
        if (deeper) {
            // If the deeper aircraft finishes first, it should have departure delay
            const blocker = [placedA!, placedB!].find(p => p !== deeper);
            if (deeper.maintenanceEnd < blocker!.maintenanceEnd) {
                expect(deeper.departureDelay).toBeGreaterThan(0);

                const blockedLog = result.eventLog.find(
                    e => e.kind === 'DEPARTURE_BLOCKED' && e.inductionId === deeper.inductionId,
                );
                expect(blockedLog).toBeDefined();
            }
        }
    });

    test('departure blocked event is followed by departure cleared', () => {
        // Use distinct aircraft sizes: SMALL→Bay1, CESSNA→Bay2(2h), CESSNA→Bay3(1h)
        // Bay3 aircraft done at 07:00, blocked by Bay2 until 08:00
        const autoDeep = mkAutoInduction('DEEP', CESSNA, 60, { notBefore: '2024-06-01T06:00' });
        const autoMid  = mkAutoInduction('MID', CESSNA, 120, { notBefore: '2024-06-01T06:00' });
        const autoFront = mkAutoInduction('FRONT', SMALL, 120, { notBefore: '2024-06-01T06:00' });

        const model = mkModel([HANGAR], [ANCHOR], [autoDeep, autoMid, autoFront], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        // All three should be placed (3 bays available)
        expect(result.scheduledInductions.length).toBe(3);

        // There should be DEPARTURE_CLEARED events for all scheduled
        const cleared = result.eventLog.filter(e => e.kind === 'DEPARTURE_CLEARED');
        expect(cleared.length).toBeGreaterThanOrEqual(3);
    });
});

// ===========================================================================
// Scenario 4 — Cascading delays
// ===========================================================================

describe('Scenario 4: Cascading delays', () => {
    // 3 bays in a corridor. 3 aircraft, all overlapping.
    // Deepest can't leave until middle clears, middle can't clear until outermost clears.
    const CESSNA = mkAircraft('Cessna', 11, 8, 3);
    const SMALL  = mkAircraft('Small', 4, 4, 2, 2);

    const nodeD  = mkNode('NodeD');
    const nodeB1 = mkNode('NodeB1');
    const nodeB2 = mkNode('NodeB2');
    const nodeB3 = mkNode('NodeB3');
    const path = mkPath('P1',
        [nodeD, nodeB1, nodeB2, nodeB3],
        [
            mkLink(nodeD, nodeB1, true),
            mkLink(nodeB1, nodeB2, true),
            mkLink(nodeB2, nodeB3, true),
        ],
    );

    const B1 = mkBay('Bay1', 5, 10, 5, 0, 0, [], nodeB1);
    const B2 = mkBay('Bay2', 12, 10, 5, 0, 1, [], nodeB2);
    const B3 = mkBay('Bay3', 12, 10, 5, 0, 2, [], nodeB3);
    const DOOR = mkDoor('Door1', 15, 5, nodeD);
    const HANGAR = mkHangar('H1', [DOOR], [B1, B2, B3], 1, 3);

    const ANCHOR = mkManualInduction('M0', SMALL, HANGAR, [B1], DOOR,
        '2024-06-01T04:00', '2024-06-01T05:00');

    test('cascade resolves: outermost departs first, then middle, then deepest', () => {
        // Bay1 (SMALL, 3h, done 09:00) blocks Bay2
        // Bay2 (CESSNA, 1h, done 07:00) blocks Bay3  — delayed until Bay1 clears
        // Bay3 (CESSNA, 1h, done 07:00) — delayed until Bay2 clears
        const autoOuter = mkAutoInduction('OUTER', SMALL, 180, { notBefore: '2024-06-01T06:00' });  // 3h
        const autoMid   = mkAutoInduction('MID', CESSNA, 60, { notBefore: '2024-06-01T06:00' });    // 1h
        const autoDeep  = mkAutoInduction('DEEP', CESSNA, 60, { notBefore: '2024-06-01T06:00' });   // 1h

        const model = mkModel([HANGAR], [ANCHOR], [autoOuter, autoMid, autoDeep], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(3);

        const outer = result.scheduledInductions.find(s => s.inductionId === 'OUTER');
        const mid   = result.scheduledInductions.find(s => s.inductionId === 'MID');
        const deep  = result.scheduledInductions.find(s => s.inductionId === 'DEEP');
        expect(outer).toBeDefined();
        expect(mid).toBeDefined();
        expect(deep).toBeDefined();

        // OUTER finishes maintenance at 09:00, departs at 09:00 (nothing blocking Bay1→Door)
        // MID finishes maintenance at 07:00, blocked by OUTER until 09:00 → delay = 2h
        // DEEP finishes at 07:00, blocked until MID departs (at ~09:00) → delay ≥ 2h
        if (mid!.bayNames.includes('Bay2') && deep!.bayNames.includes('Bay3')) {
            expect(mid!.departureDelay).toBeGreaterThan(0);
            expect(deep!.departureDelay).toBeGreaterThan(0);
            // Total delay accumulates — deep's departure is after mid's
            expect(deep!.actualEnd).toBeGreaterThanOrEqual(mid!.actualEnd);
        }
    });

    test('total departure delay across cascade is nonzero', () => {
        const autoOuter = mkAutoInduction('OUTER', SMALL, 180, { notBefore: '2024-06-01T06:00' });
        const autoMid   = mkAutoInduction('MID', CESSNA, 60, { notBefore: '2024-06-01T06:00' });
        const autoDeep  = mkAutoInduction('DEEP', CESSNA, 60, { notBefore: '2024-06-01T06:00' });

        const model = mkModel([HANGAR], [ANCHOR], [autoOuter, autoMid, autoDeep], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.statistics.totalDepartureDelay).toBeGreaterThan(0);
    });
});

// ===========================================================================
// Scenario 5 — Multi-bay aircraft waiting
// ===========================================================================

describe('Scenario 5: Multi-bay aircraft waiting', () => {
    // 1×2 grid hangar (only 2 bays). Aircraft requires 2 bays (lateral span).
    // First aircraft occupies both bays. Second must wait until first departs.
    const WIDE = mkAircraft('WideJet', 22, 10, 4);  // wingspan=22 → needs 2 bays of width=12
    const SMALL = mkAircraft('Small', 4, 4, 2, 2);
    const DOOR = mkDoor('D1', 25, 6);
    const B0 = mkBay('B0', 12, 10, 5, 0, 0);
    const B1 = mkBay('B1', 12, 10, 5, 0, 1);
    const HANGAR = mkHangar('H1', [DOOR], [B0, B1], 1, 2);

    const ANCHOR = mkManualInduction('M0', SMALL, HANGAR, [B0], DOOR,
        '2024-06-01T06:00', '2024-06-01T06:30');

    test('second multi-bay aircraft waits until first departs', () => {
        const a1 = mkAutoInduction('W1', WIDE, 60, { notBefore: '2024-06-01T08:00', requires: 2 });
        const a2 = mkAutoInduction('W2', WIDE, 60, { notBefore: '2024-06-01T08:00', requires: 2 });

        const model = mkModel([HANGAR], [ANCHOR], [a1, a2]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(2);

        // One should have zero wait, the other non-zero
        const waits = result.scheduledInductions.map(s => s.waitTime).sort((a, b) => a - b);
        expect(waits[0]).toBe(0);
        expect(waits[1]).toBeGreaterThan(0);
    });

    test('second aircraft uses a valid 2-bay set after first departs', () => {
        const a1 = mkAutoInduction('W1', WIDE, 60, { notBefore: '2024-06-01T08:00', requires: 2 });
        const a2 = mkAutoInduction('W2', WIDE, 60, { notBefore: '2024-06-01T08:00', requires: 2 });

        const model = mkModel([HANGAR], [ANCHOR], [a1, a2]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        for (const placed of result.scheduledInductions) {
            expect(placed.bayNames.length).toBe(2);
        }
    });
});

// ===========================================================================
// Scenario 6 — Preferred hangar fallback
// ===========================================================================

describe('Scenario 6: Preferred hangar fallback', () => {
    // 2 hangars. Aircraft prefers Hangar1 but it's full. Hangar2 has space.
    const CESSNA = mkAircraft('Cessna', 11, 8, 3);

    const DOOR1 = mkDoor('D1', 15, 5);
    const BAY1  = mkBay('Bay1', 12, 10, 5, 0, 0);
    const H1 = mkHangar('Hangar1', [DOOR1], [BAY1], 1, 1);

    const DOOR2 = mkDoor('D2', 15, 5);
    const BAY2  = mkBay('Bay2', 12, 10, 5, 0, 0);
    const H2 = mkHangar('Hangar2', [DOOR2], [BAY2], 1, 1);

    test('aircraft placed in Hangar2 when Hangar1 is full', () => {
        // Manual induction fills Hangar1's only bay 08:00-12:00
        const manual = mkManualInduction('M1', CESSNA, H1, [BAY1], DOOR1,
            '2024-06-01T08:00', '2024-06-01T12:00');

        // Auto prefers H1, arrives at 08:00 — H1 full, should fall back to H2
        const auto = mkAutoInduction('FALL', CESSNA, 60, {
            notBefore: '2024-06-01T08:00',
            preferredHangar: H1,
        });

        const model = mkModel([H1, H2], [manual], [auto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(1);
        const placed = result.scheduledInductions[0];
        expect(placed.inductionId).toBe('FALL');
        expect(placed.hangarName).toBe('Hangar2');
        expect(placed.waitTime).toBe(0);
    });

    test('aircraft placed in preferred hangar when it has space', () => {
        // No manual inductions filling H1 — it's empty
        const anchor = mkManualInduction('M0', CESSNA, H2, [BAY2], DOOR2,
            '2024-06-01T06:00', '2024-06-01T06:30');
        const auto = mkAutoInduction('PREF', CESSNA, 60, {
            notBefore: '2024-06-01T08:00',
            preferredHangar: H1,
        });

        const model = mkModel([H1, H2], [anchor], [auto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(1);
        expect(result.scheduledInductions[0].hangarName).toBe('Hangar1');
    });
});

// ===========================================================================
// Scenario 7 — After-dependency chain
// ===========================================================================

describe('Scenario 7: After-dependency chain', () => {
    // Manual M1: 08:00-10:00
    // Auto A1 after M1
    // Auto A2 after A1
    const CESSNA = mkAircraft('Cessna', 11, 8, 3);
    const DOOR = mkDoor('D1', 15, 5);
    const B1 = mkBay('B1', 12, 10, 5, 0, 0);
    const B2 = mkBay('B2', 12, 10, 5, 0, 1);
    const HANGAR = mkHangar('H1', [DOOR], [B1, B2], 1, 2);

    test('A1 starts at or after M1 ends (10:00)', () => {
        const m1 = mkManualInduction('M1', CESSNA, HANGAR, [B1], DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const a1 = mkAutoInduction('A1', CESSNA, 60, {
            precedingInductions: [m1],
        });
        const a2 = mkAutoInduction('A2', CESSNA, 60, {
            precedingInductions: [{ id: 'A1', $type: 'Induction' as const } as any],
        });

        const model = mkModel([HANGAR], [m1], [a1, a2]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(2);

        const placedA1 = result.scheduledInductions.find(s => s.inductionId === 'A1');
        expect(placedA1).toBeDefined();
        const m1EndMs = new Date('2024-06-01T10:00').getTime();
        expect(placedA1!.actualStart).toBeGreaterThanOrEqual(m1EndMs);
    });

    test('A2 starts at or after A1 finishes (actualEnd)', () => {
        const m1 = mkManualInduction('M1', CESSNA, HANGAR, [B1], DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const a1 = mkAutoInduction('A1', CESSNA, 60, {
            precedingInductions: [m1],
        });
        const a2 = mkAutoInduction('A2', CESSNA, 60, {
            precedingInductions: [{ id: 'A1', $type: 'Induction' as const } as any],
        });

        const model = mkModel([HANGAR], [m1], [a1, a2]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const placedA1 = result.scheduledInductions.find(s => s.inductionId === 'A1');
        const placedA2 = result.scheduledInductions.find(s => s.inductionId === 'A2');
        expect(placedA1).toBeDefined();
        expect(placedA2).toBeDefined();

        // A2 should not start before A1 departs
        expect(placedA2!.actualStart).toBeGreaterThanOrEqual(placedA1!.actualEnd);
    });

    test('DEPENDENCY_UNLOCKED event logged for A2', () => {
        const m1 = mkManualInduction('M1', CESSNA, HANGAR, [B1], DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const a1 = mkAutoInduction('A1', CESSNA, 60, {
            precedingInductions: [m1],
        });
        const a2 = mkAutoInduction('A2', CESSNA, 60, {
            precedingInductions: [{ id: 'A1', $type: 'Induction' as const } as any],
        });

        const model = mkModel([HANGAR], [m1], [a1, a2]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const unlocked = result.eventLog.find(
            e => e.kind === 'DEPENDENCY_UNLOCKED' && e.inductionId === 'A2',
        );
        expect(unlocked).toBeDefined();
    });
});

// ===========================================================================
// Scenario 8 — notAfter exceeded: failure
// ===========================================================================

describe('Scenario 8: notAfter exceeded — failure', () => {
    // 1 bay. Aircraft A: 08:00-12:00. Aircraft B: notBefore 08:00, notAfter 09:00.
    // B can't be placed (bay occupied) and its window expires.
    const CESSNA = mkAircraft('Cessna', 11, 8, 3);
    const DOOR = mkDoor('D1', 15, 5);
    const BAY = mkBay('B1', 12, 10, 5, 0, 0);
    const HANGAR = mkHangar('H1', [DOOR], [BAY], 1, 1);

    test('B marked as failed with SIM_DEADLINE_EXCEEDED', () => {
        const manualA = mkManualInduction('A', CESSNA, HANGAR, [BAY], DOOR,
            '2024-06-01T08:00', '2024-06-01T12:00');
        const autoB = mkAutoInduction('B', CESSNA, 60, {
            notBefore: '2024-06-01T08:00',
            notAfter: '2024-06-01T09:00',
        });

        const model = mkModel([HANGAR], [manualA], [autoB]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.find(s => s.inductionId === 'B')).toBeUndefined();
        expect(result.failedInductions.length).toBe(1);

        const failed = result.failedInductions[0];
        expect(failed.inductionId).toBe('B');
        expect(failed.reason).toBe('SIM_DEADLINE_EXCEEDED');
    });

    test('DEADLINE_EXPIRED event appears in log', () => {
        const manualA = mkManualInduction('A', CESSNA, HANGAR, [BAY], DOOR,
            '2024-06-01T08:00', '2024-06-01T12:00');
        const autoB = mkAutoInduction('B', CESSNA, 60, {
            notBefore: '2024-06-01T08:00',
            notAfter: '2024-06-01T09:00',
        });

        const model = mkModel([HANGAR], [manualA], [autoB]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const expired = result.eventLog.find(
            e => e.kind === 'DEADLINE_EXPIRED' && e.inductionId === 'B',
        );
        expect(expired).toBeDefined();
    });

    test('statistics report 1 failed', () => {
        const manualA = mkManualInduction('A', CESSNA, HANGAR, [BAY], DOOR,
            '2024-06-01T08:00', '2024-06-01T12:00');
        const autoB = mkAutoInduction('B', CESSNA, 60, {
            notBefore: '2024-06-01T08:00',
            notAfter: '2024-06-01T09:00',
        });

        const model = mkModel([HANGAR], [manualA], [autoB]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.statistics.failedCount).toBe(1);
        expect(result.statistics.placedCount).toBe(0);
    });
});

// ===========================================================================
// Scenario 9 — Traversable bay doesn't block access
// ===========================================================================

describe('Scenario 9: Traversable bay does not block access', () => {
    // Door → NodeD → NodeB1(Bay1) → NodeB2(Bay2, traversable) → NodeB3(Bay3)
    // Aircraft in Bay2 (traversable) should NOT block Bay3 aircraft from departing.
    const CESSNA  = mkAircraft('Cessna', 11, 8, 3);
    const SMALL   = mkAircraft('Small', 4, 4, 2, 2);

    const nodeD  = mkNode('NodeD');
    const nodeB1 = mkNode('NodeB1');
    const nodeB2 = mkNode('NodeB2');
    const nodeB3 = mkNode('NodeB3');
    const path = mkPath('P1',
        [nodeD, nodeB1, nodeB2, nodeB3],
        [
            mkLink(nodeD, nodeB1, true),
            mkLink(nodeB1, nodeB2, true),
            mkLink(nodeB2, nodeB3, true),
        ],
    );

    // Bay1 narrow for CESSNA → CESSNA forced to Bay2/Bay3
    const B1 = mkBay('Bay1', 5, 10, 5, 0, 0, [], nodeB1);
    // Bay2 traversable — occupant doesn't block the path
    const B2 = mkBay('Bay2', 12, 10, 5, 0, 1, [], nodeB2, true /* traversable */);
    const B3 = mkBay('Bay3', 12, 10, 5, 0, 2, [], nodeB3);
    const DOOR = mkDoor('Door1', 15, 5, nodeD);
    const HANGAR = mkHangar('H1', [DOOR], [B1, B2, B3], 1, 3);

    const ANCHOR = mkManualInduction('M0', SMALL, HANGAR, [B1], DOOR,
        '2024-06-01T04:00', '2024-06-01T05:00');

    test('Bay3 aircraft departs without delay even when traversable Bay2 is occupied', () => {
        // CESSNA in Bay3 (1h, done 07:00) — should depart immediately (Bay2 traversable)
        // CESSNA in Bay2 (2h, done 08:00) — traversable, does NOT block Bay3→Door path
        const autoDeep = mkAutoInduction('DEEP', CESSNA, 60, { notBefore: '2024-06-01T06:00' });
        const autoMid  = mkAutoInduction('MID', CESSNA, 120, { notBefore: '2024-06-01T06:00' });

        const model = mkModel([HANGAR], [ANCHOR], [autoDeep, autoMid], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.scheduledInductions.length).toBe(2);

        // The Bay3 aircraft should have zero departure delay (Bay2 is traversable)
        const bay3Aircraft = result.scheduledInductions.find(s => s.bayNames.includes('Bay3'));
        if (bay3Aircraft) {
            expect(bay3Aircraft.departureDelay).toBe(0);
        }
    });

    test('no DEPARTURE_BLOCKED event for Bay3 aircraft', () => {
        const autoDeep = mkAutoInduction('DEEP', CESSNA, 60, { notBefore: '2024-06-01T06:00' });
        const autoMid  = mkAutoInduction('MID', CESSNA, 120, { notBefore: '2024-06-01T06:00' });

        const model = mkModel([HANGAR], [ANCHOR], [autoDeep, autoMid], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const bay3Aircraft = result.scheduledInductions.find(s => s.bayNames.includes('Bay3'));
        if (bay3Aircraft) {
            const blocked = result.eventLog.find(
                e => e.kind === 'DEPARTURE_BLOCKED' && e.inductionId === bay3Aircraft.inductionId,
            );
            expect(blocked).toBeUndefined();
        }
    });

    test('contrast: without traversable flag, Bay2 would block Bay3 departure', () => {
        // Same layout but Bay2 is NOT traversable
        const B2_nonTraversable = mkBay('Bay2', 12, 10, 5, 0, 1, [], nodeB2, false);
        const HANGAR_NT = mkHangar('H_NT', [DOOR], [B1, B2_nonTraversable, B3], 1, 3);
        const ANCHOR_NT = mkManualInduction('M0', SMALL, HANGAR_NT, [B1], DOOR,
            '2024-06-01T04:00', '2024-06-01T05:00');

        const autoDeep = mkAutoInduction('DEEP', CESSNA, 60, { notBefore: '2024-06-01T06:00' });
        const autoMid  = mkAutoInduction('MID', CESSNA, 120, { notBefore: '2024-06-01T06:00' });

        const model = mkModel([HANGAR_NT], [ANCHOR_NT], [autoDeep, autoMid], [path]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        // The Bay3 aircraft should now have departure delay (Bay2 blocks)
        const bay3Aircraft = result.scheduledInductions.find(s => s.bayNames.includes('Bay3'));
        if (bay3Aircraft && bay3Aircraft.maintenanceEnd < result.scheduledInductions.find(s => s.bayNames.includes('Bay2'))!.maintenanceEnd) {
            expect(bay3Aircraft.departureDelay).toBeGreaterThan(0);
        }
    });
});
