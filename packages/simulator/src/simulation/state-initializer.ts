/**
 * Simulation initialization: builds initial state from the Model AST.
 *
 * Loads manual inductions as fixed occupancy, creates ArrivalEvents
 * for each auto-induction, and builds the dependency map for `after` chains.
 */

import type { Model } from '../../../language/out/generated/ast.js';
import { calculateSearchWindow } from '../search/time-window.js';
import { EventQueue } from './event-queue.js';
import {
    EVENT_PRIORITY,
    bayKey,
    type SimulationState,
    type FixedOccupancy,
    type OccupiedBayInfo,
    type ArrivalEvent,
} from './types.js';

// ============================================================
// Types
// ============================================================

export interface InitializationResult {
    state: SimulationState;
    dependencyMap: Map<string, string[]>;
    pendingArrivals: Map<string, ArrivalEvent>;
    searchWindowStart: number;
}

// ============================================================
// Public API
// ============================================================

/**
 * Build the initial simulation state and seed the event queue.
 *
 * 1. Creates an empty SimulationState.
 * 2. Loads manual inductions as fixed occupancy + departure events.
 * 3. Creates ArrivalEvents for auto-inductions (or defers them if
 *    they have unresolved `after` dependencies on other auto-inductions).
 */
export function initializeSimulation(
    model: Model,
    queue: EventQueue,
): InitializationResult {
    const state = createEmptyState();
    const dependencyMap = new Map<string, string[]>();
    const pendingArrivals = new Map<string, ArrivalEvent>();

    loadFixedOccupancy(model, state, queue);
    const searchWindowStart = loadAutoInductions(
        model, state, queue, dependencyMap, pendingArrivals,
    );

    return { state, dependencyMap, pendingArrivals, searchWindowStart };
}

// ============================================================
// Internal helpers
// ============================================================

function createEmptyState(): SimulationState {
    return {
        currentTime: 0,
        occupiedBays: new Map(),
        waitingQueue: [],
        pendingDepartures: [],
        activeInductions: [],
        completedInductions: [],
        fixedOccupancy: [],
        eventLog: [],
    };
}

/**
 * Load manual inductions as fixed occupancy and schedule their departures.
 */
function loadFixedOccupancy(
    model: Model,
    state: SimulationState,
    queue: EventQueue,
): void {
    for (let i = 0; i < model.inductions.length; i++) {
        const ind = model.inductions[i];
        const hangar = ind.hangar?.ref;
        const aircraft = ind.aircraft?.ref;
        if (!hangar || !aircraft) continue;

        const inductionId = ind.id ?? `manual_${i}`;
        const hangarName = hangar.name;
        const bayNames = ind.bays
            .map(b => b.ref?.name)
            .filter((n): n is string => n !== undefined);
        const doorName = ind.door?.ref?.name ?? '';
        const start = new Date(ind.start).getTime();
        const end = new Date(ind.end).getTime();

        // Record fixed occupancy
        const fixed: FixedOccupancy = {
            inductionId, hangarName, bayNames, doorName, start, end,
        };
        state.fixedOccupancy.push(fixed);

        // Mark bays as occupied
        for (const bayName of bayNames) {
            const key = bayKey(hangarName, bayName);
            const info: OccupiedBayInfo = {
                inductionId,
                aircraftName: aircraft.name,
                hangarName,
                bayNames,
                doorName,
                startTime: start,
                endTime: end,
                fixed: true,
            };
            state.occupiedBays.set(key, info);
        }

        // Track as active induction
        state.activeInductions.push({
            id: inductionId,
            kind: 'manual',
            aircraftName: aircraft.name,
            hangarName,
            doorName,
            bayNames,
            actualStart: start,
            scheduledEnd: end,
            departureBlockedSince: null,
        });

        // Schedule departure to free bays
        queue.push({
            kind: 'DEPARTURE',
            time: end,
            priority: EVENT_PRIORITY.DEPARTURE,
            inductionId,
            hangarName,
            bayNames,
            doorName,
            fixed: true,
        });
    }
}

/**
 * Create ArrivalEvents for each auto-induction.
 * Returns the search window start time (epoch ms).
 */
function loadAutoInductions(
    model: Model,
    state: SimulationState,
    queue: EventQueue,
    dependencyMap: Map<string, string[]>,
    pendingArrivals: Map<string, ArrivalEvent>,
): number {
    const searchWindow = calculateSearchWindow(model);
    const windowStart = searchWindow.start.getTime();

    // Build a lookup of manual induction end times by ID
    const manualEndTimes = new Map<string, number>();
    for (let i = 0; i < model.inductions.length; i++) {
        const ind = model.inductions[i];
        const id = ind.id ?? `manual_${i}`;
        manualEndTimes.set(id, new Date(ind.end).getTime());
    }

    // Build set of all auto-induction IDs for dependency resolution
    const autoInductionIds = new Set<string>();
    for (const autoInd of model.autoInductions) {
        const aircraft = autoInd.aircraft?.ref;
        if (!aircraft) continue;
        const id = autoInd.id ?? `auto_${aircraft.name}`;
        autoInductionIds.add(id);
    }

    for (const autoInd of model.autoInductions) {
        const aircraft = autoInd.aircraft?.ref;
        if (!aircraft) {
            state.eventLog.push({
                kind: 'STRUCTURALLY_INFEASIBLE',
                time: windowStart,
                inductionId: autoInd.id ?? '',
                reason: 'Unresolved aircraft reference',
            });
            continue;
        }

        const inductionId = autoInd.id ?? `auto_${aircraft.name}`;

        // Compute arrival time: max(searchWindow.start, notBefore)
        let arrivalTime = windowStart;
        if (autoInd.notBefore) {
            const notBeforeMs = new Date(autoInd.notBefore).getTime();
            if (notBeforeMs > arrivalTime) arrivalTime = notBeforeMs;
        }

        // Handle `after` dependencies (precedingInductions)
        let pendingAutoDep: string | null = null;
        for (const depRef of autoInd.precedingInductions) {
            const dep = depRef.ref;
            if (!dep) continue;
            const depId = dep.id ?? '';

            const manualEnd = manualEndTimes.get(depId);
            if (manualEnd !== undefined) {
                if (manualEnd > arrivalTime) arrivalTime = manualEnd;
            } else if (autoInductionIds.has(depId)) {
                pendingAutoDep = depId;
            }
        }

        const event: ArrivalEvent = {
            kind: 'ARRIVAL',
            time: arrivalTime,
            priority: EVENT_PRIORITY.ARRIVAL,
            inductionId,
            autoInduction: autoInd,
            spatialCandidates: null,
        };

        if (pendingAutoDep) {
            pendingArrivals.set(inductionId, event);
            const deps = dependencyMap.get(pendingAutoDep) ?? [];
            deps.push(inductionId);
            dependencyMap.set(pendingAutoDep, deps);
        } else {
            queue.push(event);
        }
    }

    return windowStart;
}
