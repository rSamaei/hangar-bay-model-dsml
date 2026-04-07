/**
 * Unit tests for hangar-checks.ts
 * (SFR31_REACHABILITY_SKIPPED, SFR28_ASYMMETRIC_ADJACENCY, SFR29_NONGRID_ADJACENCY, SFR29_GRID_OVERRIDE).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Mocks access-graph so buildAccessGraph is controllable.
 * Uses structural mocks — no Langium runtime.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { Hangar, HangarBay } from '../../src/generated/ast.js';
import {
    checkReachabilitySkipped,
    checkAsymmetricAdjacency,
    checkAdjacencyConsistency,
} from '../../src/validators/hangar-checks.js';

// ---------------------------------------------------------------------------
// Mock access-graph so buildAccessGraph is controllable
// ---------------------------------------------------------------------------
vi.mock('../../src/access-graph.js', () => ({
    buildAccessGraph: vi.fn(),
    reachableNodes: vi.fn(),
    checkDynamicBayReachability: vi.fn(),
    checkCorridorFit: vi.fn(),
}));

import { buildAccessGraph } from '../../src/access-graph.js';
const mockBuildAccessGraph = buildAccessGraph as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockAccept(): ValidationAcceptor {
    return vi.fn() as unknown as ValidationAcceptor;
}

function wasCalled(accept: ValidationAcceptor): boolean {
    return (accept as ReturnType<typeof vi.fn>).mock.calls.length > 0;
}

function calledWithCode(accept: ValidationAcceptor, code: string): boolean {
    const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    return calls.some(args => typeof args[1] === 'string' && (args[1] as string).includes(code));
}

function mkBay(name: string, opts?: { row?: number; col?: number; adjacent?: string[] }): HangarBay {
    return {
        name,
        row: opts?.row,
        col: opts?.col,
        adjacent: [],   // will be filled in after creating companion bays
    } as unknown as HangarBay;
}

function mkHangar(name: string, bays: HangarBay[], gridOpts?: { rows?: number; cols?: number; adjacency?: number }): Hangar {
    return {
        name,
        grid: {
            bays,
            rows: gridOpts?.rows,
            cols: gridOpts?.cols,
            adjacency: gridOpts?.adjacency,
        },
        doors: [],
    } as unknown as Hangar;
}

/** Attach a model as $container of the hangar, with the given inductions list. */
function attachModel(hangar: Hangar, inductions: any[] = []): void {
    const model = {
        $type: 'Model',
        hangars: [hangar],
        inductions,
        autoInductions: [],
        accessPaths: [],
    };
    (hangar as any).$container = model;
}

// ===========================================================================
// checkReachabilitySkipped
// ===========================================================================

describe('checkReachabilitySkipped', () => {
    test('no model container — silent return', () => {
        const accept = mockAccept();
        const hangar = mkHangar('H', []);
        // no $container set
        checkReachabilitySkipped(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('hangar has no inductions — no hint', () => {
        const accept = mockAccept();
        const hangar = mkHangar('H', []);
        attachModel(hangar, []); // no inductions point to this hangar
        checkReachabilitySkipped(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('hangar has induction but access graph exists — no hint', () => {
        const accept = mockAccept();
        const hangar = mkHangar('H', []);
        const ind = { hangar: { ref: hangar } };
        attachModel(hangar, [ind]);
        mockBuildAccessGraph.mockReturnValue({ nodes: new Map(), edges: [] }); // non-null
        checkReachabilitySkipped(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('hangar has induction and no access graph — SFR31_REACHABILITY_SKIPPED hint', () => {
        const accept = mockAccept();
        const hangar = mkHangar('H', []);
        const ind = { hangar: { ref: hangar } };
        attachModel(hangar, [ind]);
        mockBuildAccessGraph.mockReturnValue(null);
        checkReachabilitySkipped(hangar, accept);
        expect(calledWithCode(accept, 'SFR31_REACHABILITY_SKIPPED')).toBe(true);
    });

    test('induction targets a different hangar — no hint', () => {
        const accept = mockAccept();
        const hangarA = mkHangar('A', []);
        const hangarB = mkHangar('B', []);
        const ind = { hangar: { ref: hangarB } };
        attachModel(hangarA, [ind]);
        checkReachabilitySkipped(hangarA, accept);
        // No induction targets hangarA → early return
        expect(wasCalled(accept)).toBe(false);
    });
});

// ===========================================================================
// checkAsymmetricAdjacency (non-grid hangars only)
// ===========================================================================

describe('checkAsymmetricAdjacency', () => {
    test('grid hangar (rows & cols defined) — skipped entirely', () => {
        const accept = mockAccept();
        const bayA = mkBay('A');
        const bayB = mkBay('B');
        // A declares B adjacent, B does not declare A — but hangar has a grid → check skipped
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        const hangar = mkHangar('H', [bayA, bayB], { rows: 1, cols: 2 });
        attachModel(hangar);
        checkAsymmetricAdjacency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('non-grid hangar with symmetric adjacency — no warning', () => {
        const accept = mockAccept();
        const bayA = mkBay('A');
        const bayB = mkBay('B');
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [{ ref: bayA }];
        const hangar = mkHangar('H', [bayA, bayB]); // no rows/cols
        attachModel(hangar);
        checkAsymmetricAdjacency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('non-grid hangar: A declares B adjacent but B does not declare A — SFR28_ASYMMETRIC_ADJACENCY', () => {
        const accept = mockAccept();
        const bayA = mkBay('A');
        const bayB = mkBay('B');
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        const hangar = mkHangar('H', [bayA, bayB]);
        attachModel(hangar);
        checkAsymmetricAdjacency(hangar, accept);
        expect(calledWithCode(accept, 'SFR28_ASYMMETRIC_ADJACENCY')).toBe(true);
    });

    test('adjacent ref is undefined — skipped gracefully', () => {
        const accept = mockAccept();
        const bayA = mkBay('A');
        (bayA as any).adjacent = [{ ref: undefined }];
        const hangar = mkHangar('H', [bayA]);
        attachModel(hangar);
        checkAsymmetricAdjacency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('non-grid hangar with no adjacent declarations — no warning', () => {
        const accept = mockAccept();
        const bayA = mkBay('A');
        (bayA as any).adjacent = [];
        const hangar = mkHangar('H', [bayA]);
        attachModel(hangar);
        checkAsymmetricAdjacency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ===========================================================================
// checkAdjacencyConsistency (grid hangars only)
// ===========================================================================

describe('checkAdjacencyConsistency', () => {
    test('non-grid hangar (no rows/cols) — skipped entirely', () => {
        const accept = mockAccept();
        const bayA = mkBay('A', { row: 0, col: 0 });
        const hangar = mkHangar('H', [bayA]); // no rows/cols defined
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('grid hangar, bay with no explicit adjacent — no warning', () => {
        const accept = mockAccept();
        const bayA = mkBay('A', { row: 0, col: 0 });
        const bayB = mkBay('B', { row: 0, col: 1 });
        (bayA as any).adjacent = [];
        (bayB as any).adjacent = [];
        const hangar = mkHangar('H', [bayA, bayB], { rows: 1, cols: 2 });
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('4-connected: explicit adjacency matches grid — no warning', () => {
        const accept = mockAccept();
        const bayA = mkBay('A', { row: 0, col: 0 });
        const bayB = mkBay('B', { row: 0, col: 1 });
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [{ ref: bayA }];
        const hangar = mkHangar('H', [bayA, bayB], { rows: 1, cols: 2 });
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('4-connected: diagonal declared adjacent — SFR29_NONGRID_ADJACENCY', () => {
        const accept = mockAccept();
        const bayA = mkBay('A', { row: 0, col: 0 });
        const bayB = mkBay('B', { row: 1, col: 1 }); // diagonal
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        const hangar = mkHangar('H', [bayA, bayB], { rows: 2, cols: 2 });
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        expect(calledWithCode(accept, 'SFR29_NONGRID_ADJACENCY')).toBe(true);
    });

    test('8-connected: diagonal declared adjacent — no SFR29_NONGRID_ADJACENCY', () => {
        const accept = mockAccept();
        const bayA = mkBay('A', { row: 0, col: 0 });
        const bayB = mkBay('B', { row: 1, col: 1 }); // diagonal — valid for 8-connected
        const bayC = mkBay('C', { row: 0, col: 1 });
        const bayD = mkBay('D', { row: 1, col: 0 });
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        (bayC as any).adjacent = [];
        (bayD as any).adjacent = [];
        const hangar = mkHangar('H', [bayA, bayB, bayC, bayD], { rows: 2, cols: 2, adjacency: 8 });
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        expect(calledWithCode(accept, 'SFR29_NONGRID_ADJACENCY')).toBe(false);
    });

    test('explicit adjacency excludes a grid neighbour — SFR29_GRID_OVERRIDE', () => {
        // Row B1-B2-B3; B2 has explicit { B1 } only, omitting grid-neighbour B3
        const accept = mockAccept();
        const bayA = mkBay('B1', { row: 0, col: 0 });
        const bayB = mkBay('B2', { row: 0, col: 1 });
        const bayC = mkBay('B3', { row: 0, col: 2 });
        (bayA as any).adjacent = [];
        (bayB as any).adjacent = [{ ref: bayA }]; // explicitly lists B1 but not B3
        (bayC as any).adjacent = [];
        const hangar = mkHangar('H', [bayA, bayB, bayC], { rows: 1, cols: 3 });
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        expect(calledWithCode(accept, 'SFR29_GRID_OVERRIDE')).toBe(true);
    });

    test('bay with no grid coords but explicit adjacent — SFR29_NONGRID_ADJACENCY skipped', () => {
        // Bay without row/col: we can't check distance, so SFR29_NONGRID_ADJACENCY does not fire
        const accept = mockAccept();
        const bayA = mkBay('A'); // no row/col
        const bayB = mkBay('B', { row: 0, col: 0 });
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        const hangar = mkHangar('H', [bayA, bayB], { rows: 1, cols: 2 });
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        // bayHasCoords is false for A → nongrid check skipped
        // SFR29_GRID_OVERRIDE also skipped because gridNeighborNames is empty (bayA has no coords)
        expect(calledWithCode(accept, 'SFR29_NONGRID_ADJACENCY')).toBe(false);
    });

    test('adjacent ref is undefined — skipped gracefully', () => {
        const accept = mockAccept();
        const bayA = mkBay('A', { row: 0, col: 0 });
        (bayA as any).adjacent = [{ ref: undefined }];
        const hangar = mkHangar('H', [bayA], { rows: 1, cols: 1 });
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('8-connected: explicit adjacency covers all grid neighbours — no SFR29_GRID_OVERRIDE', () => {
        // 2×2 grid, B1 at (0,0) explicitly lists all 3 grid neighbours (B2, B3, B4)
        const accept = mockAccept();
        const b1 = mkBay('B1', { row: 0, col: 0 });
        const b2 = mkBay('B2', { row: 0, col: 1 });
        const b3 = mkBay('B3', { row: 1, col: 0 });
        const b4 = mkBay('B4', { row: 1, col: 1 });
        (b1 as any).adjacent = [{ ref: b2 }, { ref: b3 }, { ref: b4 }];
        (b2 as any).adjacent = [];
        (b3 as any).adjacent = [];
        (b4 as any).adjacent = [];
        const hangar = mkHangar('H', [b1, b2, b3, b4], { rows: 2, cols: 2, adjacency: 8 });
        attachModel(hangar);
        checkAdjacencyConsistency(hangar, accept);
        expect(calledWithCode(accept, 'SFR29_GRID_OVERRIDE')).toBe(false);
    });
});
