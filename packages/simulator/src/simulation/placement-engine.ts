/**
 * Placement and departure path checking for the discrete-event simulation.
 *
 * Reuses existing search/geometry/rules modules — no duplication of
 * adjacency, access-graph, door-fit, corridor-fit, or bay-search logic.
 *
 * Design reference: SIMULATION_DESIGN.md §7–§8
 */

import type {
    Model,
    Hangar,
    AircraftType,
    ClearanceEnvelope,
    HangarBay,
    HangarDoor,
    AccessPath,
} from '../../../language/out/generated/ast.js';
import { findSuitableDoors } from '../search/doors.js';
import { findSuitableBaySets } from '../search/bay-sets.js';
import { calculateEffectiveDimensions } from '../geometry/dimensions.js';
import {
    buildAccessGraph,
    reachableNodes,
    type AccessGraph,
    type AccessGraphNode,
} from '../geometry/access.js';
import type { EffectiveDimensions } from '../types/dimensions.js';
import type {
    SimulationState,
    SimulationConfig,
    PlacementAttemptResult,
    PlacementRejection,
    DepartureAttemptResult,
    OccupiedBayInfo,
} from './types.js';

// ============================================================
// Pre-computed data — built once per model
// ============================================================

interface HangarCache {
    hangar: Hangar;
    accessGraph: AccessGraph | null;
    /** doors[aircraftName] → suitable doors for that aircraft. Lazily populated. */
    doorCache: Map<string, HangarDoor[]>;
    /** baySets[cacheKey] → candidate bay sets. Lazily populated. */
    baySetCache: Map<string, HangarBay[][]>;
}

// ============================================================
// PlacementEngine
// ============================================================

export class PlacementEngine {
    private readonly model: Model;
    private readonly accessPaths: AccessPath[];
    private readonly hangarCaches: Map<string, HangarCache>;
    private readonly dimsCache: Map<string, EffectiveDimensions>;

    constructor(model: Model) {
        this.model = model;
        this.accessPaths = model.accessPaths;
        this.hangarCaches = new Map();
        this.dimsCache = new Map();

        // Pre-build access graphs for all hangars
        for (const hangar of model.hangars) {
            this.hangarCaches.set(hangar.name, {
                hangar,
                accessGraph: buildAccessGraph(hangar, this.accessPaths),
                doorCache: new Map(),
                baySetCache: new Map(),
            });
        }
    }

    // ================================================================
    // attemptPlacement
    // ================================================================

    /**
     * Try to place an aircraft into a hangar at the given time.
     *
     * @param inductionId     Unique ID for logging/tracking.
     * @param aircraft        The Langium AST aircraft type node.
     * @param clearance       Optional clearance envelope.
     * @param durationMs      Duration in milliseconds.
     * @param preferredHangar Preferred hangar (tried first), or undefined for all hangars.
     * @param requires        Minimum bay count override (from `requires N bays`).
     * @param state           Current simulation state (for occupancy checks).
     * @param config          Simulation configuration.
     */
    attemptPlacement(
        inductionId: string,
        aircraft: AircraftType,
        clearance: ClearanceEnvelope | undefined,
        durationMs: number,
        preferredHangar: Hangar | undefined,
        requires: number | undefined,
        state: SimulationState,
        config: SimulationConfig,
    ): PlacementAttemptResult {
        const now = state.currentTime;
        const endTime = now + durationMs;
        const rejections: PlacementRejection[] = [];

        // Determine target hangars: preferred first, then all others
        const hangars = this.getTargetHangars(preferredHangar);

        const effectiveDims = this.getEffectiveDimensions(aircraft, clearance);

        for (const hangar of hangars) {
            const cache = this.hangarCaches.get(hangar.name);
            if (!cache) continue;

            // (a) Door fit check
            const suitableDoors = this.getSuitableDoors(cache, aircraft, clearance);
            if (suitableDoors.length === 0) {
                rejections.push({
                    attemptTime: now,
                    ruleId: 'SFR11_DOOR_FIT',
                    message: `No suitable doors in hangar ${hangar.name}`,
                    hangar: hangar.name,
                    evidence: { aircraftName: aircraft.name },
                });
                continue;
            }

            // (b) Bay set search
            const candidateBaySets = this.getCandidateBaySets(
                cache, aircraft, clearance, requires, config,
            );
            if (candidateBaySets.length === 0) {
                rejections.push({
                    attemptTime: now,
                    ruleId: 'NO_SUITABLE_BAY_SET',
                    message: `No suitable bay sets in hangar ${hangar.name}`,
                    hangar: hangar.name,
                    evidence: { aircraftName: aircraft.name },
                });
                continue;
            }

            // (c) Try each bay set
            for (const baySet of candidateBaySets) {
                const bayNames = baySet.map(b => b.name);

                // Time-overlap check: are any of these bays occupied during [now, endTime)?
                if (this.anyBayOccupied(bayNames, hangar.name, now, endTime, state)) {
                    rejections.push({
                        attemptTime: now,
                        ruleId: 'SFR16_TIME_OVERLAP',
                        message: `Bay set [${bayNames.join(', ')}] has time conflict in hangar ${hangar.name}`,
                        hangar: hangar.name,
                        evidence: { bayNames },
                    });
                    continue;
                }

                // Access-graph reachability check
                const graph = cache.accessGraph;
                if (graph) {
                    const blocked = this.computeBlockedNodes(
                        graph, state, hangar.name, now, endTime, new Set(bayNames),
                    );
                    const doorNodeIds = this.getDoorNodeIds(graph, hangar);
                    const bayNodeIds = this.getBayNodeIds(graph, bayNames);

                    if (doorNodeIds.length > 0 && bayNodeIds.length > 0) {
                        const reachable = reachableNodes(
                            doorNodeIds, graph, blocked, effectiveDims.wingspan,
                        );
                        const unreachable = bayNodeIds.filter(id => !reachable.has(id));
                        if (unreachable.length > 0) {
                            rejections.push({
                                attemptTime: now,
                                ruleId: 'SFR_DYNAMIC_REACHABILITY',
                                message: `Bays unreachable via access path in hangar ${hangar.name}`,
                                hangar: hangar.name,
                                evidence: { bayNames, unreachableNodeIds: unreachable },
                            });
                            continue;
                        }

                        // Corridor fit check: can the aircraft physically fit through corridors?
                        const corridorBlocked = this.checkCorridorFitDirect(
                            graph, doorNodeIds, bayNodeIds, effectiveDims.wingspan,
                        );
                        if (corridorBlocked.length > 0) {
                            rejections.push({
                                attemptTime: now,
                                ruleId: 'SFR_CORRIDOR_FIT',
                                message: `Aircraft too wide for corridor in hangar ${hangar.name}`,
                                hangar: hangar.name,
                                evidence: { bayNames, corridorViolations: corridorBlocked },
                            });
                            continue;
                        }
                    }
                }

                // All checks pass — use first suitable door
                const doorName = suitableDoors[0].name;
                return {
                    placed: true,
                    inductionId,
                    hangarName: hangar.name,
                    doorName,
                    bayNames,
                    startTime: now,
                    endTime,
                };
            }
        }

        // No valid placement found
        return { placed: false, rejections };
    }

    // ================================================================
    // checkDeparturePath
    // ================================================================

    /**
     * Check whether an aircraft can depart (reach any door from its bays).
     *
     * The departing aircraft's own bays are EXCLUDED from the blocked set.
     * No wingspan constraint on departure — the aircraft is already inside.
     */
    checkDeparturePath(
        inductionId: string,
        hangarName: string,
        bayNames: string[],
        state: SimulationState,
    ): DepartureAttemptResult {
        const cache = this.hangarCaches.get(hangarName);
        if (!cache) {
            // No hangar cache — allow departure (defensive)
            return { clear: true, exitDoor: '' };
        }

        const graph = cache.accessGraph;
        if (!graph) {
            // No access graph modelled — always allow departure
            return { clear: true, exitDoor: '' };
        }

        const doorNodeIds = this.getDoorNodeIds(graph, cache.hangar);
        const bayNodeIds = this.getBayNodeIds(graph, bayNames);

        if (doorNodeIds.length === 0 || bayNodeIds.length === 0) {
            // No access nodes on doors/bays — allow departure
            return { clear: true, exitDoor: '' };
        }

        // Build blocked set: everything occupied EXCEPT the departing aircraft
        const blocked = this.computeBlockedNodes(
            graph, state, hangarName,
            state.currentTime, state.currentTime,
            new Set(bayNames), // exclude own bays
        );

        // Also include pending departures (other than self) as blocking
        for (const pending of state.pendingDepartures) {
            if (pending.inductionId === inductionId) continue;
            if (pending.hangarName !== hangarName) continue;
            for (const bayName of pending.bayNames) {
                const nodeId = this.findBayNodeId(graph, bayName);
                if (nodeId && !this.isTraversable(graph, nodeId)) {
                    blocked.add(nodeId);
                }
            }
        }

        // BFS from doors — no wingspan constraint on departure
        const reachable = reachableNodes(doorNodeIds, graph, blocked);

        // Check if ALL own bay nodes are reachable
        const allReachable = bayNodeIds.every(id => reachable.has(id));

        if (allReachable) {
            // Find which door is reachable
            const exitDoor = this.findExitDoor(graph, cache.hangar, reachable);
            return { clear: true, exitDoor };
        }

        // Identify which inductions are blocking
        const blockingIds = this.identifyBlockers(state, hangarName, blocked, bayNames);
        return { clear: false, blockingInductionIds: blockingIds };
    }

    // ================================================================
    // Private helpers
    // ================================================================

    private getTargetHangars(preferredHangar: Hangar | undefined): Hangar[] {
        if (!preferredHangar) return [...this.model.hangars];
        // Preferred first, then all others
        const others = this.model.hangars.filter(h => h.name !== preferredHangar.name);
        return [preferredHangar, ...others];
    }

    private getEffectiveDimensions(
        aircraft: AircraftType,
        clearance: ClearanceEnvelope | undefined,
    ): EffectiveDimensions {
        const key = `${aircraft.name}::${clearance?.name ?? ''}`;
        let dims = this.dimsCache.get(key);
        if (!dims) {
            dims = calculateEffectiveDimensions(aircraft, clearance);
            this.dimsCache.set(key, dims);
        }
        return dims;
    }

    private getSuitableDoors(
        cache: HangarCache,
        aircraft: AircraftType,
        clearance: ClearanceEnvelope | undefined,
    ): HangarDoor[] {
        const key = `${aircraft.name}::${clearance?.name ?? ''}`;
        let doors = cache.doorCache.get(key);
        if (!doors) {
            const result = findSuitableDoors(aircraft, cache.hangar, clearance);
            doors = result.doors;
            cache.doorCache.set(key, doors);
        }
        return doors;
    }

    private getCandidateBaySets(
        cache: HangarCache,
        aircraft: AircraftType,
        clearance: ClearanceEnvelope | undefined,
        requires: number | undefined,
        config: SimulationConfig,
    ): HangarBay[][] {
        const key = `${aircraft.name}::${clearance?.name ?? ''}::${requires ?? ''}`;
        let sets = cache.baySetCache.get(key);
        if (!sets) {
            const result = findSuitableBaySets(
                aircraft, cache.hangar, clearance,
                config.maxBaySetCandidates, config.defaultSpan, requires,
            );
            sets = result.baySets;
            cache.baySetCache.set(key, sets);
        }
        return sets;
    }

    /** Check if any of the given bays are occupied during [start, end). */
    private anyBayOccupied(
        bayNames: string[],
        hangarName: string,
        start: number,
        end: number,
        state: SimulationState,
    ): boolean {
        for (const bayName of bayNames) {
            const key = `${hangarName}::${bayName}`;
            const info = state.occupiedBays.get(key);
            if (info && info.endTime > start && info.startTime < end) {
                return true;
            }
        }
        // Also check fixed occupancy for future manual inductions
        for (const fixed of state.fixedOccupancy) {
            if (fixed.hangarName !== hangarName) continue;
            if (fixed.end <= start || fixed.start >= end) continue;
            if (fixed.bayNames.some(b => bayNames.includes(b))) return true;
        }
        return false;
    }

    /**
     * Build the set of blocked access-graph node IDs at the given time.
     * Occupied bays whose access-graph node is not traversable are blocked.
     * Bays in `excludeBayNames` are excluded (the aircraft's own bays).
     */
    private computeBlockedNodes(
        graph: AccessGraph,
        state: SimulationState,
        hangarName: string,
        _start: number,
        _end: number,
        excludeBayNames: Set<string>,
    ): Set<string> {
        const blocked = new Set<string>();
        const now = state.currentTime;

        for (const [key, info] of state.occupiedBays) {
            if (info.hangarName !== hangarName) continue;
            // Only consider bays that are actually occupied at the current time
            if (info.startTime > now || info.endTime <= now) continue;
            // Extract bay name from "hangarName::bayName"
            const bayName = key.substring(hangarName.length + 2);
            if (excludeBayNames.has(bayName)) continue;

            const nodeId = this.findBayNodeId(graph, bayName);
            if (nodeId && !this.isTraversable(graph, nodeId)) {
                blocked.add(nodeId);
            }
        }

        return blocked;
    }

    /** Find the access-graph node ID for a bay by its name. */
    private findBayNodeId(graph: AccessGraph, bayName: string): string | undefined {
        for (const [id, node] of graph.nodes) {
            if (node.bayName === bayName) return id;
        }
        return undefined;
    }

    /** Check if a node is traversable (passable even when occupied). */
    private isTraversable(graph: AccessGraph, nodeId: string): boolean {
        return graph.nodes.get(nodeId)?.traversable === true;
    }

    /** Get access-graph node IDs for all doors with accessNode hooks. */
    private getDoorNodeIds(graph: AccessGraph, hangar: Hangar): string[] {
        const ids: string[] = [];
        for (const door of hangar.doors) {
            const an = door.accessNode?.ref;
            if (an && graph.nodes.has(an.name)) ids.push(an.name);
        }
        return ids;
    }

    /** Get access-graph node IDs for bays by name. */
    private getBayNodeIds(graph: AccessGraph, bayNames: string[]): string[] {
        const ids: string[] = [];
        for (const bayName of bayNames) {
            const nodeId = this.findBayNodeId(graph, bayName);
            if (nodeId) ids.push(nodeId);
        }
        return ids;
    }

    /**
     * Inline corridor-fit check using the pre-built access graph.
     * Returns list of bay names blocked by narrow corridors (empty = OK).
     */
    private checkCorridorFitDirect(
        graph: AccessGraph,
        doorNodeIds: string[],
        bayNodeIds: string[],
        wingspanEff: number,
    ): string[] {
        // BFS with corridor width constraint
        const reachableWithConstraint = reachableNodes(
            doorNodeIds, graph, new Set(), wingspanEff,
        );
        // BFS without constraint (structural only)
        const reachableNoConstraint = reachableNodes(doorNodeIds, graph);

        // Bays structurally reachable but physically blocked by narrow corridor
        return bayNodeIds.filter(
            id => !reachableWithConstraint.has(id) && reachableNoConstraint.has(id),
        );
    }

    /** Find an exit door name from the reachable set. */
    private findExitDoor(
        graph: AccessGraph,
        hangar: Hangar,
        reachable: Set<string>,
    ): string {
        for (const door of hangar.doors) {
            const an = door.accessNode?.ref;
            if (an && reachable.has(an.name)) return door.name;
        }
        // Fallback: first door
        return hangar.doors[0]?.name ?? '';
    }

    /** Identify induction IDs whose occupied bays are in the blocked set. */
    private identifyBlockers(
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

            const graph = this.hangarCaches.get(hangarName)?.accessGraph;
            if (!graph) continue;
            const nodeId = this.findBayNodeId(graph, bayName);
            if (nodeId && blocked.has(nodeId)) {
                blockerIds.add(info.inductionId);
            }
        }

        return [...blockerIds];
    }
}
