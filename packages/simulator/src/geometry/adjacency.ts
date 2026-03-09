import type { Hangar } from '../../../language/out/generated/ast.js';
import { buildBayAdjacencyGraph } from '../../../language/out/bay-adjacency.js';

export type { BayAdjacencyResult } from '../../../language/out/bay-adjacency.js';

/**
 * Builds a bidirectional adjacency map for all bays in a hangar.
 *
 * Delegates to the shared `buildBayAdjacencyGraph` from the language package,
 * which uses a coordinate-to-bay map for O(1) neighbour lookups.
 *
 * @param hangar - The hangar whose bay grid is inspected.
 * @returns An object containing:
 *   - `adjacency`  — map from bay name → set of adjacent bay names (bidirectional).
 *   - `metadata`   — diagnostic counters: whether grid coords were present, and how
 *                    many edges came from each source (`gridEdges`, `explicitEdges`).
 */
export function buildAdjacencyGraph(hangar: Hangar) {
    return buildBayAdjacencyGraph(hangar.grid);
}
