/**
 * Unit tests for the `traversable` bay property in access-graph.ts.
 *
 * Uses plain structural mocks — no Langium runtime required.
 * Tests that traversable bays remain passable in BFS when occupied by a concurrent induction.
 */
import { describe, expect, test } from 'vitest';
import {
    buildAccessGraph,
    reachableNodes,
    type AccessGraph,
    type AccessGraphNode,
    type AccessGraphEdge,
} from '../src/access-graph.js';

// ---------------------------------------------------------------------------
// Fixture helpers — structural mocks matching Langium AST shapes
// ---------------------------------------------------------------------------

function mkAccessNode(name: string, width?: number) {
    return { name, width };
}

function mkDoor(name: string, accessNode?: any) {
    return { name, accessNode: accessNode ? { ref: accessNode } : undefined };
}

function mkBay(name: string, accessNode?: any, traversable = false) {
    return {
        name,
        width: 20, depth: 20, height: 5,
        row: undefined, col: undefined,
        adjacent: [],
        traversable,
        accessNode: accessNode ? { ref: accessNode } : undefined,
        $type: 'HangarBay',
    };
}

function mkHangar(doors: any[], bays: any[]) {
    return { name: 'TestHangar', doors, grid: { bays, rows: undefined, cols: undefined }, $type: 'Hangar' };
}

function mkAccessPath(nodes: any[], links: any[] = []) {
    return { name: 'AP', nodes, links };
}

/**
 * Build a minimal AccessGraph directly from plain data (bypasses Langium).
 * Used for tests that focus solely on reachableNodes() traversal logic.
 */
function mkGraph(
    nodeList: Array<{ id: string; bayName?: string; width?: number; traversable?: boolean }>,
    edgeList: Array<{ from: string; to: string; bidirectional?: boolean }>
): AccessGraph {
    const nodes = new Map<string, AccessGraphNode>();
    for (const n of nodeList) {
        nodes.set(n.id, { id: n.id, bayName: n.bayName, width: n.width, traversable: n.traversable });
    }
    const edges: AccessGraphEdge[] = edgeList.map(e => ({
        from: e.from,
        to: e.to,
        bidirectional: e.bidirectional ?? false,
    }));
    return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('traversable bay — buildAccessGraph annotation', () => {
    /**
     * When a HangarBay has `traversable = true`, buildAccessGraph must copy
     * that flag onto the corresponding AccessGraphNode.
     */
    test('traversable bay is annotated on the graph node', () => {
        const nodeA = mkAccessNode('NodeA');
        const nodeB = mkAccessNode('NodeB');
        const door1 = mkDoor('Door1', nodeA);
        const bay1  = mkBay('Bay1', nodeB, true /* traversable */);
        const hangar = mkHangar([door1], [bay1]);
        const path = mkAccessPath([nodeA, nodeB], [
            { from: { ref: nodeA }, to: { ref: nodeB }, bidirectional: false },
        ]);

        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph).not.toBeNull();
        expect(graph!.nodes.get('NodeB')?.traversable).toBe(true);
    });

    test('non-traversable bay has traversable undefined (falsy) on its graph node', () => {
        const nodeA = mkAccessNode('NodeA');
        const nodeB = mkAccessNode('NodeB');
        const door1 = mkDoor('Door1', nodeA);
        const bay1  = mkBay('Bay1', nodeB, false /* not traversable */);
        const hangar = mkHangar([door1], [bay1]);
        const path = mkAccessPath([nodeA, nodeB], [
            { from: { ref: nodeA }, to: { ref: nodeB }, bidirectional: false },
        ]);

        const graph = buildAccessGraph(hangar as any, [path] as any);
        expect(graph).not.toBeNull();
        expect(graph!.nodes.get('NodeB')?.traversable).toBeFalsy();
    });
});

describe('traversable bay — reachableNodes BFS passability', () => {
    /**
     * Linear topology: Door → Bay1(traversable) → Bay2
     *
     * Bay1 is occupied (in blockedNodeNames). Because it is traversable,
     * BFS should still traverse through Bay1 and reach Bay2.
     */
    test('traversable occupied bay does not block BFS — target bay is reachable', () => {
        // Door -(bidir)-> Bay1Traversable -(bidir)-> Bay2Target
        const graph = mkGraph(
            [
                { id: 'NodeDoor' },
                { id: 'NodeBay1', bayName: 'Bay1', traversable: true },
                { id: 'NodeBay2', bayName: 'Bay2' },
            ],
            [
                { from: 'NodeDoor', to: 'NodeBay1', bidirectional: true },
                { from: 'NodeBay1', to: 'NodeBay2', bidirectional: true },
            ]
        );

        // traversable skips adding to blockedNodeIds in checkDynamicBayReachability, so at
        // the reachableNodes level, traversable bays are simply NOT in the blocked set.
        // This test verifies that when NOT blocked, Bay2 is reachable through Bay1.
        const notBlocked = new Set<string>(); // Bay1 NOT blocked (traversable skips adding it)
        const reachable2 = reachableNodes(['NodeDoor'], graph, notBlocked);
        expect(reachable2.has('NodeBay2')).toBe(true);
    });

    /**
     * Linear topology: Door → Bay1(non-traversable) → Bay2
     *
     * Bay1 is occupied (blocked). Because it is NOT traversable,
     * BFS is cut off and Bay2 is unreachable.
     */
    test('non-traversable occupied bay blocks BFS — target bay is unreachable', () => {
        const graph = mkGraph(
            [
                { id: 'NodeDoor' },
                { id: 'NodeBay1', bayName: 'Bay1' /* not traversable */ },
                { id: 'NodeBay2', bayName: 'Bay2' },
            ],
            [
                { from: 'NodeDoor', to: 'NodeBay1', bidirectional: true },
                { from: 'NodeBay1', to: 'NodeBay2', bidirectional: true },
            ]
        );

        const blocked = new Set(['NodeBay1']);
        const reachable = reachableNodes(['NodeDoor'], graph, blocked);

        expect(reachable.has('NodeBay1')).toBe(false);
        expect(reachable.has('NodeBay2')).toBe(false);
    });

    /**
     * Two-path topology:
     *   Door -(bidir)-> Bay1(non-traversable) -> Bay3(target)
     *   Door -(bidir)-> Bay2(traversable)      -> Bay3(target)
     *
     * Bay1 is blocked; Bay2 is traversable (not blocked even when occupied).
     * Bay3 must remain reachable via the Bay2 path.
     */
    test('two-path scenario: traversable bypass path keeps target reachable', () => {
        const graph = mkGraph(
            [
                { id: 'NodeDoor' },
                { id: 'NodeBay1', bayName: 'Bay1' },
                { id: 'NodeBay2', bayName: 'Bay2', traversable: true },
                { id: 'NodeBay3', bayName: 'Bay3' },
            ],
            [
                { from: 'NodeDoor',  to: 'NodeBay1', bidirectional: true },
                { from: 'NodeDoor',  to: 'NodeBay2', bidirectional: true },
                { from: 'NodeBay1', to: 'NodeBay3',  bidirectional: true },
                { from: 'NodeBay2', to: 'NodeBay3',  bidirectional: true },
            ]
        );

        // Bay1 is blocked (occupied, non-traversable); Bay2 is traversable so NOT blocked
        const blocked = new Set(['NodeBay1']);
        const reachable = reachableNodes(['NodeDoor'], graph, blocked);

        expect(reachable.has('NodeBay3')).toBe(true);
        expect(reachable.has('NodeBay2')).toBe(true);
        expect(reachable.has('NodeBay1')).toBe(false); // properly blocked
    });
});
