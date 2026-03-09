import type { AircraftType, Hangar, HangarBay, ClearanceEnvelope } from '../../../language/out/generated/ast.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import { calculateBaysRequired } from '../geometry/bays-required.js';
import { buildAdjacencyGraph } from '../geometry/adjacency.js';
import { checkBaySetFitEffective, type BayFitResult } from '../rules/bay-fit.js';

export interface BaySetsSearchDerivedProps {
    baysRequired: number;
    bayWidthsUsed: number[];
    ruleId: string;
    evidence: Record<string, unknown>;
    effectiveMin: number;
    adjacencyMetadata: {
        gridDerived: boolean;
        explicitEdges: number;
        gridEdges: number;
    };
}

/**
 * Finds all connected bay sets of exactly `targetSize` bays that can be reached
 * via adjacency from any starting bay in `allBays`.
 *
 * Uses BFS-based enumeration: each search state is a growing set of bays, expanded
 * by visiting adjacency neighbors of the most recently added bay. A canonical
 * signature (sorted bay names joined by commas) deduplicates sets that are reached
 * via different traversal orders.
 *
 * Because expansion only follows adjacency edges, every returned set is guaranteed
 * to be connected — no separate contiguity check is required on the results.
 *
 * @param allBays    - All bays in the hangar.
 * @param adjacency  - Bidirectional adjacency map (from `buildAdjacencyGraph`).
 * @param targetSize - Exact number of bays each returned set must contain.
 */
export function findConnectedSetsOfSize(
    allBays: HangarBay[],
    adjacency: Map<string, Set<string>>,
    targetSize: number
): HangarBay[][] {
    const bayByName = new Map(allBays.map(b => [b.name, b]));
    const results: HangarBay[][] = [];
    const seen = new Set<string>();

    const visited = new Set<string>();
    const current: HangarBay[] = [];

    const dfs = () => {
        if (current.length === targetSize) {
            const signature = current.map(b => b.name).sort().join(',');
            if (!seen.has(signature)) {
                seen.add(signature);
                results.push([...current]);
            }
            return;
        }

        // Expand from all bays in the current set (not just last) to find all
        // connected supersets. Using a collected neighbor set avoids duplicates.
        const neighbors = new Set<string>();
        for (const bay of current) {
            for (const n of adjacency.get(bay.name) ?? []) {
                if (!visited.has(n)) neighbors.add(n);
            }
        }

        for (const neighborName of neighbors) {
            const neighborBay = bayByName.get(neighborName);
            if (neighborBay) {
                visited.add(neighborName);
                current.push(neighborBay);
                dfs();
                current.pop();
                visited.delete(neighborName);
            }
        }
    };

    for (const startBay of allBays) {
        visited.clear();
        visited.add(startBay.name);
        current.length = 0;
        current.push(startBay);
        dfs();
    }

    return results;
}

/**
 * Finds all bay sets that are both geometrically connected and large enough to
 * physically accommodate an aircraft.
 *
 * The search proceeds as follows:
 * 1. Compute `effectiveMin` — the minimum number of bays needed to cover the
 *    aircraft's effective span (`baysRequired` from `calculateBaysRequired`,
 *    raised to `minBaysOverride` if that is larger).
 * 2. Enumerate all connected sets of size `effectiveMin` using `findConnectedSetsOfSize`.
 *    If none exist at that size, try size+1, size+2, … up to `maxBaysPerSet`.
 *    Stop as soon as any candidates are found (prefer smallest viable sets).
 * 3. Run a bay-fit check (SFR12) on each candidate. Sets that pass are returned
 *    in `baySets`; those that fail are recorded in `rejections`.
 * 4. Results are sorted: fewest bays first, then alphabetically by bay-name signature.
 *
 * @param aircraft        - Aircraft to schedule.
 * @param hangar          - Target hangar.
 * @param clearance       - Optional clearance envelope to apply.
 * @param maxBaysPerSet   - Upper bound on set size to consider (default 5).
 * @param span            - Span direction for fit checks: `'lateral'` (default) or `'longitudinal'`.
 * @param minBaysOverride - Explicit minimum bay count (e.g. from `requires N bays` in the DSL).
 */
export function findSuitableBaySets(
    aircraft: AircraftType,
    hangar: Hangar,
    clearance?: ClearanceEnvelope,
    maxBaysPerSet: number = 5,
    span: string = 'lateral',
    minBaysOverride?: number
): { baySets: HangarBay[][]; rejections: BayFitResult[]; derivedProps: BaySetsSearchDerivedProps } {
    const effectiveDims = calculateEffectiveDimensions(aircraft, clearance);
    const baysRequiredInfo = calculateBaysRequired(effectiveDims, hangar, span);
    const { adjacency, metadata } = buildAdjacencyGraph(hangar);

    const effectiveMin = Math.max(baysRequiredInfo.baysRequired, minBaysOverride ?? 0);

    // Find the smallest connected sets that meet the minimum bay count.
    const candidates: HangarBay[][] = [];
    for (let size = effectiveMin; size <= Math.min(maxBaysPerSet, hangar.grid.bays.length); size++) {
        candidates.push(...findConnectedSetsOfSize(hangar.grid.bays, adjacency, size));
        if (candidates.length > 0) break;
    }

    // Filter candidates by bay-fit check (SFR12).
    // findConnectedSetsOfSize guarantees connectivity, so no contiguity check is needed.
    const baySets: HangarBay[][] = [];
    const rejections: BayFitResult[] = [];
    for (const baySet of candidates) {
        const fitCheck = checkBaySetFitEffective(effectiveDims, baySet, aircraft.name, span);
        if (fitCheck.ok) {
            baySets.push(baySet);
        } else {
            rejections.push(fitCheck);
        }
    }

    // Pre-compute signatures to avoid re-sorting bay names on every comparator call
    const sigMap = new Map<HangarBay[], string>();
    for (const set of baySets) {
        sigMap.set(set, set.map(b => b.name).sort().join(','));
    }
    baySets.sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length;
        return sigMap.get(a)!.localeCompare(sigMap.get(b)!);
    });

    return {
        baySets,
        rejections,
        derivedProps: {
            ...baysRequiredInfo,
            effectiveMin,
            adjacencyMetadata: metadata
        }
    };
}
