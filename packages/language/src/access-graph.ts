import type { Hangar, Induction, AccessPath } from './generated/ast.js';

// ============================================================================
// Plain-data graph types (no Langium Reference<T> — designed for testability)
// ============================================================================

export interface AccessGraphNode {
    id: string;
    /** Name of the HangarDoor whose accessNode hook points here (if any). */
    doorName?: string;
    /** Name of the HangarBay whose accessNode hook points here (if any). */
    bayName?: string;
    /** Corridor width constraint copied from AccessNode.width. Undefined = unconstrained. */
    width?: number;
    /** When true, this bay node remains passable even when occupied by a concurrent induction. */
    traversable?: boolean;
}

export interface AccessGraphEdge {
    from: string;
    to: string;
    bidirectional: boolean;
}

export interface AccessGraph {
    nodes: Map<string, AccessGraphNode>;
    edges: AccessGraphEdge[];
}

// ============================================================================
// Result types
// ============================================================================

export interface BlockingBayInfo {
    bayName: string;
    occupiedByInductionId?: string;
    occupiedByAircraft: string;
    overlapStart: string;
    overlapEnd: string;
}

export interface ReachabilityResult {
    ok: boolean;
    /**
     * True when the check could not be performed because the access graph
     * has not been modelled for this hangar (e.g. no accessNode hooks on
     * doors or bays). A skipped result is always ok=true.
     */
    skipped: boolean;
    ruleId: string;
    message: string;
    evidence: {
        inductionId?: string;
        hangarName: string;
        unreachableBays: string[];
        blockingBays: BlockingBayInfo[];
        checkedFromDoors: string[];
    };
}

// ============================================================================
// Access graph builder  (Langium AST → plain data)
// ============================================================================

/**
 * Build a plain-data access graph for the given hangar.
 *
 * Strategy:
 *  1. Collect every AccessNode name referenced by a door or bay in the hangar.
 *  2. Find every AccessPath that contains at least one of those nodes.
 *  3. Include ALL nodes and links from those paths.
 *  4. Annotate each node with the door / bay it is hooked to.
 *
 * Returns null when no door or bay in the hangar carries an accessNode
 * reference (i.e. the access graph has simply not been modelled).
 */
export function buildAccessGraph(
    hangar: Hangar,
    accessPaths: AccessPath[]
): AccessGraph | null {
    const nodes = new Map<string, AccessGraphNode>();
    const edges: AccessGraphEdge[] = [];

    // --- Step 1: gather AccessNode names referenced by this hangar ----------
    const hangarNodeNames = new Set<string>();
    for (const door of hangar.doors) {
        const an = door.accessNode?.ref;
        if (an) hangarNodeNames.add(an.name);
    }
    for (const bay of hangar.grid.bays) {
        const an = bay.accessNode?.ref;
        if (an) hangarNodeNames.add(an.name);
    }
    if (hangarNodeNames.size === 0) return null;

    // --- Step 2 & 3: pull in all nodes + links from relevant paths -----------
    const relevantPaths = accessPaths.filter(ap =>
        ap.nodes.some(n => hangarNodeNames.has(n.name))
    );
    for (const ap of relevantPaths) {
        for (const node of ap.nodes) {
            if (!nodes.has(node.name)) {
                nodes.set(node.name, { id: node.name, width: node.width });
            }
        }
        for (const link of ap.links) {
            const from = link.from?.ref;
            const to   = link.to?.ref;
            if (!from || !to) continue;
            edges.push({ from: from.name, to: to.name, bidirectional: link.bidirectional ?? false });
        }
    }

    // --- Step 4: annotate door / bay hooks -----------------------------------
    for (const door of hangar.doors) {
        const an = door.accessNode?.ref;
        if (an && nodes.has(an.name)) {
            nodes.get(an.name)!.doorName = door.name;
        }
    }
    for (const bay of hangar.grid.bays) {
        const an = bay.accessNode?.ref;
        if (an && nodes.has(an.name)) {
            const node = nodes.get(an.name)!;
            node.bayName = bay.name;
            if (bay.traversable) node.traversable = true;
        }
    }

    return { nodes, edges };
}

// ============================================================================
// Pure BFS — operates on plain data only, no Langium types
// ============================================================================

/**
 * Run BFS from the given start node IDs through the access graph, treating
 * all nodes in `blockedNodeNames` as impassable.
 *
 * @returns The set of node IDs reachable from any start node.
 */
export function reachableNodes(
    startNodeNames: string[],
    graph: AccessGraph,
    blockedNodeNames: Set<string> = new Set(),
    wingspanEff?: number
): Set<string> {
    // Build forward-adjacency list from the edge set
    const adj = new Map<string, Set<string>>();
    for (const [id] of graph.nodes) {
        adj.set(id, new Set());
    }
    for (const edge of graph.edges) {
        adj.get(edge.from)?.add(edge.to);
        if (edge.bidirectional) {
            adj.get(edge.to)?.add(edge.from);
        }
    }

    // Non-bay corridor nodes with width < wingspanEff are treated as impassable.
    const isTooNarrow = (nodeId: string): boolean => {
        if (!wingspanEff) return false;
        const node = graph.nodes.get(nodeId);
        if (!node || node.bayName !== undefined) return false;
        return node.width !== undefined && node.width < wingspanEff;
    };

    const reachable = new Set<string>();
    const queue: string[] = [];

    for (const start of startNodeNames) {
        if (!blockedNodeNames.has(start) && !isTooNarrow(start) && graph.nodes.has(start)) {
            reachable.add(start);
            queue.push(start);
        }
    }
    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adj.get(current) ?? []) {
            if (!blockedNodeNames.has(neighbor) && !isTooNarrow(neighbor) && !reachable.has(neighbor)) {
                reachable.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return reachable;
}

// ============================================================================
// Blocker attribution
// ============================================================================

/**
 * Among the set of blocked nodes, find those whose individual removal
 * (one at a time) makes at least one unreachable target node reachable again.
 * Results are deduplicated by bayName.
 */
function findRelevantBlockers(
    doorNodeIds: string[],
    unreachableTargetIds: string[],
    graph: AccessGraph,
    blockedNodeIds: Set<string>,
    allBlockingBays: BlockingBayInfo[],
    wingspanEff?: number
): BlockingBayInfo[] {
    if (unreachableTargetIds.length === 0 || blockedNodeIds.size === 0) return [];

    const relevant: BlockingBayInfo[] = [];
    const seenBayNames = new Set<string>();

    for (const blocker of allBlockingBays) {
        if (seenBayNames.has(blocker.bayName)) continue;

        // Find the graph node id for this blocking bay
        let blockerNodeId: string | undefined;
        for (const [id, node] of graph.nodes) {
            if (node.bayName === blocker.bayName) { blockerNodeId = id; break; }
        }
        if (!blockerNodeId || !blockedNodeIds.has(blockerNodeId)) continue;

        // Temporarily remove this node and re-run BFS
        const reduced = new Set(blockedNodeIds);
        reduced.delete(blockerNodeId);
        const reachableWithout = reachableNodes(doorNodeIds, graph, reduced, wingspanEff);

        if (unreachableTargetIds.some(t => reachableWithout.has(t))) {
            relevant.push(blocker);
            seenBayNames.add(blocker.bayName);
        }
    }
    return relevant;
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * SFR_DYNAMIC_REACHABILITY
 *
 * Check whether all bays allocated to `induction` remain reachable from
 * at least one door of the hangar, after removing the bays occupied by
 * every other induction whose time window overlaps with `induction`.
 *
 * Returns ok=true (skipped=true) when the access graph has not been modelled
 * for this hangar, so the result is only meaningful when skipped=false.
 */
export function checkDynamicBayReachability(
    hangar: Hangar,
    induction: Induction,
    allInductions: Induction[],
    accessPaths: AccessPath[]
): ReachabilityResult {
    const inductionId = induction.id ?? undefined;
    const hangarName  = hangar.name;

    const makeSkipped = (reason: string): ReachabilityResult => ({
        ok: true,
        skipped: true,
        ruleId: 'SFR_DYNAMIC_REACHABILITY',
        message: reason,
        evidence: { inductionId, hangarName, unreachableBays: [], blockingBays: [], checkedFromDoors: [] }
    });

    // Build (or skip) the access graph
    const graph = buildAccessGraph(hangar, accessPaths);
    if (!graph) {
        return makeSkipped(`No access graph defined for hangar '${hangarName}' — dynamic reachability check skipped`);
    }

    // Collect the graph node ids for each of the induction's own bays
    const ownBayNodes: Array<{ bayName: string; nodeId: string }> = [];
    for (const bayRef of induction.bays) {
        const bay = bayRef.ref;
        if (!bay) continue;
        const an = bay.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) {
            ownBayNodes.push({ bayName: bay.name, nodeId: an.name });
        }
    }
    if (ownBayNodes.length === 0) {
        return makeSkipped(`Allocated bays have no access nodes — dynamic reachability check skipped`);
    }

    // Collect door entry node ids
    const doorEntries: Array<{ doorName: string; nodeId: string }> = [];
    for (const door of hangar.doors) {
        const an = door.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) {
            doorEntries.push({ doorName: door.name, nodeId: an.name });
        }
    }
    if (doorEntries.length === 0) {
        return makeSkipped(`No doors with access nodes in hangar '${hangarName}' — dynamic reachability check skipped`);
    }

    const inductionStart = new Date(induction.start);
    const inductionEnd   = new Date(induction.end);
    const ownBayNodeIds  = new Set(ownBayNodes.map(b => b.nodeId));
    const doorNodeIds    = doorEntries.map(d => d.nodeId);

    // Effective wingspan for corridor-width checks (undefined when aircraft lacks wingspan)
    const aircraft = induction.aircraft?.ref;
    const clearance = induction.clearance?.ref ?? aircraft?.clearance?.ref;
    const wingspanEff = aircraft && aircraft.wingspan > 0
        ? (aircraft.wingspan + (clearance?.lateralMargin ?? 0))
        : undefined;

    // Find every other induction in the same hangar whose time overlaps
    const overlapping = allInductions.filter(other => {
        if (other === induction) return false;
        if (other.hangar?.ref !== hangar) return false;
        const os = new Date(other.start);
        const oe = new Date(other.end);
        return inductionStart < oe && os < inductionEnd;
    });

    // Build the blocked node set from overlapping inductions' bays
    const blockedNodeIds  = new Set<string>();
    const allBlockingBays: BlockingBayInfo[] = [];

    for (const other of overlapping) {
        const os = new Date(other.start);
        const oe = new Date(other.end);
        const overlapStart = (inductionStart > os ? inductionStart : os).toISOString();
        const overlapEnd   = (inductionEnd   < oe ? inductionEnd   : oe).toISOString();

        for (const bayRef of other.bays) {
            const bay = bayRef.ref;
            if (!bay) continue;
            const an = bay.accessNode?.ref;
            if (!an || !graph.nodes.has(an.name)) continue;
            if (ownBayNodeIds.has(an.name)) continue; // don't treat own bays as blocked
            if (graph.nodes.get(an.name)?.traversable) continue; // traversable bays stay passable
            blockedNodeIds.add(an.name);
            allBlockingBays.push({
                bayName: bay.name,
                occupiedByInductionId: other.id ?? undefined,
                occupiedByAircraft: other.aircraft?.ref?.name ?? 'unknown',
                overlapStart,
                overlapEnd
            });
        }
    }

    // BFS from all door nodes, excluding blocked nodes and narrow corridors
    const reachable = reachableNodes(doorNodeIds, graph, blockedNodeIds, wingspanEff);

    // Determine which own bays are unreachable
    const unreachableBays = ownBayNodes
        .filter(b => !reachable.has(b.nodeId))
        .map(b => b.bayName);

    const unreachableNodeIds = ownBayNodes
        .filter(b => !reachable.has(b.nodeId))
        .map(b => b.nodeId);

    // Attribute blockers
    const relevantBlockers = findRelevantBlockers(
        doorNodeIds,
        unreachableNodeIds,
        graph,
        blockedNodeIds,
        allBlockingBays,
        wingspanEff
    );

    const checkedFromDoors = doorEntries.map(d => d.doorName);

    if (unreachableBays.length === 0) {
        return {
            ok: true,
            skipped: false,
            ruleId: 'SFR_DYNAMIC_REACHABILITY',
            message: `All bays for induction${inductionId ? ` '${inductionId}'` : ''} are reachable from door(s) [${checkedFromDoors.join(', ')}]`,
            evidence: { inductionId, hangarName, unreachableBays: [], blockingBays: [], checkedFromDoors }
        };
    }

    const blockerDesc = relevantBlockers.length > 0
        ? relevantBlockers.map(b => {
            const who = b.occupiedByInductionId
                ? `induction '${b.occupiedByInductionId}' (${b.occupiedByAircraft})`
                : `induction (${b.occupiedByAircraft})`;
            return `'${b.bayName}' occupied by ${who} during ${b.overlapStart} to ${b.overlapEnd}`;
          }).join('; ')
        : 'blocked access path';

    return {
        ok: false,
        skipped: false,
        ruleId: 'SFR_DYNAMIC_REACHABILITY',
        message: `[SFR_DYNAMIC_REACHABILITY] Bays [${unreachableBays.join(', ')}] are unreachable` +
                 ` from door(s) [${checkedFromDoors.join(', ')}] because ${blockerDesc}`,
        evidence: { inductionId, hangarName, unreachableBays, blockingBays: relevantBlockers, checkedFromDoors }
    };
}

// ============================================================================
// SFR_CORRIDOR_FIT — static corridor width check
// ============================================================================

export interface CorridorConstraintInfo {
    /** Name of the narrow corridor AccessNode */
    nodeName: string;
    /** Physical width of the corridor (m) */
    nodeWidth: number;
    /** Aircraft effective wingspan that could not fit (m) */
    wingspanEff: number;
    /** Name of the HangarBay that became unreachable through this corridor */
    bayName: string;
}

export interface CorridorFitResult {
    ok: boolean;
    /** True when the access graph has not been modelled — no check performed. */
    skipped: boolean;
    ruleId: string;
    violations: CorridorConstraintInfo[];
}

/**
 * SFR_CORRIDOR_FIT — static check.
 *
 * Determines whether the aircraft's effective wingspan can physically traverse
 * all corridor nodes on the path from any hangar door to each assigned bay.
 * Unlike checkDynamicBayReachability, this check ignores concurrent inductions
 * and focuses solely on structural corridor dimensions.
 *
 * A corridor node is "too narrow" when:
 *   node.bayName === undefined (not a bay)  AND
 *   node.width !== undefined                AND
 *   node.width < wingspanEff
 *
 * Returns ok=true (skipped=true) when no access graph is modelled.
 */
export function checkCorridorFit(
    hangar: Hangar,
    induction: Induction,
    accessPaths: AccessPath[],
    wingspanEff: number
): CorridorFitResult {
    const graph = buildAccessGraph(hangar, accessPaths);
    if (!graph) return { ok: true, skipped: true, ruleId: 'SFR_CORRIDOR_FIT', violations: [] };

    // Collect door entry node IDs
    const doorNodeIds: string[] = [];
    for (const door of hangar.doors) {
        const an = door.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) doorNodeIds.push(an.name);
    }
    if (doorNodeIds.length === 0) return { ok: true, skipped: true, ruleId: 'SFR_CORRIDOR_FIT', violations: [] };

    // Collect assigned bay node IDs
    const ownBayNodes: Array<{ bayName: string; nodeId: string }> = [];
    for (const bayRef of induction.bays) {
        const bay = bayRef.ref;
        if (!bay) continue;
        const an = bay.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) ownBayNodes.push({ bayName: bay.name, nodeId: an.name });
    }
    if (ownBayNodes.length === 0) return { ok: true, skipped: true, ruleId: 'SFR_CORRIDOR_FIT', violations: [] };

    // BFS with corridor width constraint (no concurrent blockers)
    const reachableWithConstraint = reachableNodes(doorNodeIds, graph, new Set(), wingspanEff);
    // BFS without any constraint (structural connectivity only)
    const reachableNoConstraint = reachableNodes(doorNodeIds, graph);

    // Bays blocked by corridor width (structurally reachable but physically blocked)
    const corridorBlockedBays = ownBayNodes.filter(b =>
        !reachableWithConstraint.has(b.nodeId) && reachableNoConstraint.has(b.nodeId)
    );
    if (corridorBlockedBays.length === 0) {
        return { ok: true, skipped: false, ruleId: 'SFR_CORRIDOR_FIT', violations: [] };
    }

    // Narrow corridor nodes reachable from doors (not bays, width < wingspanEff)
    const narrowCorridors = [...graph.nodes.entries()].filter(([id, node]) =>
        node.bayName === undefined &&
        node.width !== undefined &&
        node.width < wingspanEff &&
        reachableNoConstraint.has(id)
    );

    // Emit one violation per (narrow corridor, blocked bay) pair
    const violations: CorridorConstraintInfo[] = [];
    for (const [corridorId, corridorNode] of narrowCorridors) {
        for (const { bayName } of corridorBlockedBays) {
            violations.push({
                nodeName: corridorId,
                nodeWidth: corridorNode.width!,
                wingspanEff,
                bayName
            });
        }
    }

    return { ok: violations.length === 0, skipped: false, ruleId: 'SFR_CORRIDOR_FIT', violations };
}
