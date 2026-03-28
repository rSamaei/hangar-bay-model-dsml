import type { HangarBay } from './generated/ast.js';

export interface BayAdjacencyResult {
    adjacency: Map<string, Set<string>>;
    metadata: {
        gridDerived: boolean;
        explicitEdges: number;
        gridEdges: number;
    };
}

/** Build a bidirectional adjacency map from grid coordinates and explicit references. */
export function buildBayAdjacencyGraph(grid: {
    rows?: number;
    cols?: number;
    adjacency?: number;
    bays: HangarBay[];
}): BayAdjacencyResult {
    const adjacency = new Map<string, Set<string>>();
    let explicitEdges = 0;
    let gridEdges = 0;

    for (const bay of grid.bays) {
        adjacency.set(bay.name, new Set());
    }

    const hasGridCoordinates = grid.rows !== undefined && grid.cols !== undefined;

    if (hasGridCoordinates) {
        const is8Connected = grid.adjacency === 8;
        const offsets = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
            ...(is8Connected ? [
                { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
                { dr: 1, dc: -1 }, { dr: 1, dc: 1 }
            ] : [])
        ];

        // Build coordinate map for O(1) neighbour lookups
        const bayByCoord = new Map<string, HangarBay>();
        for (const bay of grid.bays) {
            if (bay.row !== undefined && bay.col !== undefined) {
                bayByCoord.set(`${bay.row},${bay.col}`, bay);
            }
        }

        for (const bay of grid.bays) {
            if (bay.row !== undefined && bay.col !== undefined) {
                for (const { dr, dc } of offsets) {
                    const nb = bayByCoord.get(`${bay.row + dr},${bay.col + dc}`);
                    if (nb) {
                        adjacency.get(bay.name)?.add(nb.name);
                        gridEdges++;
                    }
                }
            }
        }
    }

    for (const bay of grid.bays) {
        if (bay.adjacent) {
            for (const adj of bay.adjacent) {
                const adjName = adj.ref?.name;
                if (adjName) {
                    adjacency.get(bay.name)?.add(adjName);
                    adjacency.get(adjName)?.add(bay.name);
                    explicitEdges++;
                }
            }
        }
    }

    return {
        adjacency,
        metadata: {
            gridDerived: hasGridCoordinates,
            explicitEdges,
            gridEdges
        }
    };
}
