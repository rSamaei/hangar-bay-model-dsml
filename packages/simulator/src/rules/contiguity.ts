/**
 * SFR13: Check if bay set is contiguous (connected)
 */
export function checkContiguity(
    bayNames: string[],
    adjacency: Map<string, Set<string>>,
    adjacencyMetadata?: { gridDerived: boolean; explicitEdges: number; gridEdges: number }
): { ok: boolean; ruleId: string; message: string; evidence: any } {
    if (bayNames.length <= 1) {
        return {
            ok: true,
            ruleId: 'SFR13_CONTIGUITY',
            message: 'Single bay requires no contiguity check',
            evidence: { 
                bayNames, 
                bayCount: bayNames.length,
                adjacencySource: adjacencyMetadata
            }
        };
    }

    const selected = new Set(bayNames);
    const visited = new Set<string>();
    const queue = [bayNames[0]];
    visited.add(bayNames[0]);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adjacency.get(current) ?? new Set();

        for (const neighbor of neighbors) {
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
            adjacencySource: adjacencyMetadata ? {
                derivedFromGrid: adjacencyMetadata.gridDerived,
                explicitEdgesUsed: adjacencyMetadata.explicitEdges,
                gridEdgesUsed: adjacencyMetadata.gridEdges
            } : undefined
        }
    };
}