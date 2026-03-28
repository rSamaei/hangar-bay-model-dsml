import type { Hangar, Induction, AccessPath } from './generated/ast.js';

export interface AccessGraphNode {
    id: string;
    doorName?: string;
    bayName?: string;
    /** Corridor width constraint (undefined = unconstrained). */
    width?: number;
    /** Remains passable even when occupied. */
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

export interface BlockingBayInfo {
    bayName: string;
    occupiedByInductionId?: string;
    occupiedByAircraft: string;
    overlapStart: string;
    overlapEnd: string;
}

export interface ReachabilityResult {
    ok: boolean;
    /** True when access graph not modelled — check not performed (always ok). */
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

/** Build a plain-data access graph for the hangar. Returns null if not modelled. */
export function buildAccessGraph(
    hangar: Hangar,
    accessPaths: AccessPath[]
): AccessGraph | null {
    const nodes = new Map<string, AccessGraphNode>();
    const edges: AccessGraphEdge[] = [];

    // Gather AccessNode names referenced by this hangar
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

    // Pull in all nodes + links from relevant paths
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

    // Annotate door / bay hooks
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

/** BFS from start nodes; returns reachable node IDs. Blocked nodes are impassable. */
export function reachableNodes(
    startNodeNames: string[],
    graph: AccessGraph,
    blockedNodeNames: Set<string> = new Set(),
    wingspanEff?: number
): Set<string> {
    // Build adjacency list
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

    // Corridor nodes narrower than wingspanEff are impassable
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

/** Find blocked nodes whose removal restores reachability to at least one target. */
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

        // Find graph node for this blocking bay
        let blockerNodeId: string | undefined;
        for (const [id, node] of graph.nodes) {
            if (node.bayName === blocker.bayName) { blockerNodeId = id; break; }
        }
        if (!blockerNodeId || !blockedNodeIds.has(blockerNodeId)) continue;

        // Remove this node and re-run BFS
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

// -- SFR_DYNAMIC_REACHABILITY ------------------------------------------------

interface NodeMapping { bayName: string; nodeId: string }
interface DoorMapping { doorName: string; nodeId: string }

/** Collect graph node IDs for an induction's assigned bays. */
function collectBayNodes(induction: Induction, graph: AccessGraph): NodeMapping[] {
    const result: NodeMapping[] = [];
    for (const bayRef of induction.bays) {
        const bay = bayRef.ref;
        if (!bay) continue;
        const an = bay.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) {
            result.push({ bayName: bay.name, nodeId: an.name });
        }
    }
    return result;
}

/** Collect graph node IDs for a hangar's doors. */
function collectDoorNodes(hangar: Hangar, graph: AccessGraph): DoorMapping[] {
    const result: DoorMapping[] = [];
    for (const door of hangar.doors) {
        const an = door.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) {
            result.push({ doorName: door.name, nodeId: an.name });
        }
    }
    return result;
}

/** Build the set of blocked node IDs and their attribution info from overlapping inductions. */
function collectBlockedNodes(
    induction: Induction,
    hangar: Hangar,
    allInductions: Induction[],
    graph: AccessGraph,
    ownBayNodeIds: Set<string>
): { blockedNodeIds: Set<string>; allBlockingBays: BlockingBayInfo[] } {
    const inductionStart = new Date(induction.start);
    const inductionEnd   = new Date(induction.end);

    const overlapping = allInductions.filter(other => {
        if (other === induction || other.hangar?.ref !== hangar) return false;
        const os = new Date(other.start);
        const oe = new Date(other.end);
        return inductionStart < oe && os < inductionEnd;
    });

    const blockedNodeIds = new Set<string>();
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
            if (ownBayNodeIds.has(an.name)) continue;
            if (graph.nodes.get(an.name)?.traversable) continue;
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

    return { blockedNodeIds, allBlockingBays };
}

function formatBlockerDescription(blockers: BlockingBayInfo[]): string {
    if (blockers.length === 0) return 'blocked access path';
    return blockers.map(b => {
        const who = b.occupiedByInductionId
            ? `induction '${b.occupiedByInductionId}' (${b.occupiedByAircraft})`
            : `induction (${b.occupiedByAircraft})`;
        return `'${b.bayName}' occupied by ${who} during ${b.overlapStart} to ${b.overlapEnd}`;
    }).join('; ');
}

/** Check bays remain reachable from doors when concurrent inductions block paths. */
export function checkDynamicBayReachability(
    hangar: Hangar,
    induction: Induction,
    allInductions: Induction[],
    accessPaths: AccessPath[]
): ReachabilityResult {
    const inductionId = induction.id ?? undefined;
    const hangarName  = hangar.name;

    const makeSkipped = (reason: string): ReachabilityResult => ({
        ok: true, skipped: true, ruleId: 'SFR_DYNAMIC_REACHABILITY', message: reason,
        evidence: { inductionId, hangarName, unreachableBays: [], blockingBays: [], checkedFromDoors: [] }
    });

    const graph = buildAccessGraph(hangar, accessPaths);
    if (!graph) return makeSkipped(`No access graph defined for hangar '${hangarName}' — dynamic reachability check skipped`);

    const ownBayNodes = collectBayNodes(induction, graph);
    if (ownBayNodes.length === 0) return makeSkipped(`Allocated bays have no access nodes — dynamic reachability check skipped`);

    const doorEntries = collectDoorNodes(hangar, graph);
    if (doorEntries.length === 0) return makeSkipped(`No doors with access nodes in hangar '${hangarName}' — dynamic reachability check skipped`);

    const ownBayNodeIds = new Set(ownBayNodes.map(b => b.nodeId));
    const doorNodeIds   = doorEntries.map(d => d.nodeId);

    const aircraft = induction.aircraft?.ref;
    const clearance = induction.clearance?.ref ?? aircraft?.clearance?.ref;
    const wingspanEff = aircraft && aircraft.wingspan > 0
        ? (aircraft.wingspan + (clearance?.lateralMargin ?? 0))
        : undefined;

    const { blockedNodeIds, allBlockingBays } = collectBlockedNodes(
        induction, hangar, allInductions, graph, ownBayNodeIds
    );

    const reachable = reachableNodes(doorNodeIds, graph, blockedNodeIds, wingspanEff);
    const checkedFromDoors = doorEntries.map(d => d.doorName);

    const unreachable = ownBayNodes.filter(b => !reachable.has(b.nodeId));
    if (unreachable.length === 0) {
        return {
            ok: true, skipped: false, ruleId: 'SFR_DYNAMIC_REACHABILITY',
            message: `All bays for induction${inductionId ? ` '${inductionId}'` : ''} are reachable from door(s) [${checkedFromDoors.join(', ')}]`,
            evidence: { inductionId, hangarName, unreachableBays: [], blockingBays: [], checkedFromDoors }
        };
    }

    const unreachableBays = unreachable.map(b => b.bayName);
    const relevantBlockers = findRelevantBlockers(
        doorNodeIds, unreachable.map(b => b.nodeId), graph, blockedNodeIds, allBlockingBays, wingspanEff
    );

    return {
        ok: false, skipped: false, ruleId: 'SFR_DYNAMIC_REACHABILITY',
        message: `[SFR_DYNAMIC_REACHABILITY] Bays [${unreachableBays.join(', ')}] are unreachable` +
                 ` from door(s) [${checkedFromDoors.join(', ')}] because ${formatBlockerDescription(relevantBlockers)}`,
        evidence: { inductionId, hangarName, unreachableBays, blockingBays: relevantBlockers, checkedFromDoors }
    };
}

export interface CorridorConstraintInfo {
    nodeName: string;
    nodeWidth: number;
    wingspanEff: number;
    bayName: string;
}

export interface CorridorFitResult {
    ok: boolean;
    skipped: boolean;
    ruleId: string;
    violations: CorridorConstraintInfo[];
}

/** Check if aircraft wingspan fits through corridor nodes on path to assigned bays. */
export function checkCorridorFit(
    hangar: Hangar,
    induction: Induction,
    accessPaths: AccessPath[],
    wingspanEff: number
): CorridorFitResult {
    const graph = buildAccessGraph(hangar, accessPaths);
    if (!graph) return { ok: true, skipped: true, ruleId: 'SFR_CORRIDOR_FIT', violations: [] };

    // Door entry nodes
    const doorNodeIds: string[] = [];
    for (const door of hangar.doors) {
        const an = door.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) doorNodeIds.push(an.name);
    }
    if (doorNodeIds.length === 0) return { ok: true, skipped: true, ruleId: 'SFR_CORRIDOR_FIT', violations: [] };

    // Assigned bay nodes
    const ownBayNodes: Array<{ bayName: string; nodeId: string }> = [];
    for (const bayRef of induction.bays) {
        const bay = bayRef.ref;
        if (!bay) continue;
        const an = bay.accessNode?.ref;
        if (an && graph.nodes.has(an.name)) ownBayNodes.push({ bayName: bay.name, nodeId: an.name });
    }
    if (ownBayNodes.length === 0) return { ok: true, skipped: true, ruleId: 'SFR_CORRIDOR_FIT', violations: [] };

    const reachableWithConstraint = reachableNodes(doorNodeIds, graph, new Set(), wingspanEff);
    const reachableNoConstraint = reachableNodes(doorNodeIds, graph);

    // Bays structurally reachable but physically blocked by corridor width
    const corridorBlockedBays = ownBayNodes.filter(b =>
        !reachableWithConstraint.has(b.nodeId) && reachableNoConstraint.has(b.nodeId)
    );
    if (corridorBlockedBays.length === 0) {
        return { ok: true, skipped: false, ruleId: 'SFR_CORRIDOR_FIT', violations: [] };
    }

    // Narrow corridor nodes on reachable paths
    const narrowCorridors = [...graph.nodes.entries()].filter(([id, node]) =>
        node.bayName === undefined &&
        node.width !== undefined &&
        node.width < wingspanEff &&
        reachableNoConstraint.has(id)
    );

    // One violation per (narrow corridor, blocked bay) pair
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
