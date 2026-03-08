import type { Hangar } from '../../../language/out/generated/ast.js';

/**
 * Builds a bidirectional adjacency map for all bays in a hangar.
 *
 * Adjacency is derived from two independent sources, applied in order:
 *
 * **1. Grid coordinates** (when the hangar grid declares `rows` and `cols`):
 * Bays that carry `row`/`col` attributes are connected to their neighbours based on
 * the grid's connectivity mode:
 *   - 4-connected (default): horizontal and vertical neighbours only.
 *   - 8-connected (`adjacency 8` in the DSL): also includes diagonal neighbours.
 * Each bay visits all applicable offsets, so grid edges are naturally added in both
 * directions without explicit mirroring.
 *
 * **2. Explicit `adjacent` references** (always applied, regardless of grid coords):
 * Bays that declare an `adjacent { }` block in the DSL have those cross-references
 * merged into the map. These are always made bidirectional: if A declares B adjacent,
 * B is also added as adjacent to A. Explicit refs only ever add edges — they never
 * remove grid-derived adjacency.
 *
 * @param hangar - The hangar whose bay grid is inspected.
 * @returns An object containing:
 *   - `adjacency`  — map from bay name → set of adjacent bay names (bidirectional).
 *   - `metadata`   — diagnostic counters: whether grid coords were present, and how
 *                    many edges came from each source (`gridEdges`, `explicitEdges`).
 */
export function buildAdjacencyGraph(hangar: Hangar): {
    adjacency: Map<string, Set<string>>;
    metadata: {
        gridDerived: boolean;
        explicitEdges: number;
        gridEdges: number;
    }
} {
    const adjacency = new Map<string, Set<string>>();
    let explicitEdges = 0;
    let gridEdges = 0;
    
    for (const bay of hangar.grid.bays) {
        adjacency.set(bay.name, new Set());
    }

    const hasGridCoordinates = hangar.grid.rows !== undefined && 
                               hangar.grid.cols !== undefined;
    
    if (hasGridCoordinates) {
        const is8Connected = hangar.grid.adjacency === 8;
        const offsets = [
            { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
            { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
            ...(is8Connected ? [
                { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
                { dr: 1, dc: -1 }, { dr: 1, dc: 1 }
            ] : [])
        ];

        for (const bay of hangar.grid.bays) {
            if (bay.row !== undefined && bay.col !== undefined) {
                const neighbors = offsets.map(({ dr, dc }) => ({
                    row: bay.row! + dr,
                    col: bay.col! + dc
                }));

                for (const neighbor of neighbors) {
                    const adjacentBay = hangar.grid.bays.find(
                        b => b.row === neighbor.row && b.col === neighbor.col
                    );
                    if (adjacentBay) {
                        adjacency.get(bay.name)?.add(adjacentBay.name);
                        gridEdges++;
                    }
                }
            }
        }
    }

    for (const bay of hangar.grid.bays) {
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