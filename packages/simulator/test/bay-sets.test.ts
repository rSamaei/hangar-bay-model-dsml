/**
 * Unit tests for findConnectedSetsOfSize() and findSuitableBaySets().
 *
 * Both functions operate on structural TypeScript mocks — no Langium runtime
 * required. findConnectedSetsOfSize() is tested with manually-constructed
 * adjacency maps; findSuitableBaySets() drives the full pipeline including
 * adjacency derivation, contiguity checks, and bay-fit checks.
 */
import { describe, expect, test } from 'vitest';
import { findConnectedSetsOfSize, findSuitableBaySets } from '../src/search/bay-sets.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function ref<T extends { name: string }>(val: T) {
    return { ref: val, $refText: val.name };
}

function mkAircraft(name: string, wingspan: number, length: number, height: number) {
    return { name, wingspan, length, height, tailHeight: height, $type: 'AircraftType' };
}

function mkBay(
    name: string,
    opts: { width?: number; depth?: number; height?: number; row?: number; col?: number; adjacent?: any[] } = {}
) {
    return {
        name,
        width: opts.width ?? 12,
        depth: opts.depth ?? 10,
        height: opts.height ?? 3,
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

/** Build a linear adjacency map for an ordered list of bays. */
function linearAdjacency(bays: { name: string }[]): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    for (const b of bays) adj.set(b.name, new Set());
    for (let i = 0; i < bays.length - 1; i++) {
        adj.get(bays[i].name)!.add(bays[i + 1].name);
        adj.get(bays[i + 1].name)!.add(bays[i].name);
    }
    return adj;
}

/** Build an isolated adjacency map (no edges). */
function isolatedAdjacency(bays: { name: string }[]): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    for (const b of bays) adj.set(b.name, new Set());
    return adj;
}

// Standard 4-bay row with grid coordinates — used by findSuitableBaySets tests
function makeFourBayRow() {
    const bays = [
        mkBay('Bay1', { row: 0, col: 0 }),
        mkBay('Bay2', { row: 0, col: 1 }),
        mkBay('Bay3', { row: 0, col: 2 }),
        mkBay('Bay4', { row: 0, col: 3 }),
    ];
    return { bays, hangar: mkHangar(bays, 1, 4) };
}

// ---------------------------------------------------------------------------
// Tests: findConnectedSetsOfSize
// ---------------------------------------------------------------------------

describe('findConnectedSetsOfSize — 4-bay linear row', () => {
    const bays = [
        { name: 'Bay1' }, { name: 'Bay2' }, { name: 'Bay3' }, { name: 'Bay4' }
    ] as any[];
    const adj = linearAdjacency(bays);

    test('size=1 — returns all 4 single-bay sets', () => {
        const result = findConnectedSetsOfSize(bays, adj, 1);
        expect(result).toHaveLength(4);
        const names = result.map(s => s[0].name).sort();
        expect(names).toEqual(['Bay1', 'Bay2', 'Bay3', 'Bay4']);
    });

    test('size=2 — returns 3 contiguous pairs', () => {
        const result = findConnectedSetsOfSize(bays, adj, 2);
        expect(result).toHaveLength(3);
        const sigs = result.map(s => s.map(b => b.name).sort().join(',')).sort();
        expect(sigs).toEqual(['Bay1,Bay2', 'Bay2,Bay3', 'Bay3,Bay4']);
    });

    test('size=4 — returns exactly one set containing all bays', () => {
        const result = findConnectedSetsOfSize(bays, adj, 4);
        expect(result).toHaveLength(1);
        expect(result[0].map(b => b.name).sort()).toEqual(['Bay1', 'Bay2', 'Bay3', 'Bay4']);
    });

    test('size exceeds number of bays — returns empty', () => {
        const result = findConnectedSetsOfSize(bays, adj, 5);
        expect(result).toHaveLength(0);
    });
});

describe('findConnectedSetsOfSize — edge cases', () => {
    test('disconnected bays, size=2 — returns empty', () => {
        const bays = [{ name: 'Bay1' }, { name: 'Bay2' }] as any[];
        const adj = isolatedAdjacency(bays);
        const result = findConnectedSetsOfSize(bays, adj, 2);
        expect(result).toHaveLength(0);
    });

    test('deduplication — same unordered set returned exactly once', () => {
        // 2-bay layout: Bay1 — Bay2
        const bays = [{ name: 'Bay1' }, { name: 'Bay2' }] as any[];
        const adj = linearAdjacency(bays);
        const result = findConnectedSetsOfSize(bays, adj, 2);
        // [Bay1,Bay2] and [Bay2,Bay1] must be deduplicated to one entry
        expect(result).toHaveLength(1);
        expect(result[0].map(b => b.name).sort()).toEqual(['Bay1', 'Bay2']);
    });
});

// ---------------------------------------------------------------------------
// Tests: findSuitableBaySets (end-to-end)
// ---------------------------------------------------------------------------

describe('findSuitableBaySets — grid-based layout', () => {
    test('1×4 grid, aircraft fits in 1 bay — all 4 single-bay sets returned', () => {
        const { hangar } = makeFourBayRow();
        // CESSNA-like: wingspan=11, fits in bay width=12
        const aircraft = mkAircraft('Cessna', 11, 8, 2.7);
        const { baySets } = findSuitableBaySets(aircraft as any, hangar as any);
        expect(baySets).toHaveLength(4);
        for (const set of baySets) expect(set).toHaveLength(1);
    });

    test('1×4 grid, aircraft needs 2 bays — 3 contiguous pairs returned', () => {
        const { hangar } = makeFourBayRow();
        // wingspan=13 > bay width=12, needs 2 bays; sumWidth=24 ≥ 13
        const aircraft = mkAircraft('Medium', 13, 8, 2.7);
        const { baySets } = findSuitableBaySets(aircraft as any, hangar as any);
        expect(baySets).toHaveLength(3);
        for (const set of baySets) expect(set).toHaveLength(2);
    });

    test('1×4 grid, aircraft needs all 4 bays — 1 set returned', () => {
        const { hangar } = makeFourBayRow();
        // wingspan=37: ceil(37/12)=4; sumWidth=48 ≥ 37
        const aircraft = mkAircraft('Wide', 37, 8, 2.7);
        const { baySets } = findSuitableBaySets(aircraft as any, hangar as any);
        expect(baySets).toHaveLength(1);
        expect(baySets[0]).toHaveLength(4);
    });

    test('aircraft too wide — all bays tried but wingspan unachievable, bay-fit rejection', () => {
        const { hangar } = makeFourBayRow();
        // wingspan=200 > sumWidth=48 (4×12m). Greedy: all 4 bays → baysRequired=4.
        // Scheduler enumerates the single 4-bay set; bay-fit fails → rejection recorded.
        const aircraft = mkAircraft('Massive', 200, 8, 2.7);
        const { baySets, rejections } = findSuitableBaySets(aircraft as any, hangar as any);
        expect(baySets).toHaveLength(0);
        expect(rejections.length).toBeGreaterThan(0); // bay-fit rejection for the 4-bay candidate
    });

    test('aircraft depth exceeds bay depth — all sets rejected', () => {
        const { hangar } = makeFourBayRow();
        // wingspan=11 (1 bay needed), but length=25 > bay depth=10
        const aircraft = mkAircraft('Long', 11, 25, 2.7);
        const { baySets, rejections } = findSuitableBaySets(aircraft as any, hangar as any);
        expect(baySets).toHaveLength(0);
        expect(rejections.length).toBeGreaterThan(0);
    });

    test('derivedProps includes baysRequired derived from wingspan', () => {
        const { hangar } = makeFourBayRow();
        const aircraft = mkAircraft('Cessna', 11, 8, 2.7);
        const { derivedProps } = findSuitableBaySets(aircraft as any, hangar as any);
        expect(derivedProps).toHaveProperty('baysRequired', 1);
        expect(derivedProps).toHaveProperty('adjacencyMetadata');
    });

    test('results are sorted: shortest sets first, then alphabetically', () => {
        const { hangar } = makeFourBayRow();
        const aircraft = mkAircraft('Medium', 13, 8, 2.7);
        const { baySets } = findSuitableBaySets(aircraft as any, hangar as any);
        // All sets are same length (2); check alphabetical ordering of set signatures
        const sigs = baySets.map(s => s.map(b => b.name).sort().join(','));
        const sorted = [...sigs].sort();
        expect(sigs).toEqual(sorted);
    });
});

describe('findSuitableBaySets — explicit adjacency layout', () => {
    test('4-bay chain via explicit adjacent refs — finds contiguous 2-bay sets', () => {
        // Build chain: Bay1 → Bay2 → Bay3 → Bay4 via explicit adjacent
        const bay4 = mkBay('Bay4');
        const bay3 = mkBay('Bay3', { adjacent: [ref(bay4)] });
        const bay2 = mkBay('Bay2', { adjacent: [ref(bay3)] });
        const bay1 = mkBay('Bay1', { adjacent: [ref(bay2)] });
        const bays = [bay1, bay2, bay3, bay4];
        // No rows/cols → explicit adjacency only
        const hangar = mkHangar(bays);
        const aircraft = mkAircraft('Medium', 13, 8, 2.7);

        const { baySets } = findSuitableBaySets(aircraft as any, hangar as any);
        expect(baySets).toHaveLength(3);
        const sigs = baySets.map(s => s.map(b => b.name).sort().join(',')).sort();
        expect(sigs).toContain('Bay1,Bay2');
        expect(sigs).toContain('Bay2,Bay3');
        expect(sigs).toContain('Bay3,Bay4');
    });
});

// ---------------------------------------------------------------------------
// Tests: minBaysOverride parameter
// ---------------------------------------------------------------------------

describe('findSuitableBaySets — minBaysOverride raises effective minimum', () => {

    /**
     * 4-bay row (each 12 m wide). Aircraft wingspan 11 m → baysRequired = 1.
     * With minBaysOverride = 3, the search starts at size 3.
     * All 2-bay sets are skipped; only 3-bay sets (and above) are considered.
     */
    test('minBaysOverride=3 skips 1- and 2-bay sets, returns 3-bay sets only', () => {
        const { bays, hangar } = makeFourBayRow();
        const aircraft = mkAircraft('Cessna', 11, 8.3, 2.7);

        const { baySets, derivedProps } = findSuitableBaySets(
            aircraft as any, hangar as any, undefined, 5, 'lateral', 3
        );

        // baysRequired from geometry = 1, but effectiveMin = max(1, 3) = 3
        expect(derivedProps.baysRequired).toBe(1);
        expect(derivedProps.effectiveMin).toBe(3);
        // All returned sets must have at least 3 bays
        expect(baySets.every(s => s.length >= 3)).toBe(true);
        expect(baySets.length).toBeGreaterThan(0);
    });

    /**
     * minBaysOverride lower than derived minimum — derived takes precedence.
     * Aircraft wingspan 25 m, each bay 12 m → baysRequired = 3 (12+12+12=36>=25).
     * With minBaysOverride = 1, effectiveMin = max(3, 1) = 3.
     */
    test('minBaysOverride below derived minimum — derived minimum is used', () => {
        const { bays, hangar } = makeFourBayRow();
        const aircraft = mkAircraft('Wide', 25, 8.3, 2.7);

        const { derivedProps } = findSuitableBaySets(
            aircraft as any, hangar as any, undefined, 5, 'lateral', 1
        );

        // derived = 3 (12+12+12 >= 25), override = 1, effectiveMin = 3
        expect(derivedProps.baysRequired).toBe(3);
        expect(derivedProps.effectiveMin).toBe(3);
    });
});
