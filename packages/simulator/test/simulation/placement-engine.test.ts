/**
 * Unit tests for PlacementEngine.
 *
 * Uses minimal structural mocks — no Langium runtime required.
 */
import { describe, expect, test } from 'vitest';
import { PlacementEngine } from '../../src/simulation/placement-engine.js';
import { DEFAULT_SIMULATION_CONFIG, type SimulationState, type OccupiedBayInfo } from '../../src/simulation/types.js';

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
    return { name, wingspan, length, height, tailHeight: tailHeight ?? height, $type: 'AircraftType' as const };
}

function mkDoor(name: string, width = 15, height = 5, accessNode?: any) {
    return { name, width, height, accessNode: accessNode ? ref(accessNode) : undefined, $type: 'HangarDoor' as const };
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

function mkModel(hangars: any[], accessPaths: any[] = []) {
    return {
        name: 'TestAirfield',
        hangars,
        inductions: [],
        autoInductions: [],
        accessPaths,
        $type: 'Model' as const,
    };
}

function emptyState(currentTime = 1000): SimulationState {
    return {
        currentTime,
        occupiedBays: new Map(),
        waitingQueue: [],
        pendingDepartures: [],
        activeInductions: [],
        completedInductions: [],
        fixedOccupancy: [],
        eventLog: [],
    };
}

function occupyBay(
    state: SimulationState,
    hangarName: string,
    bayName: string,
    inductionId: string,
    startTime: number,
    endTime: number,
): void {
    const info: OccupiedBayInfo = {
        inductionId,
        aircraftName: 'SomeAircraft',
        hangarName,
        bayNames: [bayName],
        doorName: 'D1',
        startTime,
        endTime,
        fixed: false,
    };
    state.occupiedBays.set(`${hangarName}::${bayName}`, info);
}

// ---------------------------------------------------------------------------
// Standard fixtures
// ---------------------------------------------------------------------------

const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);
const WIDE_JET = mkAircraft('WideJet', 30, 20, 5, 5);

const DOOR1 = mkDoor('Door1', 15, 5);
const BAY1 = mkBay('Bay1', 12, 10, 5, 0, 0);
const BAY2 = mkBay('Bay2', 12, 10, 5, 0, 1);
const SIMPLE_HANGAR = mkHangar('Alpha', [DOOR1], [BAY1, BAY2], 1, 2);

const config = DEFAULT_SIMULATION_CONFIG;
const HOUR_MS = 60 * 60 * 1000;

// ===========================================================================
// attemptPlacement — basic scenarios
// ===========================================================================

describe('PlacementEngine.attemptPlacement — empty hangar', () => {
    test('places aircraft when hangar is empty', () => {
        const model = mkModel([SIMPLE_HANGAR]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        const result = engine.attemptPlacement(
            'IND1', CESSNA as any, undefined, HOUR_MS,
            undefined, undefined, state, config,
        );

        expect(result.placed).toBe(true);
        if (result.placed) {
            expect(result.hangarName).toBe('Alpha');
            expect(result.doorName).toBe('Door1');
            expect(result.bayNames.length).toBeGreaterThanOrEqual(1);
            expect(result.startTime).toBe(1000);
            expect(result.endTime).toBe(1000 + HOUR_MS);
        }
    });

    test('returns failure when aircraft too wide for door', () => {
        const model = mkModel([SIMPLE_HANGAR]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        const result = engine.attemptPlacement(
            'IND2', WIDE_JET as any, undefined, HOUR_MS,
            undefined, undefined, state, config,
        );

        expect(result.placed).toBe(false);
        if (!result.placed) {
            expect(result.rejections.length).toBeGreaterThan(0);
            expect(result.rejections[0].ruleId).toBe('SFR11_DOOR_FIT');
        }
    });
});

describe('PlacementEngine.attemptPlacement — all bays occupied', () => {
    test('returns failure when all bays have time conflicts', () => {
        const model = mkModel([SIMPLE_HANGAR]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        // Occupy all bays
        occupyBay(state, 'Alpha', 'Bay1', 'existing1', 0, 2000 + HOUR_MS);
        occupyBay(state, 'Alpha', 'Bay2', 'existing2', 0, 2000 + HOUR_MS);

        const result = engine.attemptPlacement(
            'IND3', CESSNA as any, undefined, HOUR_MS,
            undefined, undefined, state, config,
        );

        expect(result.placed).toBe(false);
        if (!result.placed) {
            expect(result.rejections.some(r => r.ruleId === 'SFR23_TIME_OVERLAP')).toBe(true);
        }
    });
});

describe('PlacementEngine.attemptPlacement — time conflict filtering', () => {
    test('skips occupied bay set but uses an available one', () => {
        const model = mkModel([SIMPLE_HANGAR]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        // Occupy Bay1 but leave Bay2 free
        occupyBay(state, 'Alpha', 'Bay1', 'existing1', 0, 2000 + HOUR_MS);

        const result = engine.attemptPlacement(
            'IND4', CESSNA as any, undefined, HOUR_MS,
            undefined, undefined, state, config,
        );

        expect(result.placed).toBe(true);
        if (result.placed) {
            expect(result.bayNames).toContain('Bay2');
            expect(result.bayNames).not.toContain('Bay1');
        }
    });
});

// ===========================================================================
// attemptPlacement — access path blocking
// ===========================================================================

describe('PlacementEngine.attemptPlacement — access path reachability', () => {
    // Hangar layout with access path: Door → NodeD → Corridor → NodeB1 → NodeB2
    // Bay1 hooks to NodeB1, Bay2 hooks to NodeB2
    // If Bay1 is occupied (blocking NodeB1), Bay2 becomes unreachable

    const nodeD = mkNode('NodeD');
    const nodeCorridor = mkNode('Corridor');
    const nodeB1 = mkNode('NodeB1');
    const nodeB2 = mkNode('NodeB2');
    const path = mkPath('P1',
        [nodeD, nodeCorridor, nodeB1, nodeB2],
        [
            mkLink(nodeD, nodeCorridor, true),
            mkLink(nodeCorridor, nodeB1, true),
            mkLink(nodeB1, nodeB2, true),
        ],
    );

    const doorWithAccess = mkDoor('Door1', 15, 5, nodeD);
    const bay1WithAccess = mkBay('Bay1', 12, 10, 5, 0, 0, [], nodeB1);
    const bay2WithAccess = mkBay('Bay2', 12, 10, 5, 0, 1, [], nodeB2);
    const hangarWithAccess = mkHangar('AccessHangar', [doorWithAccess], [bay1WithAccess, bay2WithAccess], 1, 2);

    test('places in Bay2 when Bay1 blocks the path to Bay2', () => {
        const model = mkModel([hangarWithAccess], [path]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        // Occupy Bay1 — this blocks NodeB1, making Bay2 unreachable
        occupyBay(state, 'AccessHangar', 'Bay1', 'blocker', 0, 2000 + HOUR_MS);

        const result = engine.attemptPlacement(
            'IND5', CESSNA as any, undefined, HOUR_MS,
            undefined, undefined, state, config,
        );

        // Bay1 has time conflict. Bay2 is structurally reachable from door but
        // the access path goes Door→Corridor→NodeB1→NodeB2, and NodeB1 is blocked.
        // The bay-set [Bay2] should be rejected due to SFR21_DYNAMIC_REACHABILITY.
        // The bay-set [Bay1] should be rejected due to SFR23_TIME_OVERLAP.
        // Overall: placement fails.
        expect(result.placed).toBe(false);
        if (!result.placed) {
            const ruleIds = result.rejections.map(r => r.ruleId);
            expect(ruleIds).toContain('SFR23_TIME_OVERLAP');
            expect(ruleIds).toContain('SFR21_DYNAMIC_REACHABILITY');
        }
    });

    test('places successfully when no access path blocking', () => {
        const model = mkModel([hangarWithAccess], [path]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        const result = engine.attemptPlacement(
            'IND6', CESSNA as any, undefined, HOUR_MS,
            undefined, undefined, state, config,
        );

        expect(result.placed).toBe(true);
    });
});

// ===========================================================================
// attemptPlacement — preferred hangar fallback
// ===========================================================================

describe('PlacementEngine.attemptPlacement — preferred hangar', () => {
    const DOOR_B = mkDoor('DoorB', 15, 5);
    const BAY_B1 = mkBay('BayB1', 12, 10, 5, 0, 0);
    const BETA_HANGAR = mkHangar('Beta', [DOOR_B], [BAY_B1], 1, 1);

    test('uses preferred hangar when available', () => {
        const model = mkModel([SIMPLE_HANGAR, BETA_HANGAR]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        const result = engine.attemptPlacement(
            'IND7', CESSNA as any, undefined, HOUR_MS,
            BETA_HANGAR as any, undefined, state, config,
        );

        expect(result.placed).toBe(true);
        if (result.placed) {
            expect(result.hangarName).toBe('Beta');
        }
    });

    test('falls back to other hangar when preferred is full', () => {
        const model = mkModel([SIMPLE_HANGAR, BETA_HANGAR]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        // Fill Beta's only bay
        occupyBay(state, 'Beta', 'BayB1', 'existing', 0, 2000 + HOUR_MS);

        const result = engine.attemptPlacement(
            'IND8', CESSNA as any, undefined, HOUR_MS,
            BETA_HANGAR as any, undefined, state, config,
        );

        expect(result.placed).toBe(true);
        if (result.placed) {
            expect(result.hangarName).toBe('Alpha');
        }
    });
});

// ===========================================================================
// checkDeparturePath
// ===========================================================================

describe('PlacementEngine.checkDeparturePath — clear path', () => {
    test('departure clear when no other aircraft blocking', () => {
        const nodeD = mkNode('NodeD');
        const nodeB1 = mkNode('NodeB1');
        const path = mkPath('P1', [nodeD, nodeB1], [mkLink(nodeD, nodeB1, true)]);
        const door = mkDoor('Door1', 15, 5, nodeD);
        const bay1 = mkBay('Bay1', 12, 10, 5, 0, 0, [], nodeB1);
        const hangar = mkHangar('H', [door], [bay1], 1, 1);
        const model = mkModel([hangar], [path]) as any;

        const engine = new PlacementEngine(model);
        const state = emptyState();

        // Bay1 is occupied by the departing aircraft itself
        occupyBay(state, 'H', 'Bay1', 'IND_SELF', 0, 1000);

        const result = engine.checkDeparturePath('IND_SELF', 'H', ['Bay1'], state);

        expect(result.clear).toBe(true);
    });
});

describe('PlacementEngine.checkDeparturePath — blocked path', () => {
    test('departure blocked when neighbour occupies corridor bay', () => {
        // Layout: Door → NodeD → NodeB1 → NodeB2
        // Aircraft in Bay2 wants to depart, but Bay1 (NodeB1) is occupied by another
        const nodeD = mkNode('NodeD');
        const nodeB1 = mkNode('NodeB1');
        const nodeB2 = mkNode('NodeB2');
        const path = mkPath('P1',
            [nodeD, nodeB1, nodeB2],
            [mkLink(nodeD, nodeB1, true), mkLink(nodeB1, nodeB2, true)],
        );
        const door = mkDoor('Door1', 15, 5, nodeD);
        const bay1 = mkBay('Bay1', 12, 10, 5, 0, 0, [], nodeB1);
        const bay2 = mkBay('Bay2', 12, 10, 5, 0, 1, [], nodeB2);
        const hangar = mkHangar('H', [door], [bay1, bay2], 1, 2);
        const model = mkModel([hangar], [path]) as any;

        const engine = new PlacementEngine(model);
        const state = emptyState();

        // Bay1 occupied by another aircraft
        occupyBay(state, 'H', 'Bay1', 'BLOCKER', 0, 5000);
        // Bay2 occupied by the departing aircraft
        occupyBay(state, 'H', 'Bay2', 'DEPARTING', 0, 1000);

        const result = engine.checkDeparturePath('DEPARTING', 'H', ['Bay2'], state);

        expect(result.clear).toBe(false);
        if (!result.clear) {
            expect(result.blockingInductionIds).toContain('BLOCKER');
        }
    });
});

describe('PlacementEngine.checkDeparturePath — no access graph', () => {
    test('departure always allowed when no access graph modelled', () => {
        // Hangar without any access nodes
        const model = mkModel([SIMPLE_HANGAR]) as any;
        const engine = new PlacementEngine(model);
        const state = emptyState();

        occupyBay(state, 'Alpha', 'Bay1', 'DEPARTING', 0, 1000);

        const result = engine.checkDeparturePath('DEPARTING', 'Alpha', ['Bay1'], state);
        expect(result.clear).toBe(true);
    });
});
