/**
 * Builds the final SimulationResult from accumulated simulation state.
 *
 * Extracted from DiscreteEventSimulator.buildResult() to keep the main
 * loop focused on event processing.
 */

import type { AutoInduction as AstAutoInduction } from '../../../language/out/generated/ast.js';
import type { InductionTracker } from './induction-tracker.js';
import type {
    SimulationState,
    SimulationResult,
    SimulationStats,
    SimulationPlacement,
    FailedInduction,
    WaitingAircraft,
    ArrivalEvent,
    CompletedInduction,
} from './types.js';

/** Convert a CompletedInduction to a SimulationPlacement. */
function toPlacement(c: CompletedInduction): SimulationPlacement {
    return {
        inductionId: c.id,
        aircraftName: c.aircraftName,
        hangarName: c.hangarName,
        doorName: c.doorName,
        bayNames: c.bayNames,
        actualStart: c.actualStart,
        maintenanceEnd: c.maintenanceEnd,
        actualEnd: c.actualEnd,
        requestedStart: c.actualStart - c.waitTime,
        waitTime: c.waitTime,
        departureDelay: c.departureDelay,
        waitReason: c.waitReason,
        departureDelayReason: c.departureDelayReason,
        placementAttempts: c.placementAttempts,
        queuePosition: c.queuePosition,
    };
}

/** Convert a WaitingAircraft to a FailedInduction. */
function waitingToFailed(w: WaitingAircraft, currentTime: number): FailedInduction {
    return {
        inductionId: w.inductionId,
        aircraftName: w.aircraft.name,
        preferredHangar: w.autoInduction.preferredHangar?.ref?.name,
        reason: w.deadline !== null && currentTime > w.deadline
            ? 'SIM_DEADLINE_EXCEEDED'
            : 'SIM_NEVER_PLACED',
        lastAttemptTime: w.rejections.length > 0
            ? w.rejections[w.rejections.length - 1].attemptTime
            : null,
        rejections: w.rejections,
        requestedArrival: w.requestedArrival,
        deadline: w.deadline,
    };
}

/** Inputs needed to compile the final result. */
export interface ResultBuilderInput {
    state: SimulationState;
    eventCount: number;
    tracker: InductionTracker;
    /** Expired waiting aircraft (deadline exceeded during simulation). */
    expiredWaiting: WaitingAircraft[];
    /** Pending arrivals that were never triggered (dependency never resolved). */
    pendingArrivals: Map<string, ArrivalEvent>;
    /** AST auto-induction nodes for structurally-infeasible lookup. */
    astAutoInductions: AstAutoInduction[];
    /** Cached search window start (epoch ms). */
    searchWindowStart: number;
    /** Peak statistics collected during the run. */
    peakStats: PeakStats;
}

export interface PeakStats {
    maxQueueDepth: number;
    maxQueueDepthTime: number;
    peakOccupancy: number;
    peakOccupancyTime: number;
}

export function buildSimulationResult(input: ResultBuilderInput): SimulationResult {
    const { state, eventCount, tracker, expiredWaiting, pendingArrivals,
        astAutoInductions, searchWindowStart, peakStats } = input;

    // --- Scheduled inductions ---

    // From completed auto-inductions
    const scheduledInductions: SimulationPlacement[] = state.completedInductions
        .filter(c => c.kind === 'auto')
        .map(toPlacement);

    // Active auto-inductions that never departed (simulation ended)
    for (const active of state.activeInductions) {
        if (active.kind !== 'auto') continue;
        const completed = tracker.buildCompleted(active, state.currentTime, 'auto');
        scheduledInductions.push(toPlacement(completed));
    }

    // --- Failed inductions ---

    const failedInductions: FailedInduction[] = [];

    // From waiting queue (never placed)
    for (const waiting of state.waitingQueue) {
        failedInductions.push(waitingToFailed(waiting, state.currentTime));
    }

    // From expired waiting aircraft (deadline exceeded during simulation)
    for (const expired of expiredWaiting) {
        failedInductions.push({
            ...waitingToFailed(expired, state.currentTime),
            reason: 'SIM_DEADLINE_EXCEEDED',
        });
    }

    // From structurally infeasible (logged during init)
    const autoAstById = new Map<string, AstAutoInduction>();
    for (const autoInd of astAutoInductions) {
        const id = autoInd.id ?? `auto_${autoInd.aircraft?.ref?.name ?? 'unknown'}`;
        autoAstById.set(id, autoInd);
    }
    for (const entry of state.eventLog) {
        if (entry.kind === 'STRUCTURALLY_INFEASIBLE') {
            const astNode = autoAstById.get(entry.inductionId);
            failedInductions.push({
                inductionId: entry.inductionId,
                aircraftName: entry.aircraft ?? '',
                reason: 'STRUCTURALLY_INFEASIBLE',
                lastAttemptTime: null,
                rejections: [],
                requestedArrival: astNode?.notBefore
                    ? new Date(astNode.notBefore).getTime()
                    : searchWindowStart,
                deadline: astNode?.notAfter
                    ? new Date(astNode.notAfter).getTime()
                    : null,
            });
        }
    }

    // From pending arrivals (dependency never resolved)
    for (const [depId, event] of pendingArrivals) {
        const aircraft = event.autoInduction.aircraft?.ref;
        failedInductions.push({
            inductionId: depId,
            aircraftName: aircraft?.name ?? '',
            reason: 'DEPENDENCY_NEVER_PLACED',
            lastAttemptTime: null,
            rejections: [],
            requestedArrival: event.time,
            deadline: event.autoInduction.notAfter
                ? new Date(event.autoInduction.notAfter).getTime()
                : null,
        });
    }

    // --- Statistics ---

    const statistics = buildStatistics(
        state, scheduledInductions, failedInductions,
        eventCount, astAutoInductions.length, peakStats,
    );

    return { scheduledInductions, failedInductions, eventLog: state.eventLog, statistics };
}

function buildStatistics(
    state: SimulationState,
    scheduled: SimulationPlacement[],
    failed: FailedInduction[],
    eventCount: number,
    totalAutoInductions: number,
    peakStats: PeakStats,
): SimulationStats {
    const firstTime = state.eventLog.length > 0 ? state.eventLog[0].time : 0;
    const lastTime = state.eventLog.length > 0
        ? state.eventLog[state.eventLog.length - 1].time
        : 0;

    let maxWaitTime = 0;
    let maxWaitInduction = '';
    for (const p of scheduled) {
        if (p.waitTime > maxWaitTime) {
            maxWaitTime = p.waitTime;
            maxWaitInduction = p.inductionId;
        }
    }

    return {
        simulatedDuration: lastTime - firstTime,
        totalEvents: eventCount,
        totalAutoInductions,
        placedCount: scheduled.length,
        failedCount: failed.length,
        maxQueueDepth: peakStats.maxQueueDepth,
        maxQueueDepthTime: peakStats.maxQueueDepthTime,
        totalWaitTime: scheduled.reduce((sum, p) => sum + p.waitTime, 0),
        totalDepartureDelay: scheduled.reduce((sum, p) => sum + p.departureDelay, 0),
        maxWaitTime,
        maxWaitInduction,
        deadlockCount: state.eventLog.filter(e => e.kind === 'DEADLOCK_DETECTED').length,
        avgUtilisation: 0,
        peakOccupancy: peakStats.peakOccupancy,
        peakOccupancyTime: peakStats.peakOccupancyTime,
        utilisationByHangar: {},
        windowStart: firstTime,
        windowEnd: lastTime,
    };
}
