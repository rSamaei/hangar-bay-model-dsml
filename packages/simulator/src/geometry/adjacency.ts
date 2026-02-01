import type { Hangar } from '../../../language/out/generated/ast.js';

/**
 * Build adjacency graph for hangar bay grid
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
        for (const bay of hangar.grid.bays) {
            if (bay.row !== undefined && bay.col !== undefined) {
                const neighbors = [
                    { row: bay.row - 1, col: bay.col },
                    { row: bay.row + 1, col: bay.col },
                    { row: bay.row, col: bay.col - 1 },
                    { row: bay.row, col: bay.col + 1 }
                ];

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