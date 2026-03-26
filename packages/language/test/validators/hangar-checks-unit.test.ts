/**
 * Unit tests for hangar-checks.ts (SFR_REACHABILITY_SKIPPED, SFR7_ASYMMETRIC_ADJACENCY,
 * SFR_NONGRID_ADJACENCY, SFR_GRID_OVERRIDE rules).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime.
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { Hangar, HangarBay } from '../../src/generated/ast.js';
import {
    checkReachabilitySkipped,
    checkAsymmetricAdjacency,
    checkAdjacencyConsistency,
} from '../../src/validators/hangar-checks.js';

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

// ---------------------------------------------------------------------------
// checkReachabilitySkipped — SFR_REACHABILITY_SKIPPED
// ---------------------------------------------------------------------------

describe('checkReachabilitySkipped', () => {
    test('hangar has induction but no access graph → SFR_REACHABILITY_SKIPPED hint', () => {
        const accept = mockAccept();
        // No accessNode on any door/bay → buildAccessGraph returns null
        const hangar = {
            name: 'H1',
            doors: [],
            grid: { bays: [] },
        } as unknown as Hangar;
        const model = {
            $type: 'Model',
            inductions: [{ hangar: { ref: hangar } }],
            accessPaths: [],
        };
        (hangar as any).$container = model;
        checkReachabilitySkipped(hangar, accept);
        expect(calledWithCode(accept, 'SFR_REACHABILITY_SKIPPED')).toBe(true);
    });

    test('hangar has no inductions → no hint', () => {
        const accept = mockAccept();
        const hangar = {
            name: 'H1',
            doors: [],
            grid: { bays: [] },
        } as unknown as Hangar;
        const model = {
            $type: 'Model',
            inductions: [],
            accessPaths: [],
        };
        (hangar as any).$container = model;
        checkReachabilitySkipped(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('hangar has induction and access graph defined → no hint', () => {
        const accept = mockAccept();
        // A door with an accessNode hook → buildAccessGraph returns non-null
        const accessNodeRef = { name: 'Entry' };
        const door = { name: 'D1', accessNode: { ref: accessNodeRef } };
        const hangar = {
            name: 'H1',
            doors: [door],
            grid: { bays: [] },
        } as unknown as Hangar;
        const accessPath = {
            nodes: [{ name: 'Entry', width: 10 }],
            links: [],
        };
        const model = {
            $type: 'Model',
            inductions: [{ hangar: { ref: hangar } }],
            accessPaths: [accessPath],
        };
        (hangar as any).$container = model;
        checkReachabilitySkipped(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkAsymmetricAdjacency — SFR7_ASYMMETRIC_ADJACENCY
// ---------------------------------------------------------------------------

describe('checkAsymmetricAdjacency', () => {
    test('A→B declared but B does not declare A (no grid) → SFR7_ASYMMETRIC_ADJACENCY warning', () => {
        const accept = mockAccept();
        const bayA = { name: 'A' } as unknown as HangarBay;
        const bayB = { name: 'B' } as unknown as HangarBay;
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        const hangar = {
            name: 'H1',
            grid: { rows: undefined, cols: undefined, bays: [bayA, bayB] },
        } as unknown as Hangar;
        checkAsymmetricAdjacency(hangar, accept);
        expect(calledWithCode(accept, 'SFR7_ASYMMETRIC_ADJACENCY')).toBe(true);
    });

    test('A↔B declared symmetrically (no grid) → no warning', () => {
        const accept = mockAccept();
        const bayA = { name: 'A' } as unknown as HangarBay;
        const bayB = { name: 'B' } as unknown as HangarBay;
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [{ ref: bayA }];
        const hangar = {
            name: 'H1',
            grid: { rows: undefined, cols: undefined, bays: [bayA, bayB] },
        } as unknown as Hangar;
        checkAsymmetricAdjacency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('hangar has grid (rows/cols defined) → check skipped even with asymmetry', () => {
        const accept = mockAccept();
        const bayA = { name: 'A' } as unknown as HangarBay;
        const bayB = { name: 'B' } as unknown as HangarBay;
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        const hangar = {
            name: 'H1',
            grid: { rows: 1, cols: 2, bays: [bayA, bayB] },
        } as unknown as Hangar;
        checkAsymmetricAdjacency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkAdjacencyConsistency — SFR_NONGRID_ADJACENCY / SFR_GRID_OVERRIDE
// ---------------------------------------------------------------------------

describe('checkAdjacencyConsistency', () => {
    test('no grid (rows/cols undefined) → check skipped entirely', () => {
        const accept = mockAccept();
        const bayA = { name: 'A', row: undefined, col: undefined } as unknown as HangarBay;
        const bayB = { name: 'B', row: undefined, col: undefined } as unknown as HangarBay;
        (bayA as any).adjacent = [{ ref: bayB }];
        const hangar = {
            name: 'H1',
            grid: { rows: undefined, cols: undefined, bays: [bayA, bayB] },
        } as unknown as Hangar;
        checkAdjacencyConsistency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('bay with no explicit adjacent block → skip (no warning)', () => {
        const accept = mockAccept();
        const bayA = { name: 'A', row: 0, col: 0, adjacent: [] } as unknown as HangarBay;
        const bayB = { name: 'B', row: 0, col: 1, adjacent: [] } as unknown as HangarBay;
        const hangar = {
            name: 'H1',
            grid: { rows: 1, cols: 2, bays: [bayA, bayB] },
        } as unknown as Hangar;
        checkAdjacencyConsistency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('explicit adjacent to a non-grid-neighbour (col distance 2) → SFR_NONGRID_ADJACENCY', () => {
        const accept = mockAccept();
        // bayA at (0,0), bayB at (0,2) — column distance 2, not 4-connected
        const bayA = { name: 'A', row: 0, col: 0 } as unknown as HangarBay;
        const bayB = { name: 'B', row: 0, col: 2 } as unknown as HangarBay;
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        const hangar = {
            name: 'H1',
            grid: { rows: 1, cols: 3, bays: [bayA, bayB] },
        } as unknown as Hangar;
        checkAdjacencyConsistency(hangar, accept);
        expect(calledWithCode(accept, 'SFR_NONGRID_ADJACENCY')).toBe(true);
    });

    test('explicit block omits a grid-neighbour → SFR_GRID_OVERRIDE warning', () => {
        const accept = mockAccept();
        // bayA (0,0) has grid-neighbours bayB (0,1) and bayC (1,0)
        // bayA's explicit block only lists bayB — bayC is silently overridden
        const bayA = { name: 'A', row: 0, col: 0 } as unknown as HangarBay;
        const bayB = { name: 'B', row: 0, col: 1 } as unknown as HangarBay;
        const bayC = { name: 'C', row: 1, col: 0 } as unknown as HangarBay;
        (bayA as any).adjacent = [{ ref: bayB }];   // explicit block, bayC absent
        (bayB as any).adjacent = [];
        (bayC as any).adjacent = [];
        const hangar = {
            name: 'H1',
            grid: { rows: 2, cols: 2, bays: [bayA, bayB, bayC] },
        } as unknown as Hangar;
        checkAdjacencyConsistency(hangar, accept);
        expect(calledWithCode(accept, 'SFR_GRID_OVERRIDE')).toBe(true);
    });

    test('explicit block lists all grid-neighbours → no warning', () => {
        const accept = mockAccept();
        // 1×2 grid: bayA (0,0), bayB (0,1) — bayA's only grid-neighbour is bayB
        const bayA = { name: 'A', row: 0, col: 0 } as unknown as HangarBay;
        const bayB = { name: 'B', row: 0, col: 1 } as unknown as HangarBay;
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [];
        const hangar = {
            name: 'H1',
            grid: { rows: 1, cols: 2, bays: [bayA, bayB] },
        } as unknown as Hangar;
        checkAdjacencyConsistency(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('8-connected: diagonal pair declared adjacent → no SFR_NONGRID_ADJACENCY', () => {
        const accept = mockAccept();
        // bayA (0,0), bayB (1,1) — diagonal, valid in 8-connected (Chebyshev distance 1)
        const bayA = { name: 'A', row: 0, col: 0 } as unknown as HangarBay;
        const bayB = { name: 'B', row: 1, col: 1 } as unknown as HangarBay;
        (bayA as any).adjacent = [{ ref: bayB }];
        (bayB as any).adjacent = [{ ref: bayA }];
        const hangar = {
            name: 'H1',
            grid: { rows: 2, cols: 2, adjacency: 8, bays: [bayA, bayB] },
        } as unknown as Hangar;
        checkAdjacencyConsistency(hangar, accept);
        expect(calledWithCode(accept, 'SFR_NONGRID_ADJACENCY')).toBe(false);
    });
});
