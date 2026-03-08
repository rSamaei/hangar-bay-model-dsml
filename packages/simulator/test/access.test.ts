/**
 * Unit tests for the dynamic reachability module.
 *
 * reachableNodes() operates on plain AccessGraph data — no Langium types
 * involved — so graph fixtures are simple inline objects.
 *
 * checkDynamicBayReachability() is tested with lightweight mock objects
 * that structurally satisfy the Langium AST interfaces (TypeScript uses
 * structural typing, so no real Langium runtime is required).
 */
import { describe, expect, test } from 'vitest';
import {
    reachableNodes,
    buildAccessGraph,
    checkCorridorFit,
    checkDynamicBayReachability,
    type AccessGraph,
} from '../src/geometry/access.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkGraph(
    nodeIds: string[],
    edges: Array<{ from: string; to: string; bidirectional?: boolean }>
): AccessGraph {
    const nodes = new Map(nodeIds.map(id => [id, { id }]));
    return {
        nodes,
        edges: edges.map(e => ({ from: e.from, to: e.to, bidirectional: e.bidirectional ?? false }))
    };
}

/** Minimal Langium-like Reference wrapper */
function ref<T>(val: T | undefined) {
    return { ref: val, $refText: (val as any)?.name ?? '' };
}

/** Build a mock AccessNode */
function mkNode(name: string, width?: number) {
    return { name, width, $type: 'AccessNode' };
}

/** Build a mock AccessLink */
function mkLink(fromNode: any, toNode: any, bidirectional = false) {
    return { from: ref(fromNode), to: ref(toNode), bidirectional, $type: 'AccessLink' };
}

/** Build a mock AccessPath */
function mkPath(name: string, nodes: any[], links: any[]) {
    return { name, nodes, links, $type: 'AccessPath' };
}

/** Build a mock HangarDoor */
function mkDoor(name: string, accessNode?: any) {
    return { name, width: 20, height: 6, accessNode: accessNode ? ref(accessNode) : undefined, $type: 'HangarDoor' };
}

/** Build a mock HangarBay */
function mkBay(name: string, accessNode?: any) {
    return { name, width: 15, depth: 12, height: 5, adjacent: [], accessNode: accessNode ? ref(accessNode) : undefined, $type: 'HangarBay' };
}

/** Build a mock Hangar */
function mkHangar(name: string, doors: any[], bays: any[]) {
    return { name, doors, grid: { bays }, $type: 'Hangar' };
}

/** Build a mock Induction */
function mkInduction(
    id: string | undefined,
    hangar: any,
    bays: any[],
    aircraft: string,
    start: string,
    end: string
) {
    return {
        id,
        hangar: ref(hangar),
        bays: bays.map(b => ref(b)),
        aircraft: ref({ name: aircraft }),
        start,
        end,
        door: undefined,
        clearance: undefined,
        $type: 'Induction'
    };
}

// ===========================================================================
// reachableNodes — pure BFS tests
// ===========================================================================

describe('reachableNodes — directed chain', () => {
    // A → B → C (directed, no bidirectional)
    const graph = mkGraph(['A', 'B', 'C'], [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' }
    ]);

    test('all nodes reachable from A with no blocks', () => {
        const r = reachableNodes(['A'], graph);
        expect(r).toEqual(new Set(['A', 'B', 'C']));
    });

    test('only A reachable when B is blocked', () => {
        const r = reachableNodes(['A'], graph, new Set(['B']));
        expect(r).toEqual(new Set(['A']));
    });

    test('no nodes reachable when start is blocked', () => {
        const r = reachableNodes(['A'], graph, new Set(['A']));
        expect(r).toEqual(new Set());
    });

    test('traversal does not go backwards on directed edge', () => {
        // Starting from C in a directed A→B→C — only C is reachable
        const r = reachableNodes(['C'], graph);
        expect(r).toEqual(new Set(['C']));
    });
});

describe('reachableNodes — bidirectional edges', () => {
    // A ↔ B ↔ C
    const graph = mkGraph(['A', 'B', 'C'], [
        { from: 'A', to: 'B', bidirectional: true },
        { from: 'B', to: 'C', bidirectional: true }
    ]);

    test('all nodes reachable from C with no blocks', () => {
        const r = reachableNodes(['C'], graph);
        expect(r).toEqual(new Set(['A', 'B', 'C']));
    });

    test('only C reachable when B is blocked', () => {
        const r = reachableNodes(['C'], graph, new Set(['B']));
        expect(r).toEqual(new Set(['C']));
    });
});

describe('reachableNodes — branching graph', () => {
    //      A
    //     / \
    //    B   C
    //    |
    //    D
    const graph = mkGraph(['A', 'B', 'C', 'D'], [
        { from: 'A', to: 'B', bidirectional: true },
        { from: 'A', to: 'C', bidirectional: true },
        { from: 'B', to: 'D', bidirectional: true }
    ]);

    test('all four nodes reachable from A', () => {
        const r = reachableNodes(['A'], graph);
        expect(r).toEqual(new Set(['A', 'B', 'C', 'D']));
    });

    test('blocking B disconnects D but C still reachable', () => {
        const r = reachableNodes(['A'], graph, new Set(['B']));
        expect(r).toEqual(new Set(['A', 'C']));
    });

    test('multiple start nodes', () => {
        // D is cut off by blocking B, but we start from both A and D
        const r = reachableNodes(['A', 'D'], graph, new Set(['B']));
        expect(r).toEqual(new Set(['A', 'C', 'D']));
    });
});

describe('reachableNodes — disconnected graph', () => {
    // A → B    C → D  (two separate components)
    const graph = mkGraph(['A', 'B', 'C', 'D'], [
        { from: 'A', to: 'B', bidirectional: true },
        { from: 'C', to: 'D', bidirectional: true }
    ]);

    test('only A-B reachable when starting from A', () => {
        const r = reachableNodes(['A'], graph);
        expect(r).toEqual(new Set(['A', 'B']));
    });

    test('all four reachable when starting from both components', () => {
        const r = reachableNodes(['A', 'C'], graph);
        expect(r).toEqual(new Set(['A', 'B', 'C', 'D']));
    });
});

describe('reachableNodes — empty inputs', () => {
    const graph = mkGraph(['A'], []);

    test('empty start returns empty set', () => {
        expect(reachableNodes([], graph)).toEqual(new Set());
    });

    test('unknown start node is silently ignored', () => {
        expect(reachableNodes(['Z'], graph)).toEqual(new Set());
    });
});

// ===========================================================================
// buildAccessGraph
// ===========================================================================

describe('buildAccessGraph', () => {
    test('returns null when no door or bay has an accessNode', () => {
        const hangar = mkHangar('H1', [mkDoor('D1')], [mkBay('B1')]);
        expect(buildAccessGraph(hangar as any, [])).toBeNull();
    });

    test('includes all nodes and edges from the relevant AccessPath', () => {
        const n1 = mkNode('N1');
        const n2 = mkNode('N2');
        const n3 = mkNode('N3');
        const door  = mkDoor('D1', n1);
        const bay   = mkBay('B1', n2);
        const path  = mkPath('P1', [n1, n2, n3], [
            mkLink(n1, n2, true),
            mkLink(n2, n3, true)
        ]);
        const hangar = mkHangar('H1', [door], [bay]);

        const graph = buildAccessGraph(hangar as any, [path as any]);
        expect(graph).not.toBeNull();
        expect([...graph!.nodes.keys()].sort()).toEqual(['N1', 'N2', 'N3']);
        expect(graph!.edges).toHaveLength(2);
    });

    test('annotates nodes with door / bay names', () => {
        const n1 = mkNode('N1');
        const n2 = mkNode('N2');
        const door = mkDoor('MainDoor', n1);
        const bay  = mkBay('Bay1', n2);
        const path = mkPath('P1', [n1, n2], [mkLink(n1, n2, true)]);
        const hangar = mkHangar('H1', [door], [bay]);

        const graph = buildAccessGraph(hangar as any, [path as any]);
        expect(graph!.nodes.get('N1')?.doorName).toBe('MainDoor');
        expect(graph!.nodes.get('N2')?.bayName).toBe('Bay1');
    });

    test('ignores AccessPaths that share no nodes with the hangar', () => {
        const n1 = mkNode('N1');
        const door = mkDoor('D1', n1);
        const pathA = mkPath('PA', [n1], []);
        const pathB = mkPath('PB', [mkNode('X'), mkNode('Y')], [mkLink(mkNode('X'), mkNode('Y'))]);
        const hangar = mkHangar('H1', [door], [mkBay('B1')]);

        const graph = buildAccessGraph(hangar as any, [pathA as any, pathB as any]);
        expect([...graph!.nodes.keys()]).toEqual(['N1']); // PB nodes not included
    });
});

// ===========================================================================
// checkDynamicBayReachability
// ===========================================================================

describe('checkDynamicBayReachability — skipped cases', () => {
    test('skipped when hangar has no access graph', () => {
        const hangar    = mkHangar('H1', [mkDoor('D1')], [mkBay('B1')]);
        const induction = mkInduction(undefined, hangar, [mkBay('B1')], 'A320', '2024-01-01T08:00', '2024-01-01T16:00');
        const result = checkDynamicBayReachability(hangar as any, induction as any, [], []);
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(true);
    });

    test('skipped when own bays have no access nodes', () => {
        const n1    = mkNode('N1');
        const door  = mkDoor('D1', n1);
        const bay   = mkBay('B1');       // no accessNode
        const path  = mkPath('P1', [n1], []);
        const hangar = mkHangar('H1', [door], [bay]);
        const ind    = mkInduction(undefined, hangar, [bay], 'A320', '2024-01-01T08:00', '2024-01-01T16:00');
        const result = checkDynamicBayReachability(hangar as any, ind as any, [], [path as any]);
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(true);
    });
});

describe('checkDynamicBayReachability — no blocking inductions', () => {
    //  Door(D1) → N_door → N_bay1 → N_bay2
    //  Bay1 hooked to N_bay1, Bay2 hooked to N_bay2

    const nDoor  = mkNode('N_door');
    const nBay1  = mkNode('N_bay1');
    const nBay2  = mkNode('N_bay2');
    const door   = mkDoor('MainDoor', nDoor);
    const bay1   = mkBay('Bay1', nBay1);
    const bay2   = mkBay('Bay2', nBay2);
    const path   = mkPath('P1', [nDoor, nBay1, nBay2], [
        mkLink(nDoor, nBay1, true),
        mkLink(nBay1, nBay2, true)
    ]);
    const hangar = mkHangar('H1', [door], [bay1, bay2]);

    test('all bays reachable when no other inductions overlap', () => {
        const ind = mkInduction('IND-001', hangar, [bay1, bay2], 'A320', '2024-01-01T08:00', '2024-01-01T16:00');
        const result = checkDynamicBayReachability(hangar as any, ind as any, [ind as any], [path as any]);
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(false);
        expect(result.evidence.unreachableBays).toHaveLength(0);
    });
});

describe('checkDynamicBayReachability — bay blocking', () => {
    //  D1 →(N_door)→ N_bay1 → N_bay2
    //  To reach Bay2 you must pass through Bay1's node.

    const nDoor  = mkNode('N_door');
    const nBay1  = mkNode('N_bay1');
    const nBay2  = mkNode('N_bay2');
    const door   = mkDoor('MainDoor', nDoor);
    const bay1   = mkBay('Bay1', nBay1);
    const bay2   = mkBay('Bay2', nBay2);
    const path   = mkPath('P1', [nDoor, nBay1, nBay2], [
        mkLink(nDoor, nBay1, true),
        mkLink(nBay1, nBay2, true)
    ]);
    const hangar = mkHangar('H1', [door], [bay1, bay2]);

    test('Bay2 unreachable when Bay1 is occupied by overlapping induction', () => {
        const blocker = mkInduction('IND-BLOCK', hangar, [bay1], 'C130', '2024-01-01T06:00', '2024-01-01T18:00');
        const target  = mkInduction('IND-001',   hangar, [bay2], 'A320', '2024-01-01T08:00', '2024-01-01T16:00');
        const allInds = [blocker, target];

        const result = checkDynamicBayReachability(hangar as any, target as any, allInds as any, [path as any]);

        expect(result.ok).toBe(false);
        expect(result.skipped).toBe(false);
        expect(result.evidence.unreachableBays).toContain('Bay2');
        expect(result.evidence.blockingBays).toHaveLength(1);
        expect(result.evidence.blockingBays[0].bayName).toBe('Bay1');
        expect(result.evidence.blockingBays[0].occupiedByInductionId).toBe('IND-BLOCK');
        expect(result.evidence.blockingBays[0].occupiedByAircraft).toBe('C130');
        expect(result.message).toContain('[SFR_DYNAMIC_REACHABILITY]');
        expect(result.message).toContain('Bay2');
        expect(result.message).toContain('IND-BLOCK');
    });

    test('Bay2 reachable when blocking induction does NOT overlap in time', () => {
        const noOverlap = mkInduction('IND-NOOVERLAP', hangar, [bay1], 'C130', '2024-01-02T08:00', '2024-01-02T16:00');
        const target    = mkInduction('IND-001',       hangar, [bay2], 'A320', '2024-01-01T08:00', '2024-01-01T16:00');

        const result = checkDynamicBayReachability(hangar as any, target as any, [noOverlap as any, target as any], [path as any]);

        expect(result.ok).toBe(true);
        expect(result.evidence.unreachableBays).toHaveLength(0);
    });

    test('non-blocking induction in a different hangar is ignored', () => {
        const otherHangar = mkHangar('H2', [mkDoor('D2', mkNode('X'))], [mkBay('BX', mkNode('Y'))]);
        const other = mkInduction('IND-OTHER', otherHangar, [bay1], 'C130', '2024-01-01T06:00', '2024-01-01T18:00');
        const target = mkInduction('IND-001', hangar, [bay2], 'A320', '2024-01-01T08:00', '2024-01-01T16:00');

        const result = checkDynamicBayReachability(hangar as any, target as any, [other as any, target as any], [path as any]);

        expect(result.ok).toBe(true); // other induction is in a different hangar
    });

    test('own bays are never treated as blocked', () => {
        // The target induction occupies BOTH Bay1 and Bay2.
        // Bay1's node must not be treated as blocked just because the induction uses it.
        const target = mkInduction('IND-001', hangar, [bay1, bay2], 'A320', '2024-01-01T08:00', '2024-01-01T16:00');
        const result = checkDynamicBayReachability(hangar as any, target as any, [target as any], [path as any]);

        expect(result.ok).toBe(true);
        expect(result.evidence.unreachableBays).toHaveLength(0);
    });
});

describe('checkDynamicBayReachability — message format', () => {
    const nDoor = mkNode('N_door');
    const nBay1 = mkNode('N_bay1');
    const nBay2 = mkNode('N_bay2');
    const door  = mkDoor('MainDoor', nDoor);
    const bay1  = mkBay('Bay1', nBay1);
    const bay2  = mkBay('Bay2', nBay2);
    const path  = mkPath('P1', [nDoor, nBay1, nBay2], [mkLink(nDoor, nBay1, true), mkLink(nBay1, nBay2, true)]);
    const hangar = mkHangar('H1', [door], [bay1, bay2]);

    test('failure message includes induction id, bay names and door name', () => {
        const blocker = mkInduction('BLK-42', hangar, [bay1], 'C130', '2024-01-01T00:00', '2024-01-02T00:00');
        const target  = mkInduction('TGT-99', hangar, [bay2], 'A320', '2024-01-01T08:00', '2024-01-01T16:00');

        const result = checkDynamicBayReachability(hangar as any, target as any, [blocker as any, target as any], [path as any]);

        expect(result.message).toContain('Bay2');
        expect(result.message).toContain('MainDoor');
        expect(result.message).toContain('BLK-42');
    });
});

// ===========================================================================
// checkCorridorFit — corridor width constraint
// Layout: Door(MainDoor) → N_door → N_corridor(width?) → N_bay → Bay1
// ===========================================================================

describe('checkCorridorFit — corridor width constraint', () => {
    function makeCorridorLayout(corridorWidth?: number) {
        const nDoor      = mkNode('N_door');
        const nCorridor  = mkNode('N_corridor', corridorWidth);
        const nBay       = mkNode('N_bay');
        const door       = mkDoor('MainDoor', nDoor);
        const bay1       = mkBay('Bay1', nBay);
        const path       = mkPath('P1',
            [nDoor, nCorridor, nBay],
            [mkLink(nDoor, nCorridor, true), mkLink(nCorridor, nBay, true)]
        );
        const hangar     = mkHangar('H1', [door], [bay1]);
        const induction  = mkInduction(undefined, hangar, [bay1], 'TestAC', '2024-01-01T08:00', '2024-01-01T16:00');
        return { hangar, induction, path, bay1 };
    }

    test('aircraft fits through corridor — no violations', () => {
        // wingspan=8m, corridor width=10m → fits
        const { hangar, induction, path } = makeCorridorLayout(10);
        const result = checkCorridorFit(hangar as any, induction as any, [path as any], 8);
        expect(result.ok).toBe(true);
        expect(result.skipped).toBe(false);
        expect(result.violations).toHaveLength(0);
    });

    test('aircraft too wide for corridor — violation fires with corridor name and bay name', () => {
        // wingspan=12m, corridor width=8m → blocked
        const { hangar, induction, path } = makeCorridorLayout(8);
        const result = checkCorridorFit(hangar as any, induction as any, [path as any], 12);
        expect(result.ok).toBe(false);
        expect(result.skipped).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].nodeName).toBe('N_corridor');
        expect(result.violations[0].nodeWidth).toBe(8);
        expect(result.violations[0].wingspanEff).toBe(12);
        expect(result.violations[0].bayName).toBe('Bay1');
    });

    test('corridor with no width defined — treated as unconstrained, no violations', () => {
        // corridor has no width → any wingspan passes
        const { hangar, induction, path } = makeCorridorLayout(undefined);
        const result = checkCorridorFit(hangar as any, induction as any, [path as any], 50);
        expect(result.ok).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    test('same hangar: small aircraft fits, large aircraft does not', () => {
        // corridor width=10m
        const { hangar, induction, path } = makeCorridorLayout(10);
        const smallResult = checkCorridorFit(hangar as any, induction as any, [path as any], 8);  // 8 < 10 → fits
        const largeResult = checkCorridorFit(hangar as any, induction as any, [path as any], 15); // 15 > 10 → blocked
        expect(smallResult.ok).toBe(true);
        expect(largeResult.ok).toBe(false);
        expect(largeResult.violations[0].nodeName).toBe('N_corridor');
    });
});
