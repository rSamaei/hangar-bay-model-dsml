/**
 * Unit tests for graph-queries.ts covering branches not exercised by
 * placement-engine integration tests:
 *
 *   - Lines 20–21: findBayNodeId returns undefined (bay not found in graph)
 *   - Line  28:    getDoorNodeIds — door with no accessNode is skipped;
 *                  door accessNode not in graph is skipped
 *   - Line  77:    checkCorridorFitDirect filter — bay reachable with constraint
 *                  (not blocked), false branch of the && predicate
 *   - Lines 96,99: computeBlockedNodes continues — different-hangar bay and
 *                  excluded bay both skip via continue
 *   - Line  124:   identifyBlockers continues — different-hangar bay skips
 */
import { describe, expect, test } from 'vitest';
import {
    findBayNodeId,
    getBayNodeIds,
    getDoorNodeIds,
    findExitDoor,
    checkCorridorFitDirect,
    computeBlockedNodes,
    identifyBlockers,
} from '../../src/simulation/graph-queries.js';
import type { AccessGraph } from '../../src/geometry/access.js';
import type { SimulationState } from '../../src/simulation/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkGraph(entries: Array<[string, { bayName?: string; doorName?: string; width?: number; traversable?: boolean }]>): AccessGraph {
    const nodes = new Map(
        entries.map(([id, props]) => [id, { id, ...props }])
    );
    return { nodes, edges: [] };
}

function emptyState(overrides: Partial<SimulationState> = {}): SimulationState {
    return {
        currentTime: 1000,
        occupiedBays: new Map(),
        waitingQueue: [],
        pendingDepartures: [],
        activeInductions: [],
        completedInductions: [],
        fixedOccupancy: [],
        eventLog: [],
        ...overrides,
    };
}

function mkOccupied(hangarName: string, bayName: string, opts: { start?: number; end?: number; inductionId?: string } = {}) {
    const key = `${hangarName}::${bayName}`;
    return [key, {
        inductionId: opts.inductionId ?? 'ind_1',
        aircraftName: 'Cessna',
        hangarName,
        bayNames: [bayName],
        doorName: 'D1',
        startTime: opts.start ?? 500,
        endTime: opts.end ?? 2000,
        fixed: false,
    }] as const;
}

// ---------------------------------------------------------------------------
// findBayNodeId — returns undefined when bay not in graph (lines 20–21)
// ---------------------------------------------------------------------------

describe('findBayNodeId — bay not found (lines 20–21)', () => {
    test('empty graph returns undefined', () => {
        const graph = mkGraph([]);
        expect(findBayNodeId(graph, 'Bay1')).toBeUndefined();
    });

    test('graph with other bays returns undefined for missing bay', () => {
        const graph = mkGraph([['Node1', { bayName: 'Bay1' }]]);
        expect(findBayNodeId(graph, 'Bay2')).toBeUndefined();
    });

    test('getBayNodeIds skips bays not in the graph', () => {
        const graph = mkGraph([['Node1', { bayName: 'Bay1' }]]);
        const ids = getBayNodeIds(graph, ['Bay1', 'Bay2']);
        expect(ids).toEqual(['Node1']);
    });
});

// ---------------------------------------------------------------------------
// getDoorNodeIds — branch coverage (line 28)
// ---------------------------------------------------------------------------

describe('getDoorNodeIds — door/node filtering', () => {
    const graph = mkGraph([['NodeA', { doorName: 'DoorA' }]]);

    test('door with no accessNode is skipped', () => {
        const hangar = { doors: [{ name: 'DoorNoAccess', accessNode: undefined }] } as any;
        expect(getDoorNodeIds(graph, hangar)).toHaveLength(0);
    });

    test('door accessNode not in graph is skipped', () => {
        const hangar = {
            doors: [{ name: 'D1', accessNode: { ref: { name: 'NodeNotInGraph' } } }],
        } as any;
        expect(getDoorNodeIds(graph, hangar)).toHaveLength(0);
    });

    test('door with accessNode in graph is included', () => {
        const hangar = {
            doors: [{ name: 'DoorA', accessNode: { ref: { name: 'NodeA' } } }],
        } as any;
        expect(getDoorNodeIds(graph, hangar)).toEqual(['NodeA']);
    });
});

// ---------------------------------------------------------------------------
// findExitDoor — fallback return branches (lines 57–58)
// ---------------------------------------------------------------------------

describe('findExitDoor — fallback branches (lines 57–58)', () => {
    test('no door accessNode in reachable set → falls back to first door name', () => {
        const graph = mkGraph([['NodeA', { doorName: 'DoorA' }]]);
        const hangar = {
            doors: [
                { name: 'DoorA', accessNode: { ref: { name: 'NodeA' } } },
            ],
        } as any;
        const reachable = new Set<string>(); // NodeA is NOT in reachable
        // Loop runs, but `reachable.has('NodeA')` is false → loop exits without return
        // → fallback `return hangar.doors[0]?.name ?? ''` fires → 'DoorA'
        expect(findExitDoor(graph, hangar, reachable)).toBe('DoorA');
    });

    test('empty doors array → doors[0]?.name ?? "" fires with "" result', () => {
        const graph = mkGraph([]);
        const hangar = { doors: [] } as any;
        // doors[0] is undefined → ?.name = undefined → ?? '' → ''
        expect(findExitDoor(graph, hangar, new Set())).toBe('');
    });
});

// ---------------------------------------------------------------------------
// checkCorridorFitDirect — filter branches (line 77)
// ---------------------------------------------------------------------------

describe('checkCorridorFitDirect — filter logic', () => {
    test('bay reachable with constraint — not returned as blocked (false branch of &&)', () => {
        // Graph: door → bay (no width constraint) — bay reachable under both BFS runs
        const graph = mkGraph([
            ['DoorNode', { doorName: 'MainDoor' }],
            ['BayNode', { bayName: 'Bay1' }],
        ]);
        graph.edges.push({ from: 'DoorNode', to: 'BayNode', bidirectional: true });

        // Bay is reachable even with wingspan constraint (no width limit on corridor nodes)
        const blocked = checkCorridorFitDirect(graph, ['DoorNode'], ['BayNode'], 999);
        // Bay reachable with constraint → !reachableWithConstraint.has(id) is FALSE → not blocked
        expect(blocked).toHaveLength(0);
    });

    test('bay blocked by narrow corridor — returned (true branch of && predicate on line 77)', () => {
        // Graph: door → corridor(width=5) → bay
        // With wingspanEff=10: corridor(5) < 10 → bay unreachable with constraint
        // Without constraint: bay reachable
        const graph: AccessGraph = {
            nodes: new Map([
                ['DoorNode', { id: 'DoorNode', doorName: 'MainDoor' }],
                ['CorridorNode', { id: 'CorridorNode', width: 5 }],
                ['BayNode', { id: 'BayNode', bayName: 'Bay1' }],
            ]),
            edges: [
                { from: 'DoorNode', to: 'CorridorNode', bidirectional: true },
                { from: 'CorridorNode', to: 'BayNode', bidirectional: true },
            ],
        };

        const blocked = checkCorridorFitDirect(graph, ['DoorNode'], ['BayNode'], 10);
        // BayNode: NOT in reachableWithConstraint AND IS in reachableNoConstraint → blocked
        // Both branches of && are true → true branch of line 77 filter
        expect(blocked).toContain('BayNode');
    });
});

// ---------------------------------------------------------------------------
// computeBlockedNodes — continue branches (lines 96, 99)
// ---------------------------------------------------------------------------

describe('computeBlockedNodes — continue branches', () => {
    const graph = mkGraph([['NodeBay1', { bayName: 'Bay1' }]]);

    test('bay in different hangar is skipped (line 96)', () => {
        const state = emptyState({
            occupiedBays: new Map([
                mkOccupied('Beta', 'Bay1'),   // different hangar → skip line 96
                mkOccupied('Alpha', 'Bay1'),  // same hangar → processed
            ]),
        });

        const blocked = computeBlockedNodes(graph, state, 'Alpha', new Set());
        // Alpha::Bay1 is processed and NodeBay1 is not traversable → blocked
        expect(blocked.has('NodeBay1')).toBe(true);
    });

    test('bay in excluded set is skipped (line 99)', () => {
        const state = emptyState({
            occupiedBays: new Map([
                mkOccupied('Alpha', 'Bay1'),  // same hangar but in exclude set → skip line 99
            ]),
        });

        const excluded = new Set(['Bay1']);
        const blocked = computeBlockedNodes(graph, state, 'Alpha', excluded);
        expect(blocked.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// identifyBlockers — different-hangar continue (line 124)
// ---------------------------------------------------------------------------

describe('identifyBlockers — continue branches (line 124)', () => {
    const graph = mkGraph([['NodeBay1', { bayName: 'Bay1' }]]);

    test('bay in different hangar is skipped (line 124)', () => {
        const state = emptyState({
            occupiedBays: new Map([
                mkOccupied('Beta', 'Bay1', { inductionId: 'skip-this' }), // different hangar
                mkOccupied('Alpha', 'Bay1', { inductionId: 'include-this' }),
            ]),
        });

        const blocked = new Set(['NodeBay1']);
        const blockers = identifyBlockers(graph, state, 'Alpha', blocked, []);
        expect(blockers).toContain('include-this');
        expect(blockers).not.toContain('skip-this');
    });
});
