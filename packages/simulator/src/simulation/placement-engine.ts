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
} from '../geometry/access.js';
import type { EffectiveDimensions } from '../types/dimensions.js';
import {
    bayKey,
    type SimulationState,
    type SimulationConfig,
    PlacementAttemptResult,
    PlacementRejection,
    DepartureAttemptResult,
} from './types.js';
import {
    findBayNodeId,
    isTraversable,
    getDoorNodeIds,
    getBayNodeIds,
    findExitDoor,
    checkCorridorFitDirect,
    computeBlockedNodes,
    identifyBlockers,
} from './graph-queries.js';

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
        const hangars = this.getTargetHangars(preferredHangar);
        const effectiveDims = this.getEffectiveDimensions(aircraft, clearance);

        for (const hangar of hangars) {
            const cache = this.hangarCaches.get(hangar.name);
            if (!cache) continue;

            // (a) Door fit check
            const suitableDoors = this.getSuitableDoors(cache, aircraft, clearance);
            if (suitableDoors.length === 0) {
                rejections.push({
                    attemptTime: now, ruleId: 'SFR11_DOOR_FIT',
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
                    attemptTime: now, ruleId: 'NO_SUITABLE_BAY_SET',
                    message: `No suitable bay sets in hangar ${hangar.name}`,
                    hangar: hangar.name,
                    evidence: { aircraftName: aircraft.name },
                });
                continue;
            }

            // (c) Try each bay set
            for (const baySet of candidateBaySets) {
                const bayNames = baySet.map(b => b.name);
                const rejection = this.tryBaySet(
                    bayNames, hangar, cache, now, endTime,
                    effectiveDims.wingspan, state, rejections,
                );
                if (rejection) continue;

                // All checks pass — use first suitable door
                return {
                    placed: true,
                    inductionId,
                    hangarName: hangar.name,
                    doorName: suitableDoors[0].name,
                    bayNames,
                    startTime: now,
                    endTime,
                };
            }
        }

        return { placed: false, rejections };
    }

    // ================================================================
    // checkDeparturePath
    // ================================================================

    checkDeparturePath(
        inductionId: string,
        hangarName: string,
        bayNames: string[],
        state: SimulationState,
    ): DepartureAttemptResult {
        const cache = this.hangarCaches.get(hangarName);
        if (!cache) return { clear: true, exitDoor: '' };

        const graph = cache.accessGraph;
        if (!graph) return { clear: true, exitDoor: '' };

        const doorNodeIds = getDoorNodeIds(graph, cache.hangar);
        const bayNodeIds = getBayNodeIds(graph, bayNames);

        if (doorNodeIds.length === 0 || bayNodeIds.length === 0) {
            return { clear: true, exitDoor: '' };
        }

        // Build blocked set: everything occupied EXCEPT the departing aircraft
        const blocked = computeBlockedNodes(
            graph, state, hangarName, new Set(bayNames),
        );

        // Also include pending departures (other than self) as blocking
        for (const pending of state.pendingDepartures) {
            if (pending.inductionId === inductionId) continue;
            if (pending.hangarName !== hangarName) continue;
            for (const bayName of pending.bayNames) {
                const nodeId = findBayNodeId(graph, bayName);
                if (nodeId && !isTraversable(graph, nodeId)) {
                    blocked.add(nodeId);
                }
            }
        }

        // BFS from doors — no wingspan constraint on departure
        const reachable = reachableNodes(doorNodeIds, graph, blocked);
        const allReachable = bayNodeIds.every(id => reachable.has(id));

        if (allReachable) {
            return { clear: true, exitDoor: findExitDoor(graph, cache.hangar, reachable) };
        }

        const blockingIds = identifyBlockers(graph, state, hangarName, blocked, bayNames);
        return { clear: false, blockingInductionIds: blockingIds };
    }

    // ================================================================
    // Private helpers
    // ================================================================

    private getTargetHangars(preferredHangar: Hangar | undefined): Hangar[] {
        if (!preferredHangar) return [...this.model.hangars];
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
            const key = bayKey(hangarName, bayName);
            const info = state.occupiedBays.get(key);
            if (info && info.endTime > start && info.startTime < end) {
                return true;
            }
        }
        for (const fixed of state.fixedOccupancy) {
            if (fixed.hangarName !== hangarName) continue;
            if (fixed.end <= start || fixed.start >= end) continue;
            if (fixed.bayNames.some(b => bayNames.includes(b))) return true;
        }
        return false;
    }

    /**
     * Try a single bay set: time-overlap, reachability, and corridor-fit checks.
     * Returns true if the bay set was rejected (and pushes a rejection),
     * false if all checks passed.
     */
    private tryBaySet(
        bayNames: string[],
        hangar: Hangar,
        cache: HangarCache,
        now: number,
        endTime: number,
        wingspanEff: number,
        state: SimulationState,
        rejections: PlacementRejection[],
    ): boolean {
        // Time-overlap check
        if (this.anyBayOccupied(bayNames, hangar.name, now, endTime, state)) {
            rejections.push({
                attemptTime: now, ruleId: 'SFR23_TIME_OVERLAP',
                message: `Bay set [${bayNames.join(', ')}] has time conflict in hangar ${hangar.name}`,
                hangar: hangar.name,
                evidence: { bayNames },
            });
            return true;
        }

        // Access-graph checks
        const graph = cache.accessGraph;
        if (!graph) return false;

        const blocked = computeBlockedNodes(
            graph, state, hangar.name, new Set(bayNames),
        );
        const doorNodeIds = getDoorNodeIds(graph, hangar);
        const bayNodeIds = getBayNodeIds(graph, bayNames);

        if (doorNodeIds.length === 0 || bayNodeIds.length === 0) return false;

        // Reachability check
        const reachable = reachableNodes(
            doorNodeIds, graph, blocked, wingspanEff,
        );
        const unreachable = bayNodeIds.filter(id => !reachable.has(id));
        if (unreachable.length > 0) {
            rejections.push({
                attemptTime: now, ruleId: 'SFR21_DYNAMIC_REACHABILITY',
                message: `Bays unreachable via access path in hangar ${hangar.name}`,
                hangar: hangar.name,
                evidence: { bayNames, unreachableNodeIds: unreachable },
            });
            return true;
        }

        // Corridor fit check
        const corridorBlocked = checkCorridorFitDirect(
            graph, doorNodeIds, bayNodeIds, wingspanEff,
        );
        if (corridorBlocked.length > 0) {
            rejections.push({
                attemptTime: now, ruleId: 'SFR22_CORRIDOR_FIT',
                message: `Aircraft too wide for corridor in hangar ${hangar.name}`,
                hangar: hangar.name,
                evidence: { bayNames, corridorViolations: corridorBlocked },
            });
            return true;
        }

        return false;
    }
}
