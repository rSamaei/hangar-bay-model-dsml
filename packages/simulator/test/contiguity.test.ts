/**
 * Unit tests for checkContiguity().
 *
 * checkContiguity() operates on plain adjacency maps, so no Langium
 * runtime or AST nodes are required. Fixtures build adjacency maps
 * from edge lists directly.
 */
import { describe, expect, test } from 'vitest';
import { checkContiguity } from '../src/rules/contiguity.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a symmetric adjacency map from an edge list and a full node list. */
function mkAdjacency(edges: Array<[string, string]>, nodes: string[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const n of nodes) map.set(n, new Set());
    for (const [a, b] of edges) {
        map.get(a)?.add(b);
        map.get(b)?.add(a);
    }
    return map;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkContiguity', () => {
    test('empty bay list — ok (no contiguity required)', () => {
        const adj = mkAdjacency([], []);
        const result = checkContiguity([], adj);
        expect(result.ok).toBe(true);
        expect(result.ruleId).toBe('SFR16_CONTIGUITY');
    });

    test('single bay — always contiguous', () => {
        const adj = mkAdjacency([], ['Bay1']);
        const result = checkContiguity(['Bay1'], adj);
        expect(result.ok).toBe(true);
    });

    test('two adjacent bays — contiguous', () => {
        const adj = mkAdjacency([['Bay1', 'Bay2']], ['Bay1', 'Bay2']);
        const result = checkContiguity(['Bay1', 'Bay2'], adj);
        expect(result.ok).toBe(true);
        expect(result.message).toContain('contiguous');
    });

    test('two non-adjacent bays — not contiguous', () => {
        const adj = mkAdjacency([], ['Bay1', 'Bay2']);
        const result = checkContiguity(['Bay1', 'Bay2'], adj);
        expect(result.ok).toBe(false);
        expect(result.message).toContain('NOT contiguous');
    });

    test('three bays in a line — contiguous', () => {
        const adj = mkAdjacency([['Bay1', 'Bay2'], ['Bay2', 'Bay3']], ['Bay1', 'Bay2', 'Bay3']);
        const result = checkContiguity(['Bay1', 'Bay2', 'Bay3'], adj);
        expect(result.ok).toBe(true);
    });

    test('A and C assigned but B (bridge) missing — not contiguous', () => {
        // Bay1—Bay2—Bay3 in a line; only Bay1 and Bay3 assigned
        const adj = mkAdjacency([['Bay1', 'Bay2'], ['Bay2', 'Bay3']], ['Bay1', 'Bay2', 'Bay3']);
        const result = checkContiguity(['Bay1', 'Bay3'], adj);
        expect(result.ok).toBe(false);
        expect(result.evidence.unreachableBays).toContain('Bay3');
    });

    test('explicit-adjacency non-grid layout — contiguous when connected', () => {
        // L-shaped via explicit refs: BayA adj BayCorner, BayCorner adj BayB
        const adj = mkAdjacency([['BayA', 'BayCorner'], ['BayCorner', 'BayB']], ['BayA', 'BayCorner', 'BayB']);
        const result = checkContiguity(['BayA', 'BayCorner', 'BayB'], adj);
        expect(result.ok).toBe(true);
    });

    test('four-bay 2×2 grid, all four assigned — contiguous', () => {
        // B1 B2
        // B3 B4
        const adj = mkAdjacency(
            [['B1', 'B2'], ['B1', 'B3'], ['B2', 'B4'], ['B3', 'B4']],
            ['B1', 'B2', 'B3', 'B4']
        );
        const result = checkContiguity(['B1', 'B2', 'B3', 'B4'], adj);
        expect(result.ok).toBe(true);
    });

    test('evidence contains bayCount matching assigned set size', () => {
        const adj = mkAdjacency([['Bay1', 'Bay2']], ['Bay1', 'Bay2', 'Bay3']);
        const result = checkContiguity(['Bay1', 'Bay2', 'Bay3'], adj);
        expect(result.evidence.bayCount).toBe(3);
    });

    test('evidence reachableCount < bayCount when not contiguous', () => {
        const adj = mkAdjacency([], ['Bay1', 'Bay2', 'Bay3']);
        const result = checkContiguity(['Bay1', 'Bay2', 'Bay3'], adj);
        expect(result.ok).toBe(false);
        expect(result.evidence.reachableCount).toBeLessThan(result.evidence.bayCount);
    });
});

// ---------------------------------------------------------------------------
// Line 61: adjacency.get(current) ?? new Set() — empty adjacency map
// ---------------------------------------------------------------------------

describe('checkContiguity — empty adjacency map fires ?? new Set() fallback (line 61)', () => {
    test('adjacency map with no entries: get(current) returns undefined, ?? new Set() fires', () => {
        // BFS starts with 'Bay1', calls adjacency.get('Bay1') → undefined → ?? new Set()
        const emptyAdj = new Map<string, Set<string>>();
        const result = checkContiguity(['Bay1', 'Bay2'], emptyAdj);

        expect(result.ok).toBe(false);
        expect(result.evidence.reachableBays).toEqual(['Bay1']);
        expect(result.evidence.unreachableBays).toEqual(['Bay2']);
    });
});
