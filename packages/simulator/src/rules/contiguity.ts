export type ContiguityEvidence = {
    bayNames: string[];
    bayCount: number;
    reachableCount: number;
    connected: boolean;
    reachableBays: string[];
    unreachableBays: string[];
    adjacencySource?: {
        derivedFromGrid: boolean;
        explicitEdgesUsed: number;
        gridEdgesUsed: number;
    };
};

/**
 * SFR13: Checks whether a set of assigned bays forms a single connected component.
 *
 * Uses BFS from the first bay, restricted to the assigned set. If all assigned bays
 * are reached, the set is contiguous. If any remain unreachable, they form a
 * disconnected island.
 *
 * @param bayNames          - Names of the assigned bays to check.
 * @param adjacency         - Bidirectional adjacency map for the hangar (from `buildAdjacencyGraph`).
 * @param adjacencyMetadata - Optional diagnostics from `buildAdjacencyGraph`, included in evidence.
 */
export function checkContiguity(
    bayNames: string[],
    adjacency: Map<string, Set<string>>,
    adjacencyMetadata?: { gridDerived: boolean; explicitEdges: number; gridEdges: number }
): { ok: boolean; ruleId: string; message: string; evidence: ContiguityEvidence } {
    const adjacencySource = adjacencyMetadata ? {
        derivedFromGrid: adjacencyMetadata.gridDerived,
        explicitEdgesUsed: adjacencyMetadata.explicitEdges,
        gridEdgesUsed: adjacencyMetadata.gridEdges
    } : undefined;

    if (bayNames.length <= 1) {
        return {
            ok: true,
            ruleId: 'SFR13_CONTIGUITY',
            message: 'Single bay requires no contiguity check',
            evidence: {
                bayNames,
                bayCount: bayNames.length,
                reachableCount: bayNames.length,
                connected: true,
                reachableBays: [...bayNames],
                unreachableBays: [],
                adjacencySource
            }
        };
    }

    const selected = new Set(bayNames);
    const visited = new Set<string>();
    const queue = [bayNames[0]];
    visited.add(bayNames[0]);

    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency.get(current) ?? new Set()) {
            if (selected.has(neighbor) && !visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }

    const ok = visited.size === selected.size;

    return {
        ok,
        ruleId: 'SFR13_CONTIGUITY',
        message: ok
            ? `Bay set [${bayNames.join(', ')}] is contiguous`
            : `Bay set [${bayNames.join(', ')}] is NOT contiguous: only ${visited.size}/${selected.size} reachable`,
        evidence: {
            bayNames,
            bayCount: bayNames.length,
            reachableCount: visited.size,
            connected: ok,
            reachableBays: Array.from(visited),
            unreachableBays: bayNames.filter(b => !visited.has(b)),
            adjacencySource
        }
    };
}
