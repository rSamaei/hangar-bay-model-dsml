/**
 * Unit tests for buildAdjacencyGraph().
 *
 * Uses structural TypeScript mocks — no Langium runtime required.
 * Tests grid-derived adjacency, explicit adjacent refs, and mixed layouts.
 */
import { describe, expect, test } from 'vitest';
import { buildAdjacencyGraph } from '../src/geometry/adjacency.js';
import { ref } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkBay(name: string, opts: { row?: number; col?: number; adjacent?: any[] } = {}) {
    return {
        name,
        width: 10, depth: 20, height: 5,
        row: opts.row,
        col: opts.col,
        adjacent: opts.adjacent ?? [],
        accessNode: undefined,
        $type: 'HangarBay'
    };
}

function mkHangar(bays: any[], rows?: number, cols?: number) {
    return { name: 'TestHangar', doors: [], grid: { bays, rows, cols }, $type: 'Hangar' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildAdjacencyGraph — grid-based adjacency', () => {
    test('horizontally adjacent bays (same row, col ±1) are adjacent', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const bay2 = mkBay('Bay2', { row: 0, col: 1 });
        const hangar = mkHangar([bay1, bay2], 1, 2);
        const { adjacency } = buildAdjacencyGraph(hangar as any);
        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(true);
        expect(adjacency.get('Bay2')?.has('Bay1')).toBe(true);
    });

    test('vertically adjacent bays (same col, row ±1) are adjacent', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const bay2 = mkBay('Bay2', { row: 1, col: 0 });
        const hangar = mkHangar([bay1, bay2], 2, 1);
        const { adjacency } = buildAdjacencyGraph(hangar as any);
        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(true);
        expect(adjacency.get('Bay2')?.has('Bay1')).toBe(true);
    });

    test('diagonally placed bays are NOT adjacent', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const bay2 = mkBay('Bay2', { row: 1, col: 1 });
        const hangar = mkHangar([bay1, bay2], 2, 2);
        const { adjacency } = buildAdjacencyGraph(hangar as any);
        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(false);
        expect(adjacency.get('Bay2')?.has('Bay1')).toBe(false);
    });

    test('same bay is not adjacent to itself', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const hangar = mkHangar([bay1], 1, 1);
        const { adjacency } = buildAdjacencyGraph(hangar as any);
        expect(adjacency.get('Bay1')?.has('Bay1')).toBe(false);
    });

    test('3-bay row: middle bay is adjacent to both ends', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const bay2 = mkBay('Bay2', { row: 0, col: 1 });
        const bay3 = mkBay('Bay3', { row: 0, col: 2 });
        const hangar = mkHangar([bay1, bay2, bay3], 1, 3);
        const { adjacency } = buildAdjacencyGraph(hangar as any);
        expect(adjacency.get('Bay2')?.has('Bay1')).toBe(true);
        expect(adjacency.get('Bay2')?.has('Bay3')).toBe(true);
        expect(adjacency.get('Bay1')?.has('Bay3')).toBe(false);
    });

    test('metadata reports gridDerived=true when rows/cols present', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const hangar = mkHangar([bay1], 1, 1);
        const { metadata } = buildAdjacencyGraph(hangar as any);
        expect(metadata.gridDerived).toBe(true);
    });

    test('metadata gridDerived=false when no rows/cols', () => {
        const bay1 = mkBay('Bay1');
        const hangar = mkHangar([bay1]);
        const { metadata } = buildAdjacencyGraph(hangar as any);
        expect(metadata.gridDerived).toBe(false);
    });
});

describe('buildAdjacencyGraph — explicit adjacent refs', () => {
    test('bay listing another as adjacent produces bidirectional edge', () => {
        const bay2 = mkBay('Bay2');
        const bay1 = mkBay('Bay1', { adjacent: [ref(bay2)] });
        const hangar = mkHangar([bay1, bay2]);
        const { adjacency } = buildAdjacencyGraph(hangar as any);
        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(true);
        expect(adjacency.get('Bay2')?.has('Bay1')).toBe(true);
    });

    test('no explicit adjacency — bays are isolated', () => {
        const bay1 = mkBay('Bay1');
        const bay2 = mkBay('Bay2');
        const hangar = mkHangar([bay1, bay2]);
        const { adjacency } = buildAdjacencyGraph(hangar as any);
        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(false);
        expect(adjacency.get('Bay2')?.has('Bay1')).toBe(false);
    });

    test('metadata counts explicit edges', () => {
        const bay2 = mkBay('Bay2');
        const bay1 = mkBay('Bay1', { adjacent: [ref(bay2)] });
        const hangar = mkHangar([bay1, bay2]);
        const { metadata } = buildAdjacencyGraph(hangar as any);
        expect(metadata.explicitEdges).toBe(1);
        expect(metadata.gridDerived).toBe(false);
    });

    test('adjacency map initialised for every bay even with no edges', () => {
        const bay1 = mkBay('Bay1');
        const bay2 = mkBay('Bay2');
        const hangar = mkHangar([bay1, bay2]);
        const { adjacency } = buildAdjacencyGraph(hangar as any);
        expect(adjacency.has('Bay1')).toBe(true);
        expect(adjacency.has('Bay2')).toBe(true);
    });
});

describe('buildAdjacencyGraph — mixed grid + explicit', () => {
    test('grid edge and explicit edge both appear in adjacency map', () => {
        const bay2 = mkBay('Bay2', { row: 0, col: 1 });
        const bay3 = mkBay('Bay3'); // no grid coords
        const bay1 = mkBay('Bay1', { row: 0, col: 0, adjacent: [ref(bay3)] });
        const hangar = mkHangar([bay1, bay2, bay3], 1, 2);
        const { adjacency, metadata } = buildAdjacencyGraph(hangar as any);
        // Grid-derived edge
        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(true);
        // Explicit edge
        expect(adjacency.get('Bay1')?.has('Bay3')).toBe(true);
        expect(adjacency.get('Bay3')?.has('Bay1')).toBe(true);
        expect(metadata.gridDerived).toBe(true);
        expect(metadata.explicitEdges).toBeGreaterThan(0);
        expect(metadata.gridEdges).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Tests: adjacency mode (4-connected vs 8-connected)
// ---------------------------------------------------------------------------

/** Build a hangar with an explicit adjacency mode on the grid. */
function mkHangarWithMode(bays: any[], rows: number, cols: number, adjacency?: number) {
    return { name: 'TestHangar', doors: [], grid: { bays, rows, cols, adjacency }, $type: 'Hangar' };
}

describe('buildAdjacencyGraph — adjacency mode', () => {

    /**
     * 2×2 grid, adjacency='8'.  Bay1(0,0) and Bay4(1,1) are diagonal.
     * Under 8-connected they must be adjacent; Bay1↔Bay2 and Bay1↔Bay3
     * (orthogonal) must also be adjacent.
     */
    test('adjacency 8: diagonal bays are included in the graph', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const bay2 = mkBay('Bay2', { row: 0, col: 1 });
        const bay3 = mkBay('Bay3', { row: 1, col: 0 });
        const bay4 = mkBay('Bay4', { row: 1, col: 1 });
        const hangar = mkHangarWithMode([bay1, bay2, bay3, bay4], 2, 2, 8);
        const { adjacency } = buildAdjacencyGraph(hangar as any);

        // Orthogonal edges still present
        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(true);
        expect(adjacency.get('Bay1')?.has('Bay3')).toBe(true);
        // Diagonal edges now present
        expect(adjacency.get('Bay1')?.has('Bay4')).toBe(true);
        expect(adjacency.get('Bay4')?.has('Bay1')).toBe(true);
        // All four bays fully connected (2×2 in 8-connected is a complete graph)
        expect(adjacency.get('Bay2')?.has('Bay3')).toBe(true);
    });

    /**
     * Same 2×2 grid, no adjacency keyword (undefined → defaults to 4).
     * Diagonal bays must NOT be adjacent.
     */
    test('no adjacency keyword: defaults to 4-connected, diagonals absent', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const bay2 = mkBay('Bay2', { row: 0, col: 1 });
        const bay3 = mkBay('Bay3', { row: 1, col: 0 });
        const bay4 = mkBay('Bay4', { row: 1, col: 1 });
        const hangar = mkHangar([bay1, bay2, bay3, bay4], 2, 2);
        const { adjacency } = buildAdjacencyGraph(hangar as any);

        // Orthogonal edges present
        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(true);
        expect(adjacency.get('Bay1')?.has('Bay3')).toBe(true);
        // Diagonal edges absent
        expect(adjacency.get('Bay1')?.has('Bay4')).toBe(false);
        expect(adjacency.get('Bay4')?.has('Bay1')).toBe(false);
    });

    /**
     * Explicit adjacency='4': same behaviour as default — diagonals absent.
     */
    test('adjacency 4: behaves identically to the default (diagonals absent)', () => {
        const bay1 = mkBay('Bay1', { row: 0, col: 0 });
        const bay2 = mkBay('Bay2', { row: 1, col: 1 });
        const hangar = mkHangarWithMode([bay1, bay2], 2, 2, 4);
        const { adjacency } = buildAdjacencyGraph(hangar as any);

        expect(adjacency.get('Bay1')?.has('Bay2')).toBe(false);
        expect(adjacency.get('Bay2')?.has('Bay1')).toBe(false);
    });
});
