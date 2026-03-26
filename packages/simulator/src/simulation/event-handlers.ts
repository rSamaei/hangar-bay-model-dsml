/**
 * Event dispatch handlers for the discrete-event simulation.
 *
 * Each handler processes one event type (ARRIVAL, DEPARTURE,
 * RETRY_PLACEMENT, DEPARTURE_RETRY) and delegates state mutations
 * to StateMutator.
 */

import { EventQueue } from './event-queue.js';
import { InductionTracker } from './induction-tracker.js';
import { PlacementEngine } from './placement-engine.js';
import { buildWaitReason } from './reason-builders.js';
import { StateMutator } from './state-mutator.js';
import {
    type SimulationConfig,
    type SimulationState,
    type ArrivalEvent,
    type DepartureEvent,
    type RetryPlacementEvent,
    type DepartureRetryEvent,
    type WaitingAircraft,
} from './types.js';

// Duration in the grammar is in minutes — convert to ms
const MINUTES_TO_MS = 60 * 1000;

// ============================================================
// Dependencies
// ============================================================

export interface EventHandlerDeps {
    placementEngine: PlacementEngine;
    tracker: InductionTracker;
    config: SimulationConfig;
    mutator: StateMutator;
}

// ============================================================
// EventHandlers
// ============================================================

export class EventHandlers {
    private readonly placementEngine: PlacementEngine;
    private readonly tracker: InductionTracker;
    private readonly config: SimulationConfig;
    private readonly mutator: StateMutator;

    constructor(deps: EventHandlerDeps) {
        this.placementEngine = deps.placementEngine;
        this.tracker = deps.tracker;
        this.config = deps.config;
        this.mutator = deps.mutator;
    }

    // ================================================================
    // ARRIVAL
    // ================================================================

    /**
     * Handle an aircraft arrival: attempt placement immediately.
     * If successful, occupy bays and schedule departure.
     * If failed, queue the aircraft (unless past deadline).
     */
    handleArrival(
        event: ArrivalEvent,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        const aircraft = event.autoInduction.aircraft?.ref;
        if (!aircraft) return;

        this.tracker.recordRequestedArrival(event.inductionId, event.time);
        this.tracker.incrementAttempts(event.inductionId);

        const durationMs = event.autoInduction.duration * MINUTES_TO_MS;
        const clearance = (event.autoInduction.clearance?.ref ?? aircraft.clearance?.ref) as any;
        const preferredHangar = event.autoInduction.preferredHangar?.ref as any;
        const requires = event.autoInduction.requires;

        // Check deadline before attempting placement
        const deadline = event.autoInduction.notAfter
            ? new Date(event.autoInduction.notAfter).getTime()
            : null;
        if (deadline !== null && state.currentTime > deadline) {
            state.eventLog.push({
                kind: 'DEADLINE_EXPIRED',
                time: state.currentTime,
                inductionId: event.inductionId,
                aircraft: aircraft.name,
                reason: 'notAfter deadline already exceeded at arrival',
            });
            return;
        }

        const result = this.placementEngine.attemptPlacement(
            event.inductionId, aircraft as any, clearance, durationMs,
            preferredHangar, requires, state, this.config,
        );

        if (result.placed) {
            this.tracker.recordImmediatePlacement(event.inductionId);
            this.tracker.recordWaitReason(event.inductionId, null);
            this.mutator.recordPlacement(result, aircraft.name, event.inductionId,
                state, queue);
            state.eventLog.push({
                kind: 'ARRIVAL_PLACED',
                time: state.currentTime,
                inductionId: event.inductionId,
                aircraft: aircraft.name,
                hangar: result.hangarName,
                bays: result.bayNames,
                door: result.doorName,
            });
        } else {
            const waitReason = buildWaitReason(result.rejections, aircraft.name);
            this.tracker.recordWaitReason(event.inductionId, waitReason);

            const waiting: WaitingAircraft = {
                inductionId: event.inductionId,
                autoInduction: event.autoInduction,
                aircraft: aircraft as any,
                clearance,
                requestedArrival: event.time,
                deadline,
                hangarCandidates: [],
                dependenciesMet: true,
                spatialCandidates: event.spatialCandidates,
                rejections: [...result.rejections],
                placementAttempts: this.tracker.getAttempts(event.inductionId),
                queuePosition: state.waitingQueue.length,
            };
            state.waitingQueue.push(waiting);
            this.tracker.recordQueuePosition(event.inductionId, waiting.queuePosition);
            this.mutator.updatePeakStats(state);

            state.eventLog.push({
                kind: 'ARRIVAL_QUEUED',
                time: state.currentTime,
                inductionId: event.inductionId,
                aircraft: aircraft.name,
                hangar: preferredHangar?.name,
                reason: result.rejections.map(r => r.ruleId).join(', '),
            });
        }
    }

    // ================================================================
    // DEPARTURE
    // ================================================================

    /**
     * Handle a departure event (maintenance ended).
     * For manual (fixed) inductions: free bays unconditionally.
     * For auto inductions: check departure path and handle blocking.
     */
    handleDeparture(
        event: DepartureEvent,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        if (event.fixed) {
            this.mutator.completeDeparture(event.inductionId, event.hangarName,
                event.bayNames, event.doorName, 'manual', state, queue);
            return;
        }

        const depResult = this.placementEngine.checkDeparturePath(
            event.inductionId, event.hangarName, event.bayNames, state,
        );

        if (depResult.clear) {
            this.mutator.completeDeparture(event.inductionId, event.hangarName,
                event.bayNames, event.doorName, 'auto', state, queue);
        } else {
            this.mutator.handleBlockedDeparture(
                event.inductionId, event.hangarName, event.bayNames,
                event.doorName, event, depResult.blockingInductionIds, state, queue,
            );
        }
    }

    // ================================================================
    // RETRY_PLACEMENT
    // ================================================================

    /**
     * Handle a retry-placement event: process the entire waiting queue.
     */
    handleRetryPlacement(
        _event: RetryPlacementEvent,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        this.processWaitingQueue(state, queue);
    }

    // ================================================================
    // DEPARTURE_RETRY
    // ================================================================

    /**
     * Handle a departure-retry event: re-check if the blocked departure can proceed.
     */
    handleDepartureRetry(
        event: DepartureRetryEvent,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        const pending = state.pendingDepartures.find(
            p => p.inductionId === event.inductionId,
        );
        if (!pending) return;

        pending.retryCount++;
        if (pending.retryCount > this.config.maxDepartureRetries) {
            state.eventLog.push({
                kind: 'DEADLOCK_DETECTED',
                time: state.currentTime,
                inductionId: event.inductionId,
                reason: `Exceeded ${this.config.maxDepartureRetries} departure retries`,
            });
            return;
        }

        const depResult = this.placementEngine.checkDeparturePath(
            event.inductionId, pending.hangarName, pending.bayNames, state,
        );

        if (depResult.clear) {
            const idx = state.pendingDepartures.indexOf(pending);
            if (idx >= 0) state.pendingDepartures.splice(idx, 1);

            this.mutator.completeDeparture(event.inductionId, pending.hangarName,
                pending.bayNames, pending.doorName, 'auto', state, queue);
        } else {
            this.mutator.logAndScheduleDepartureRetry(
                event.inductionId, pending.hangarName, pending.bayNames,
                depResult.blockingInductionIds, state, queue,
                `Still blocked by: ${depResult.blockingInductionIds.join(', ')}`,
            );
        }
    }

    // ================================================================
    // Private helpers
    // ================================================================

    /**
     * Process the waiting queue: attempt placement for each waiting aircraft.
     */
    private processWaitingQueue(state: SimulationState, queue: EventQueue): void {
        const remaining: WaitingAircraft[] = [];

        for (const waiting of state.waitingQueue) {
            const aircraft = waiting.aircraft;
            const durationMs = waiting.autoInduction.duration * MINUTES_TO_MS;
            const preferredHangar = waiting.autoInduction.preferredHangar?.ref as any;
            const requires = waiting.autoInduction.requires;

            this.tracker.incrementAttempts(waiting.inductionId);
            waiting.placementAttempts = this.tracker.getAttempts(waiting.inductionId);

            const result = this.placementEngine.attemptPlacement(
                waiting.inductionId, aircraft as any, waiting.clearance as any,
                durationMs, preferredHangar, requires, state, this.config,
            );

            if (result.placed) {
                this.mutator.recordPlacement(result, aircraft.name, waiting.inductionId,
                    state, queue);
                state.eventLog.push({
                    kind: 'RETRY_PLACED',
                    time: state.currentTime,
                    inductionId: waiting.inductionId,
                    aircraft: aircraft.name,
                    hangar: result.hangarName,
                    bays: result.bayNames,
                    door: result.doorName,
                });
            } else {
                waiting.rejections.push(...result.rejections);
                remaining.push(waiting);
            }
        }

        state.waitingQueue = remaining;
    }
}
