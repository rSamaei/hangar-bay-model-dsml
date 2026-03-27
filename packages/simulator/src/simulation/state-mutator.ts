/**
 * State mutation operations for the discrete-event simulation.
 *
 * Handles bay occupation/release, departure blocking, dependency
 * unlocking, peak-stats tracking, waiting-queue expiry, and finalization.
 */

import { EventQueue } from './event-queue.js';
import { InductionTracker } from './induction-tracker.js';
import { buildDepartureDelayReason } from './reason-builders.js';
import type { PeakStats } from './result-builder.js';
import {
    EVENT_PRIORITY,
    bayKey,
    type SimulationConfig,
    type SimulationState,
    type ArrivalEvent,
    type DepartureEvent,
    type WaitingAircraft,
} from './types.js';

// ============================================================
// Dependencies injected at construction time
// ============================================================

export interface StateMutatorDeps {
    tracker: InductionTracker;
    config: SimulationConfig;
    dependencyMap: Map<string, string[]>;
    pendingArrivals: Map<string, ArrivalEvent>;
    expiredWaiting: WaitingAircraft[];
    peakStats: PeakStats;
}

// ============================================================
// StateMutator
// ============================================================

export class StateMutator {
    private readonly tracker: InductionTracker;
    private readonly config: SimulationConfig;
    private readonly dependencyMap: Map<string, string[]>;
    private readonly pendingArrivals: Map<string, ArrivalEvent>;
    private readonly expiredWaiting: WaitingAircraft[];
    private readonly peakStats: PeakStats;

    constructor(deps: StateMutatorDeps) {
        this.tracker = deps.tracker;
        this.config = deps.config;
        this.dependencyMap = deps.dependencyMap;
        this.pendingArrivals = deps.pendingArrivals;
        this.expiredWaiting = deps.expiredWaiting;
        this.peakStats = deps.peakStats;
    }

    // ================================================================
    // Placement recording
    // ================================================================

    /**
     * Record a successful placement: occupy bays, track active induction,
     * schedule departure event, and update peak stats.
     */
    recordPlacement(
        result: { hangarName: string; doorName: string; bayNames: string[]; startTime: number; endTime: number },
        aircraftName: string,
        inductionId: string,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        for (const bayName of result.bayNames) {
            const key = bayKey(result.hangarName, bayName);
            state.occupiedBays.set(key, {
                inductionId,
                aircraftName,
                hangarName: result.hangarName,
                bayNames: result.bayNames,
                doorName: result.doorName,
                startTime: result.startTime,
                endTime: result.endTime,
                fixed: false,
            });
        }

        state.activeInductions.push({
            id: inductionId,
            kind: 'auto',
            aircraftName,
            hangarName: result.hangarName,
            doorName: result.doorName,
            bayNames: result.bayNames,
            actualStart: result.startTime,
            scheduledEnd: result.endTime,
            departureBlockedSince: null,
        });

        this.updatePeakStats(state);

        queue.push({
            kind: 'DEPARTURE',
            time: result.endTime,
            priority: EVENT_PRIORITY.DEPARTURE,
            inductionId,
            hangarName: result.hangarName,
            bayNames: result.bayNames,
            doorName: result.doorName,
            fixed: false,
        });
    }

    // ================================================================
    // Departure completion
    // ================================================================

    /**
     * Complete a departure: free bays, move to completed, trigger retry
     * for waiting queue, unlock `after` dependents, and re-check pending departures.
     */
    completeDeparture(
        inductionId: string,
        hangarName: string,
        bayNames: string[],
        doorName: string,
        kind: 'manual' | 'auto',
        state: SimulationState,
        queue: EventQueue,
    ): void {
        // Free bays
        for (const bayName of bayNames) {
            state.occupiedBays.delete(bayKey(hangarName, bayName));
        }

        // Move from active to completed
        const activeIdx = state.activeInductions.findIndex(a => a.id === inductionId);
        if (activeIdx >= 0) {
            const active = state.activeInductions[activeIdx];
            state.activeInductions.splice(activeIdx, 1);
            state.completedInductions.push(
                this.tracker.buildCompleted(active, state.currentTime, kind),
            );
        }

        state.eventLog.push({
            kind: 'DEPARTURE_CLEARED',
            time: state.currentTime,
            inductionId,
            hangar: hangarName,
            bays: bayNames,
        });

        // Unlock `after` dependents
        this.unlockDependents(inductionId, state, queue);

        // Schedule retry for waiting queue
        if (state.waitingQueue.length > 0) {
            queue.push({
                kind: 'RETRY_PLACEMENT',
                time: state.currentTime,
                priority: EVENT_PRIORITY.RETRY_PLACEMENT,
            });
        }

        // Re-check pending departures that might now be unblocked
        for (const pending of state.pendingDepartures) {
            if (pending.inductionId === inductionId) continue;
            if (pending.hangarName !== hangarName) continue;
            queue.push({
                kind: 'DEPARTURE_RETRY',
                time: state.currentTime,
                priority: EVENT_PRIORITY.DEPARTURE_RETRY,
                inductionId: pending.inductionId,
            });
        }
    }

    // ================================================================
    // Blocked departure handling
    // ================================================================

    /**
     * Handle a blocked departure: log it, add to pending, schedule retry.
     */
    handleBlockedDeparture(
        inductionId: string,
        hangarName: string,
        bayNames: string[],
        doorName: string,
        event: DepartureEvent,
        blockingIds: string[],
        state: SimulationState,
        queue: EventQueue,
    ): void {
        // Track first departure delay reason
        this.tracker.recordDepartureDelayReason(
            inductionId,
            buildDepartureDelayReason(event, blockingIds, state),
        );

        // Mark departure as blocked in active inductions
        const active = state.activeInductions.find(a => a.id === inductionId);
        if (active && active.departureBlockedSince === null) {
            active.departureBlockedSince = state.currentTime;
        }

        // Add to pending departures if not already there
        if (!state.pendingDepartures.some(p => p.inductionId === inductionId)) {
            state.pendingDepartures.push({
                inductionId,
                aircraftName: active?.aircraftName ?? '',
                hangarName,
                bayNames,
                doorName,
                durationExpiredAt: state.currentTime,
                retryCount: 0,
            });
        }

        this.logAndScheduleDepartureRetry(
            inductionId, hangarName, bayNames, blockingIds, state, queue,
            `Blocked by: ${blockingIds.join(', ')}`,
        );
    }

    /**
     * Log DEPARTURE_BLOCKED and schedule a retry at the earliest blocker's end time.
     */
    logAndScheduleDepartureRetry(
        inductionId: string,
        hangarName: string,
        bayNames: string[],
        blockingIds: string[],
        state: SimulationState,
        queue: EventQueue,
        reason: string,
    ): void {
        state.eventLog.push({
            kind: 'DEPARTURE_BLOCKED',
            time: state.currentTime,
            inductionId,
            hangar: hangarName,
            bays: bayNames,
            blockedBy: blockingIds,
            reason,
        });

        const retryTime = this.findEarliestBlockerEnd(blockingIds, state)
            ?? state.currentTime + 1;

        queue.push({
            kind: 'DEPARTURE_RETRY',
            time: retryTime,
            priority: EVENT_PRIORITY.DEPARTURE_RETRY,
            inductionId,
        });
    }

    // ================================================================
    // Statistics & lifecycle
    // ================================================================

    /** Update peak queue depth and bay occupancy stats. */
    updatePeakStats(state: SimulationState): void {
        if (state.waitingQueue.length > this.peakStats.maxQueueDepth) {
            this.peakStats.maxQueueDepth = state.waitingQueue.length;
            this.peakStats.maxQueueDepthTime = state.currentTime;
        }
        if (state.occupiedBays.size > this.peakStats.peakOccupancy) {
            this.peakStats.peakOccupancy = state.occupiedBays.size;
            this.peakStats.peakOccupancyTime = state.currentTime;
        }
    }

    /** Remove waiting aircraft whose deadline has passed. */
    expireWaitingAircraft(state: SimulationState): void {
        const remaining: WaitingAircraft[] = [];
        for (const waiting of state.waitingQueue) {
            if (waiting.deadline !== null && state.currentTime > waiting.deadline) {
                state.eventLog.push({
                    kind: 'DEADLINE_EXPIRED',
                    time: state.currentTime,
                    inductionId: waiting.inductionId,
                    aircraft: waiting.aircraft.name,
                    reason: 'notAfter deadline exceeded',
                });
                this.expiredWaiting.push(waiting);
            } else {
                remaining.push(waiting);
            }
        }
        state.waitingQueue = remaining;
    }

    /** Finalize: record anything still stuck as failed. */
    finalise(state: SimulationState): void {
        for (const waiting of state.waitingQueue) {
            state.eventLog.push({
                kind: 'DEADLINE_EXPIRED',
                time: state.currentTime,
                inductionId: waiting.inductionId,
                aircraft: waiting.aircraft.name,
                reason: 'Still in queue at simulation end',
            });
        }

        // Anything still in pendingDepartures → stuck (complete with delay)
        for (const pending of state.pendingDepartures) {
            const activeIdx = state.activeInductions.findIndex(a => a.id === pending.inductionId);
            if (activeIdx >= 0) {
                const active = state.activeInductions[activeIdx];
                state.activeInductions.splice(activeIdx, 1);
                state.completedInductions.push(
                    this.tracker.buildCompleted(active, state.currentTime, 'auto'),
                );
            }
        }

        // Any pending arrivals (unresolved auto-after deps) → failed
        for (const [depId, event] of this.pendingArrivals) {
            const aircraft = event.autoInduction.aircraft?.ref;
            state.eventLog.push({
                kind: 'DEADLINE_EXPIRED',
                time: state.currentTime,
                inductionId: depId,
                aircraft: aircraft?.name,
                reason: 'Dependency never placed — arrival never triggered',
            });
        }
    }

    // ================================================================
    // Private helpers
    // ================================================================

    /** Unlock `after` dependents when an induction departs. */
    private unlockDependents(
        inductionId: string,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        const dependents = this.dependencyMap.get(inductionId);
        if (!dependents) return;

        for (const depId of dependents) {
            const pendingEvent = this.pendingArrivals.get(depId);
            if (pendingEvent) {
                this.pendingArrivals.delete(depId);
                pendingEvent.time = Math.max(pendingEvent.time, state.currentTime);
                queue.push(pendingEvent);

                state.eventLog.push({
                    kind: 'DEPENDENCY_UNLOCKED',
                    time: state.currentTime,
                    inductionId: depId,
                    reason: `Dependency ${inductionId} departed`,
                });
            }
        }
        this.dependencyMap.delete(inductionId);
    }

    /**
     * Find the earliest scheduled end time among the blocking inductions.
     */
    private findEarliestBlockerEnd(
        blockerIds: string[],
        state: SimulationState,
    ): number | undefined {
        let earliest: number | undefined;

        for (const blockerId of blockerIds) {
            const active = state.activeInductions.find(a => a.id === blockerId);
            if (active) {
                if (earliest === undefined || active.scheduledEnd < earliest) {
                    earliest = active.scheduledEnd;
                }
            }
            for (const [, info] of state.occupiedBays) {
                if (info.inductionId === blockerId) {
                    if (earliest === undefined || info.endTime < earliest) {
                        earliest = info.endTime;
                    }
                    break;
                }
            }
        }

        return earliest;
    }
}
