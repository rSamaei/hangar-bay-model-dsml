/**
 * Unit tests for access-graph.ts (L8) — branches not covered by the existing
 * access-graph-traversable.test.ts or integration-level reachability tests.
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses plain structural mocks — no Langium runtime.
 *
 * Coverage targets:
 *  - buildAccessGraph: null path, doorName/bayName annotation, width copy, link edge flags
 *  - reachableNodes: wingspanEff corridor-width check (isTooNarrow)
 *  - checkDynamicBayReachability: all three skip paths, ok=true, ok=false with blocker
 *  - checkCorridorFit: all three skip paths, no-violation, violation pairs
 */
import { describe, expect, test } from 'vitest';
import {
    buildAccessGraph,
    reachableNodes,
    checkDynamicBayReachability,
    checkCorridorFit,
    type AccessGraph,
    type AccessGraphNode,
    type AccessGraphEdge,
} from '../src/access-graph.js';

// ============================================================================
// Shared helpers
// ============================================================================

function an(name: string, width?: number) { return { name, width }; }

function mkDoor(name: string, accessNode?: ReturnType<typeof an>) {
    return { name, accessNode: accessNode ? { ref: accessNode } : undefined };
}

function mkBay(name: string, accessNode?: ReturnType<typeof an>, traversable = false) {
    return { name, traversable, accessNode: accessNode ? { ref: accessNode } : undefined };
}

function mkHangar(doors: any[], bays: any[]) {
    return { name: 'H', doors, grid: { bays, rows: undefined, cols: undefined } };
}

function mkLink(fromNode: any, toNode: any, bidirectional = false) {
    return { from: { ref: fromNode }, to: { ref: toNode }, bidirectional };
}

function mkPath(nodes: any[], links: any[]) { return { name: 'AP', nodes, links }; }

/** Build an AccessGraph directly from plain data (for reachableNodes tests). */
function mkGraph(
    nodeList: Array<{ id: string; bayName?: string; width?: number; traversable?: boolean }>,
    edgeList: Array<{ from: string; to: string; bidirectional?: boolean }>
): AccessGraph {
    const nodes = new Map<string, AccessGraphNode>();
    for (const n of nodeList) nodes.set(n.id, { id: n.id, bayName: n.bayName, width: n.width, traversable: n.traversable });
    const edges: AccessGraphEdge[] = edgeList.map(e => ({ from: e.from, to: e.to, bidirectional: e.bidirectional ?? false }));
    return { nodes, edges };
}

/** Build an Induction structural mock for checkDynamicBayReachability / checkCorridorFit. */
function mkInduction(opts: {
    id?: string;
    bays?: any[];
    start?: string;
    end?: string;
    hangar?: any;
    aircraft?: { name: string; wingspan: number; clearance?: any };
    clearance?: any;
}) {
    return {
        id:       opts.id,
        bays:     (opts.bays ?? []).map((b: any) => ({ ref: b })),
        start:    opts.start ?? '2025-01-01T08:00',
        end:      opts.end   ?? '2025-01-01T16:00',
        hangar:   opts.hangar ? { ref: opts.hangar } : undefined,
        aircraft: opts.aircraft ? { ref: opts.aircraft } : undefined,
        clearance: opts.clearance ? { ref: opts.clearance } : undefined,
    };
}

// ============================================================================
// buildAccessGraph
// ============================================================================

describe('buildAccessGraph', () => {
    test('returns null when no door or bay has an accessNode', () => {
        const hangar = mkHangar([mkDoor('D1')], [mkBay('Bay1')]);  // no accessNode refs
        const result = buildAccessGraph(hangar as any, []);
        expect(result).toBeNull();
    });

    test('includes path node that is not directly hooked to this hangar (full path pull-in)', () => {
        const nodeD = an('NodeD');
        const nodeC = an('NodeCorridor');
        const nodeB = an('NodeB');
        const door  = mkDoor('D1', nodeD);
        const bay   = mkBay('Bay1', nodeB);
        const hangar = mkHangar([door], [bay]);
        const path = mkPath([nodeD, nodeC, nodeB], [
            mkLink(nodeD, nodeC), mkLink(nodeC, nodeB),
        ]);
        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph).not.toBeNull();
        expect(graph!.nodes.has('NodeCorridor')).toBe(true);  // intermediate node pulled in
    });

    test('annotates graph node with doorName from hangar door', () => {
        const nodeD = an('NodeD');
        const door  = mkDoor('D1', nodeD);
        const hangar = mkHangar([door], []);
        const path = mkPath([nodeD], []);
        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph!.nodes.get('NodeD')?.doorName).toBe('D1');
    });

    test('annotates graph node with bayName from hangar bay', () => {
        const nodeD = an('NodeD');
        const nodeB = an('NodeB');
        const door  = mkDoor('D1', nodeD);
        const bay   = mkBay('Bay1', nodeB);
        const hangar = mkHangar([door], [bay]);
        const path = mkPath([nodeD, nodeB], [mkLink(nodeD, nodeB)]);
        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph!.nodes.get('NodeB')?.bayName).toBe('Bay1');
    });

    test('copies AccessNode.width onto the graph node', () => {
        const nodeD = an('NodeD');
        const nodeCorridor = an('NodeC', 8.5);  // width = 8.5 m
        const door = mkDoor('D1', nodeD);
        const hangar = mkHangar([door], []);
        const path = mkPath([nodeD, nodeCorridor], [mkLink(nodeD, nodeCorridor)]);
        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph!.nodes.get('NodeC')?.width).toBe(8.5);
    });

    test('link with missing from ref is skipped — edge not added', () => {
        const nodeD = an('NodeD');
        const door = mkDoor('D1', nodeD);
        const hangar = mkHangar([door], []);
        const badLink = { from: { ref: undefined }, to: { ref: nodeD }, bidirectional: false };
        const path = mkPath([nodeD], [badLink]);
        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph!.edges.length).toBe(0);  // skipped, no crash
    });

    test('bidirectional link produces edge with bidirectional=true', () => {
        const nodeD = an('NodeD');
        const nodeB = an('NodeB');
        const door  = mkDoor('D1', nodeD);
        const hangar = mkHangar([door], []);
        const path = mkPath([nodeD, nodeB], [mkLink(nodeD, nodeB, true)]);
        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph!.edges[0].bidirectional).toBe(true);
    });

    test('unidirectional link produces edge with bidirectional=false', () => {
        const nodeD = an('NodeD');
        const nodeB = an('NodeB');
        const door  = mkDoor('D1', nodeD);
        const hangar = mkHangar([door], []);
        const path = mkPath([nodeD, nodeB], [mkLink(nodeD, nodeB, false)]);
        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph!.edges[0].bidirectional).toBe(false);
    });
});

// ============================================================================
// reachableNodes — wingspanEff corridor-width check (isTooNarrow)
// ============================================================================

describe('reachableNodes — wingspanEff corridor check', () => {
    test('narrow non-bay corridor (width < wingspanEff) acts as wall — bay beyond is unreachable', () => {
        const graph = mkGraph(
            [
                { id: 'Door' },
                { id: 'Corridor', width: 8 },        // NOT a bay (no bayName)
                { id: 'Bay', bayName: 'Bay1' },
            ],
            [
                { from: 'Door',     to: 'Corridor', bidirectional: true },
                { from: 'Corridor', to: 'Bay',      bidirectional: true },
            ]
        );
        const reachable = reachableNodes(['Door'], graph, new Set(), 11);  // wingspan 11 > 8
        expect(reachable.has('Corridor')).toBe(false);  // too narrow → impassable
        expect(reachable.has('Bay')).toBe(false);
    });

    test('corridor with width >= wingspanEff is passable', () => {
        const graph = mkGraph(
            [
                { id: 'Door' },
                { id: 'Corridor', width: 12 },       // 12 >= 11 → passable
                { id: 'Bay', bayName: 'Bay1' },
            ],
            [
                { from: 'Door',     to: 'Corridor', bidirectional: true },
                { from: 'Corridor', to: 'Bay',      bidirectional: true },
            ]
        );
        const reachable = reachableNodes(['Door'], graph, new Set(), 11);
        expect(reachable.has('Bay')).toBe(true);
    });

    test('corridor node without width is unconstrained — always passable', () => {
        const graph = mkGraph(
            [
                { id: 'Door' },
                { id: 'Corridor' },   // width=undefined → unconstrained
                { id: 'Bay', bayName: 'Bay1' },
            ],
            [
                { from: 'Door',     to: 'Corridor', bidirectional: true },
                { from: 'Corridor', to: 'Bay',      bidirectional: true },
            ]
        );
        const reachable = reachableNodes(['Door'], graph, new Set(), 11);
        expect(reachable.has('Bay')).toBe(true);
    });

    test('bay node with width < wingspanEff is NOT blocked by corridor check (bayName is defined)', () => {
        const graph = mkGraph(
            [
                { id: 'Door' },
                { id: 'Bay', bayName: 'Bay1', width: 5 },  // width=5 but it is a bay
            ],
            [{ from: 'Door', to: 'Bay', bidirectional: true }]
        );
        const reachable = reachableNodes(['Door'], graph, new Set(), 11);
        expect(reachable.has('Bay')).toBe(true);  // bays never blocked by width
    });

    test('start node that is too narrow is itself excluded from reachable set', () => {
        const graph = mkGraph(
            [
                { id: 'NarrowStart', width: 4 },
                { id: 'Bay', bayName: 'Bay1' },
            ],
            [{ from: 'NarrowStart', to: 'Bay', bidirectional: false }]
        );
        const reachable = reachableNodes(['NarrowStart'], graph, new Set(), 11);
        expect(reachable.has('NarrowStart')).toBe(false);
        expect(reachable.has('Bay')).toBe(false);
    });

    test('no wingspanEff → isTooNarrow always false, narrow corridor is passable', () => {
        const graph = mkGraph(
            [
                { id: 'Door' },
                { id: 'Corridor', width: 1 },
                { id: 'Bay', bayName: 'Bay1' },
            ],
            [
                { from: 'Door',     to: 'Corridor', bidirectional: true },
                { from: 'Corridor', to: 'Bay',      bidirectional: true },
            ]
        );
        const reachable = reachableNodes(['Door'], graph);  // no wingspanEff
        expect(reachable.has('Bay')).toBe(true);
    });
});

// ============================================================================
// checkDynamicBayReachability
// ============================================================================

describe('checkDynamicBayReachability', () => {
    // Shared minimal topology: D1 --bidir-- Bay1 --bidir-- Bay2
    function mkMinimalHangar() {
        const nodeD  = an('NodeD');
        const nodeB1 = an('NodeB1');
        const nodeB2 = an('NodeB2');
        const door   = mkDoor('D1', nodeD);
        const bay1   = mkBay('Bay1', nodeB1);
        const bay2   = mkBay('Bay2', nodeB2);
        const hangar = mkHangar([door], [bay1, bay2]);
        const path   = mkPath([nodeD, nodeB1, nodeB2], [
            mkLink(nodeD, nodeB1, true),
            mkLink(nodeB1, nodeB2, true),
        ]);
        return { hangar, bay1, bay2, path, nodeD, nodeB1, nodeB2 };
    }

    test('returns skipped=true when no access graph is modelled', () => {
        const hangar = mkHangar([mkDoor('D1')], [mkBay('Bay1')]);  // no accessNodes
        const ind = mkInduction({ bays: [], hangar });
        const result = checkDynamicBayReachability(hangar as any, ind as any, [], []);
        expect(result.skipped).toBe(true);
        expect(result.ok).toBe(true);
    });

    test('returns skipped=true when own bays have no access nodes', () => {
        const { hangar, path } = mkMinimalHangar();
        const bayNoNode = mkBay('NakedBay');   // no accessNode
        const ind = mkInduction({ bays: [bayNoNode], hangar });
        const result = checkDynamicBayReachability(hangar as any, ind as any, [], [path] as any);
        expect(result.skipped).toBe(true);
    });

    test('returns skipped=true when no door has an access node', () => {
        const nodeB = an('NodeB');
        const bay   = mkBay('Bay1', nodeB);
        // Door has no accessNode, so no door entry point
        const hangar = mkHangar([mkDoor('D1')], [bay]);
        const path   = mkPath([nodeB], []);
        const ind    = mkInduction({ bays: [bay], hangar });
        const result = checkDynamicBayReachability(hangar as any, ind as any, [], [path] as any);
        expect(result.skipped).toBe(true);
    });

    test('returns ok=true when all own bays are reachable (no concurrent inductions)', () => {
        const { hangar, bay2, path } = mkMinimalHangar();
        const ind = mkInduction({ id: 'IND1', bays: [bay2], hangar,
            start: '2025-06-01T08:00', end: '2025-06-01T16:00' });
        const result = checkDynamicBayReachability(hangar as any, ind as any, [ind] as any, [path] as any);
        expect(result.skipped).toBe(false);
        expect(result.ok).toBe(true);
    });

    test('ok message includes inductionId when one is set', () => {
        const { hangar, bay2, path } = mkMinimalHangar();
        const ind = mkInduction({ id: 'IND42', bays: [bay2], hangar,
            start: '2025-06-01T08:00', end: '2025-06-01T16:00' });
        const result = checkDynamicBayReachability(hangar as any, ind as any, [ind] as any, [path] as any);
        expect(result.ok).toBe(true);
        expect(result.message).toContain('IND42');
    });

    test('returns ok=false when blocking induction occupies the only path to own bay', () => {
        const { hangar, bay1, bay2, path } = mkMinimalHangar();
        // Target induction wants Bay2; blocker occupies Bay1 (only path)
        const ind     = mkInduction({ id: 'TARGET', bays: [bay2], hangar,
            start: '2025-06-01T08:00', end: '2025-06-01T16:00' });
        const blocker = mkInduction({ id: 'BLOCKER', bays: [bay1], hangar,
            start: '2025-06-01T10:00', end: '2025-06-01T14:00',
            aircraft: { name: 'Hawk', wingspan: 10 } });
        const allInductions = [ind, blocker];
        const result = checkDynamicBayReachability(hangar as any, ind as any, allInductions as any, [path] as any);
        expect(result.ok).toBe(false);
        expect(result.skipped).toBe(false);
        expect(result.evidence.unreachableBays).toContain('Bay2');
    });

    test('non-overlapping induction does not block own bay', () => {
        const { hangar, bay1, bay2, path } = mkMinimalHangar();
        const ind      = mkInduction({ bays: [bay2], hangar,
            start: '2025-06-01T08:00', end: '2025-06-01T12:00' });
        const nonOverlap = mkInduction({ bays: [bay1], hangar,
            start: '2025-06-01T14:00', end: '2025-06-01T18:00',
            aircraft: { name: 'Hawk', wingspan: 10 } });
        const result = checkDynamicBayReachability(hangar as any, ind as any,
            [ind, nonOverlap] as any, [path] as any);
        expect(result.ok).toBe(true);
    });
});

// ============================================================================
// checkCorridorFit
// ============================================================================

describe('checkCorridorFit', () => {
    // Topology: Door --(bidir)-- Corridor(width=8) --(bidir)-- Bay
    function mkCorridorHangar(corridorWidth: number) {
        const nodeD = an('NodeD');
        const nodeC = an('NodeC', corridorWidth);
        const nodeB = an('NodeB');
        const door   = mkDoor('D1', nodeD);
        const bay    = mkBay('Bay1', nodeB);
        const hangar = mkHangar([door], [bay]);
        const path   = mkPath([nodeD, nodeC, nodeB], [
            mkLink(nodeD, nodeC, true),
            mkLink(nodeC, nodeB, true),
        ]);
        return { hangar, bay, path };
    }

    test('returns skipped=true when no access graph is modelled', () => {
        const hangar = mkHangar([mkDoor('D1')], [mkBay('Bay1')]);
        const ind = mkInduction({ bays: [], hangar });
        const result = checkCorridorFit(hangar as any, ind as any, [], 11);
        expect(result.skipped).toBe(true);
    });

    test('returns skipped=true when no door has an access node', () => {
        const nodeB = an('NodeB');
        const bay   = mkBay('Bay1', nodeB);
        const hangar = mkHangar([mkDoor('D1')], [bay]);  // door has no accessNode
        const path   = mkPath([nodeB], []);
        const ind    = mkInduction({ bays: [bay], hangar });
        const result = checkCorridorFit(hangar as any, ind as any, [path] as any, 11);
        expect(result.skipped).toBe(true);
    });

    test('returns skipped=true when own bays have no access nodes', () => {
        const nodeD = an('NodeD');
        const door  = mkDoor('D1', nodeD);
        const hangar = mkHangar([door], []);
        const path   = mkPath([nodeD], []);
        const bayNoNode = mkBay('NakedBay');  // no accessNode
        const ind = mkInduction({ bays: [bayNoNode], hangar });
        const result = checkCorridorFit(hangar as any, ind as any, [path] as any, 11);
        expect(result.skipped).toBe(true);
    });

    test('returns ok=true with no violations when corridor is wide enough', () => {
        const { hangar, bay, path } = mkCorridorHangar(15);  // corridor=15 >= wingspan 11
        const ind = mkInduction({ bays: [bay], hangar });
        const result = checkCorridorFit(hangar as any, ind as any, [path] as any, 11);
        expect(result.ok).toBe(true);
        expect(result.violations).toHaveLength(0);
        expect(result.skipped).toBe(false);
    });

    test('returns violation when corridor is too narrow for aircraft wingspan', () => {
        const { hangar, bay, path } = mkCorridorHangar(8);  // corridor=8 < wingspan 11
        const ind = mkInduction({ bays: [bay], hangar });
        const result = checkCorridorFit(hangar as any, ind as any, [path] as any, 11);
        expect(result.ok).toBe(false);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].nodeName).toBe('NodeC');
        expect(result.violations[0].nodeWidth).toBe(8);
        expect(result.violations[0].wingspanEff).toBe(11);
        expect(result.violations[0].bayName).toBe('Bay1');
    });

    test('bay node itself is not treated as a narrow corridor in violation list', () => {
        // Bay has width=5 (narrow), but since it IS a bay it must not appear as corridor violation
        const nodeD = an('NodeD');
        const nodeB = an('NodeB', 5);   // width=5 but it is a bay node
        const door  = mkDoor('D1', nodeD);
        const bay   = mkBay('Bay1', nodeB);
        const hangar = mkHangar([door], [bay]);
        const path   = mkPath([nodeD, nodeB], [mkLink(nodeD, nodeB, true)]);
        const ind    = mkInduction({ bays: [bay], hangar });
        const result = checkCorridorFit(hangar as any, ind as any, [path] as any, 11);
        // Bay is directly reachable from door without passing any narrow corridor →
        // no violations (structural path exists, and bay nodes are never "narrow corridors")
        expect(result.violations).toHaveLength(0);
    });
});
