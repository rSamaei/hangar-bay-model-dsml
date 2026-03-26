/**
 * Unit tests for bay-adjacency.ts (L9).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses plain structural mocks — no Langium runtime.
 */
import { describe, expect, test } from 'vitest';
import { buildBayAdjacencyGraph } from '../src/bay-adjacency.js';
import type { HangarBay } from '../src/generated/ast.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkBay(
    name: string,
    opts: { row?: number; col?: number; adjacent?: HangarBay[] } = {}
): HangarBay {
    return {
        name,
        row: opts.row,
        col: opts.col,
        adjacent: (opts.adjacent ?? []).map(b => ({ ref: b })),
    } as unknown as HangarBay;
}

function mkGrid(
    bays: HangarBay[],
    opts: { rows?: number; cols?: number; adjacency?: number } = {}
) {
    return { bays, rows: opts.rows, cols: opts.cols, adjacency: opts.adjacency };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildBayAdjacencyGraph', () => {
    test('empty bay list → empty adjacency map, all metadata zero', () => {
        const { adjacency, metadata } = buildBayAdjacencyGraph(mkGrid([]));
        expect(adjacency.size).toBe(0);
        expect(metadata.gridEdges).toBe(0);
        expect(metadata.explicitEdges).toBe(0);
        expect(metadata.gridDerived).toBe(false);
    });

    test('no grid (rows/cols undefined) → gridDerived=false, no grid edges', () => {
        const A = mkBay('A');
        const B = mkBay('B');
        const { metadata } = buildBayAdjacencyGraph(mkGrid([A, B]));
        expect(metadata.gridDerived).toBe(false);
        expect(metadata.gridEdges).toBe(0);
    });

    test('4-connected grid: horizontal neighbours are adjacent', () => {
        // A(0,0) — B(0,1) side by side
        const A = mkBay('A', { row: 0, col: 0 });
        const B = mkBay('B', { row: 0, col: 1 });
        const { adjacency, metadata } = buildBayAdjacencyGraph(mkGrid([A, B], { rows: 1, cols: 2 }));
        expect(adjacency.get('A')?.has('B')).toBe(true);
        expect(adjacency.get('B')?.has('A')).toBe(true);
        expect(metadata.gridDerived).toBe(true);
        expect(metadata.gridEdges).toBeGreaterThan(0);
    });

    test('4-connected grid: diagonal cells are NOT adjacent', () => {
        // A(0,0) C(1,1) — diagonal, 4-connected only
        const A = mkBay('A', { row: 0, col: 0 });
        const B = mkBay('B', { row: 0, col: 1 });
        const C = mkBay('C', { row: 1, col: 0 });
        const D = mkBay('D', { row: 1, col: 1 });
        const { adjacency } = buildBayAdjacencyGraph(
            mkGrid([A, B, C, D], { rows: 2, cols: 2 })
        );
        expect(adjacency.get('A')?.has('D')).toBe(false);  // diagonal not adjacent
        expect(adjacency.get('B')?.has('C')).toBe(false);
    });

    test('8-connected grid: diagonal cells ARE adjacent (adjacency=8)', () => {
        const A = mkBay('A', { row: 0, col: 0 });
        const B = mkBay('B', { row: 0, col: 1 });
        const C = mkBay('C', { row: 1, col: 0 });
        const D = mkBay('D', { row: 1, col: 1 });
        const { adjacency } = buildBayAdjacencyGraph(
            mkGrid([A, B, C, D], { rows: 2, cols: 2, adjacency: 8 })
        );
        expect(adjacency.get('A')?.has('D')).toBe(true);   // diagonal included
        expect(adjacency.get('B')?.has('C')).toBe(true);
    });

    test('bay without row/col in a grid is skipped for the grid step', () => {
        // A has coords; B does not — A and B should NOT be connected via grid
        const A = mkBay('A', { row: 0, col: 0 });
        const B = mkBay('B');                              // no row/col
        const { adjacency } = buildBayAdjacencyGraph(
            mkGrid([A, B], { rows: 1, cols: 2 })
        );
        expect(adjacency.get('A')?.has('B')).toBe(false);
        expect(adjacency.get('B')?.has('A')).toBe(false);
    });

    test('explicit adjacent refs add bidirectional edges', () => {
        const A = mkBay('A');
        const B = mkBay('B');
        // Declare A → B explicitly (one direction); builder makes it bidirectional
        (A as any).adjacent = [{ ref: B }];
        const { adjacency, metadata } = buildBayAdjacencyGraph(mkGrid([A, B]));
        expect(adjacency.get('A')?.has('B')).toBe(true);
        expect(adjacency.get('B')?.has('A')).toBe(true);
        expect(metadata.explicitEdges).toBe(1);
    });

    test('explicit adj ref with undefined ref is silently skipped', () => {
        const A = mkBay('A');
        (A as any).adjacent = [{ ref: undefined }];  // dangling reference
        const { adjacency, metadata } = buildBayAdjacencyGraph(mkGrid([A]));
        expect(adjacency.get('A')?.size).toBe(0);
        expect(metadata.explicitEdges).toBe(0);
    });

    test('grid + explicit refs combine: explicit adds edges on top of grid', () => {
        // A(0,0) B(0,1) — grid neighbours; A also explicitly linked to C (non-grid)
        const A = mkBay('A', { row: 0, col: 0 });
        const B = mkBay('B', { row: 0, col: 1 });
        const C = mkBay('C');                              // no grid position
        (A as any).adjacent = [{ ref: C }];
        const { adjacency, metadata } = buildBayAdjacencyGraph(
            mkGrid([A, B, C], { rows: 1, cols: 2 })
        );
        expect(adjacency.get('A')?.has('B')).toBe(true);  // from grid
        expect(adjacency.get('A')?.has('C')).toBe(true);  // from explicit
        expect(adjacency.get('C')?.has('A')).toBe(true);  // explicit is bidirectional
        expect(metadata.gridDerived).toBe(true);
        expect(metadata.explicitEdges).toBe(1);
        expect(metadata.gridEdges).toBeGreaterThan(0);
    });

    test('metadata gridEdges counts each directed edge from the grid step', () => {
        // 1×3 row: A B C → A↔B and B↔C = 4 directed grid edges
        const A = mkBay('A', { row: 0, col: 0 });
        const B = mkBay('B', { row: 0, col: 1 });
        const C = mkBay('C', { row: 0, col: 2 });
        const { metadata } = buildBayAdjacencyGraph(
            mkGrid([A, B, C], { rows: 1, cols: 3 })
        );
        expect(metadata.gridEdges).toBe(4);  // A→B, B→A, B→C, C→B
    });
});
