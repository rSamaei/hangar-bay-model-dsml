/**
 * Shared bay adjacency graph builder.
 *
 * Single source of truth for building a bidirectional adjacency map from a
 * hangar's bay grid. Used by the language validators, feasibility engine,
 * code-action provider, and the simulator.
 *
 * Uses a coordinate-to-bay map for O(1) neighbour lookups instead of
 * scanning the full bay array per offset.
 */
import type { HangarBay } from './generated/ast.js';

export interface BayAdjacencyResult {
    adjacency: Map<string, Set<string>>;
    metadata: {
        gridDerived: boolean;
        explicitEdges: number;
        gridEdges: number;
    };
}

/**
 * Build a bidirectional adjacency map for all bays in a grid.
 *
 * Adjacency is derived from two independent sources, applied in order:
 *
 * 1. **Grid coordinates** (when the grid declares `rows` and `cols`):
 *    Bays with `row`/`col` attributes are connected to their neighbours
 *    based on the grid's connectivity mode (4-connected default, 8-connected
 *    when `adjacency === 8`).
 *
 * 2. **Explicit `adjacent` references** (always applied):
 *    Cross-references are merged bidirectionally — they only add edges,
 *    never remove grid-derived adjacency.
 *
 * @param grid - The bay grid to inspect (typically `hangar.grid`).
 */
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
