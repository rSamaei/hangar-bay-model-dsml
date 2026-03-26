/**
 * Pure utility functions for querying AccessGraph structures.
 *
 * These are stateless helpers extracted from PlacementEngine to reduce
 * its size and improve testability.
 */

import type { Hangar } from '../../../language/out/generated/ast.js';
import {
    reachableNodes,
    type AccessGraph,
} from '../geometry/access.js';
import type { SimulationState } from './types.js';

/** Find the access-graph node ID for a bay by its name. */
export function findBayNodeId(graph: AccessGraph, bayName: string): string | undefined {
    for (const [id, node] of graph.nodes) {
        if (node.bayName === bayName) return id;
    }
    return undefined;
}

/** Check if a node is traversable (passable even when occupied). */
export function isTraversable(graph: AccessGraph, nodeId: string): boolean {
    return graph.nodes.get(nodeId)?.traversable === true;
}

/** Get access-graph node IDs for all doors with accessNode hooks. */
export function getDoorNodeIds(graph: AccessGraph, hangar: Hangar): string[] {
    const ids: string[] = [];
    for (const door of hangar.doors) {
        const an = door.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) ids.push(an.name);
    }
    return ids;
}

/** Get access-graph node IDs for bays by name. */
export function getBayNodeIds(graph: AccessGraph, bayNames: string[]): string[] {
    const ids: string[] = [];
    for (const bayName of bayNames) {
        const nodeId = findBayNodeId(graph, bayName);
        if (nodeId) ids.push(nodeId);
    }
    return ids;
}

/** Find an exit door name from the reachable set. */
export function findExitDoor(
    graph: AccessGraph,
    hangar: Hangar,
    reachable: Set<string>,
): string {
    for (const door of hangar.doors) {
        const an = door.accessNode?.ref;
        if (an && reachable.has(an.name)) return door.name;
    }
    return hangar.doors[0]?.name ?? '';
}

/**
 * Inline corridor-fit check using the pre-built access graph.
 * Returns list of node IDs blocked by narrow corridors (empty = OK).
 */
export function checkCorridorFitDirect(
    graph: AccessGraph,
    doorNodeIds: string[],
    bayNodeIds: string[],
    wingspanEff: number,
): string[] {
    const reachableWithConstraint = reachableNodes(
        doorNodeIds, graph, new Set(), wingspanEff,
    );
    const reachableNoConstraint = reachableNodes(doorNodeIds, graph);

    return bayNodeIds.filter(
        id => !reachableWithConstraint.has(id) && reachableNoConstraint.has(id),
    );
}

/**
 * Build the set of blocked access-graph node IDs at the current time.
 * Occupied bays whose access-graph node is not traversable are blocked.
 * Bays in `excludeBayNames` are excluded (the aircraft's own bays).
 */
export function computeBlockedNodes(
    graph: AccessGraph,
    state: SimulationState,
    hangarName: string,
    excludeBayNames: Set<string>,
): Set<string> {
    const blocked = new Set<string>();
    const now = state.currentTime;

    for (const [key, info] of state.occupiedBays) {
        if (info.hangarName !== hangarName) continue;
        if (info.startTime > now || info.endTime <= now) continue;
        const bayName = key.substring(hangarName.length + 2);
        if (excludeBayNames.has(bayName)) continue;

        const nodeId = findBayNodeId(graph, bayName);
        if (nodeId && !isTraversable(graph, nodeId)) {
            blocked.add(nodeId);
        }
    }

    return blocked;
}

/**
 * Identify induction IDs whose occupied bays are in the blocked set.
 */
export function identifyBlockers(
    graph: AccessGraph,
    state: SimulationState,
    hangarName: string,
    blocked: Set<string>,
    excludeBayNames: string[],
): string[] {
    const excludeSet = new Set(excludeBayNames);
    const blockerIds = new Set<string>();

    for (const [key, info] of state.occupiedBays) {
        if (info.hangarName !== hangarName) continue;
        const bayName = key.substring(hangarName.length + 2);
        if (excludeSet.has(bayName)) continue;

        const nodeId = findBayNodeId(graph, bayName);
        if (nodeId && blocked.has(nodeId)) {
            blockerIds.add(info.inductionId);
        }
    }

    return [...blockerIds];
}
