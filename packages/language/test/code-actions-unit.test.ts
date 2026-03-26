/**
 * Unit tests for the pure-algorithm helpers in AirfieldCodeActionProvider (L11).
 *
 * The two methods under test — findBridgingBays and findAdjacentCandidateBays —
 * are private, so they are accessed via `(provider as any)`. No Langium runtime
 * is needed; the only inputs are plain strings and a Map<string, Set<string>>.
 */
import { describe, expect, test, beforeEach } from 'vitest';
import { AirfieldCodeActionProvider } from '../src/airfield-code-actions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an adjacency map from an edge list (bidirectional). */
function mkAdj(edges: [string, string][]): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    const ensure = (n: string) => { if (!adj.has(n)) adj.set(n, new Set()); return adj.get(n)!; };
    for (const [a, b] of edges) {
        ensure(a).add(b);
        ensure(b).add(a);
    }
    return adj;
}

let provider: AirfieldCodeActionProvider;

beforeEach(() => {
    provider = new AirfieldCodeActionProvider();
});

// Shorthand to call private methods
function bridging(assigned: string[], adj: Map<string, Set<string>>): string[] {
    return (provider as any).findBridgingBays(assigned, adj);
}

function candidates(
    assigned: string[],
    adj: Map<string, Set<string>>,
    all: string[],
    count: number
): string[] {
    return (provider as any).findAdjacentCandidateBays(assigned, adj, all, count);
}

// ---------------------------------------------------------------------------
// findBridgingBays
// ---------------------------------------------------------------------------

describe('findBridgingBays', () => {
    test('single assigned bay → guard returns empty', () => {
        const adj = mkAdj([['A', 'B']]);
        expect(bridging(['A'], adj)).toEqual([]);
    });

    test('two directly adjacent bays → already contiguous, returns empty', () => {
        // A—B, assigned = [A, B]: componentB is empty → no bridge needed
        const adj = mkAdj([['A', 'B']]);
        expect(bridging(['A', 'B'], adj)).toEqual([]);
    });

    test('linear chain A—B—C, assigned=[A,C], B is bridge', () => {
        // A and C are not directly connected; B bridges them
        const adj = mkAdj([['A', 'B'], ['B', 'C']]);
        expect(bridging(['A', 'C'], adj)).toEqual(['B']);
    });

    test('longer chain A—B—C—D, assigned=[A,D], returns intermediates [B,C]', () => {
        const adj = mkAdj([['A', 'B'], ['B', 'C'], ['C', 'D']]);
        const result = bridging(['A', 'D'], adj);
        // Path goes A → B → C → D; unassigned intermediates are B, C
        expect(result).toEqual(['B', 'C']);
    });

    test('two components with no path between them → returns empty', () => {
        // A—B  C—D (no link between groups)
        const adj = mkAdj([['A', 'B'], ['C', 'D']]);
        expect(bridging(['A', 'C'], adj)).toEqual([]);
    });

    test('three assigned bays in a row: A—B—C all assigned → already contiguous', () => {
        const adj = mkAdj([['A', 'B'], ['B', 'C']]);
        // All three are assigned and form a single component
        expect(bridging(['A', 'B', 'C'], adj)).toEqual([]);
    });

    test('two assigned components, bridge found through unassigned intermediates', () => {
        // Grid: A—X—Y—B, assigned=[A,B]; X and Y are unassigned bridges
        const adj = mkAdj([['A', 'X'], ['X', 'Y'], ['Y', 'B']]);
        expect(bridging(['A', 'B'], adj)).toEqual(['X', 'Y']);
    });

    test('assigned bays already in the same component even with extra nodes', () => {
        // Star topology: A—center, B—center, C—center; assigned=[A,B] → both reach center
        // But A and B are not directly adjacent; however they share center as intermediate
        // Since center is unassigned, it should bridge them
        const adj = mkAdj([['A', 'center'], ['B', 'center'], ['C', 'center']]);
        const result = bridging(['A', 'B'], adj);
        expect(result).toEqual(['center']);
    });
});

// ---------------------------------------------------------------------------
// findAdjacentCandidateBays
// ---------------------------------------------------------------------------

describe('findAdjacentCandidateBays', () => {
    test('count=0 → returns empty immediately', () => {
        const adj = mkAdj([['A', 'B']]);
        expect(candidates(['A'], adj, ['A', 'B'], 0)).toEqual([]);
    });

    test('no unassigned adjacent bays → returns empty', () => {
        // A is assigned, B is also assigned, no others
        const adj = mkAdj([['A', 'B']]);
        expect(candidates(['A', 'B'], adj, ['A', 'B'], 1)).toEqual([]);
    });

    test('one adjacent unassigned bay, count=1 → returns that bay', () => {
        // A(assigned)—B(unassigned)
        const adj = mkAdj([['A', 'B']]);
        expect(candidates(['A'], adj, ['A', 'B'], 1)).toEqual(['B']);
    });

    test('count=2, two direct neighbours available → returns both', () => {
        // center(assigned)—B, center—C
        const adj = mkAdj([['center', 'B'], ['center', 'C']]);
        const result = candidates(['center'], adj, ['center', 'B', 'C'], 2);
        expect(result).toHaveLength(2);
        expect(result).toContain('B');
        expect(result).toContain('C');
    });

    test('count=1, two direct neighbours available → returns only 1', () => {
        const adj = mkAdj([['A', 'B'], ['A', 'C']]);
        const result = candidates(['A'], adj, ['A', 'B', 'C'], 1);
        expect(result).toHaveLength(1);
    });

    test('BFS outward: count=2, only 1 direct neighbour → expands to second layer', () => {
        // A(assigned)—B—C; B is layer 1, C is layer 2
        const adj = mkAdj([['A', 'B'], ['B', 'C']]);
        const result = candidates(['A'], adj, ['A', 'B', 'C'], 2);
        expect(result).toEqual(['B', 'C']);
    });

    test('already assigned bays not returned as candidates', () => {
        // A(assigned)—B(assigned)—C(unassigned)
        const adj = mkAdj([['A', 'B'], ['B', 'C']]);
        const result = candidates(['A', 'B'], adj, ['A', 'B', 'C'], 2);
        expect(result).toEqual(['C']);
    });

    test('isolated assigned bay with no adjacency → returns empty', () => {
        const adj = new Map<string, Set<string>>();  // no edges at all
        expect(candidates(['A'], adj, ['A', 'B'], 1)).toEqual([]);
    });
});
