/**
 * Core discrete-event simulation loop.
 *
 * Processes ArrivalEvents, DepartureEvents, RetryPlacementEvents, and
 * DepartureRetryEvents from a priority queue, mutating SimulationState
 * and producing a SimulationResult.
 *
 * Design reference: SIMULATION_DESIGN.md §5–§6
 */

import type { Model } from '../../../language/out/generated/ast.js';
import { calculateSearchWindow } from '../search/time-window.js';
import { EventQueue } from './event-queue.js';
import { PlacementEngine } from './placement-engine.js';
import {
    EVENT_PRIORITY,
    DEFAULT_SIMULATION_CONFIG,
    type SimulationConfig,
    type SimulationState,
    type SimulationResult,
    type SimulationStats,
    type SimulationPlacement,
    type FailedInduction,
    type SimulationEventRecord,
    type FixedOccupancy,
    type OccupiedBayInfo,
    type ActiveInduction,
    type CompletedInduction,
    type WaitingAircraft,
    type ScheduledEvent,
    type ArrivalEvent,
    type DepartureEvent,
    type RetryPlacementEvent,
    type DepartureRetryEvent,
    type PlacementRejection,
} from './types.js';

// Duration in the grammar is in minutes — convert to ms
const MINUTES_TO_MS = 60 * 1000;

// ============================================================
// DiscreteEventSimulator
// ============================================================

export class DiscreteEventSimulator {
    private readonly model: Model;
    private readonly config: SimulationConfig;
    private placementEngine!: PlacementEngine;

    /** Track max queue depth for statistics. */
    private maxQueueDepth = 0;
    /** Track peak bay occupancy for statistics. */
    private peakOccupancy = 0;

    /**
     * Map from auto-induction ID → list of dependent auto-induction IDs.
     * When an auto-induction completes, we check if any dependents are pending.
     */
    private readonly dependencyMap = new Map<string, string[]>();

    /**
     * Auto-inductions whose arrival is blocked by an unresolved `after` dependency
     * on another auto-induction (whose end time is not yet known).
     * Key = inductionId of the pending arrival.
     */
    private readonly pendingArrivals = new Map<string, ArrivalEvent>();

    /** Aircraft that expired while waiting (deadline exceeded). */
    private readonly expiredWaiting: WaitingAircraft[] = [];

    /** Track the originally requested arrival time per auto-induction for waitTime computation. */
    private readonly requestedArrivalTimes = new Map<string, number>();

    /** Track placement attempt counts per auto-induction. */
    private readonly placementAttemptCounts = new Map<string, number>();

    /** Track queue position when first queued (null if placed on first attempt). */
    private readonly queuePositions = new Map<string, number | null>();

    /** Cached search window start (epoch ms), set during initializeAutoInductions. */
    private searchWindowStart = 0;

    /** Track the first wait reason per auto-induction (the reason from the first failed placement). */
    private readonly waitReasons = new Map<string, string | null>();

    /** Track departure delay reasons per induction. */
    private readonly departureDelayReasons = new Map<string, string | null>();

    /** Track max queue depth PER hangar for statistics. */
    private readonly maxQueueDepthByHangar = new Map<string, number>();

    /** Track peak occupancy timestamp. */
    private peakOccupancyTime = 0;

    /** Track max queue depth timestamp. */
    private maxQueueDepthTime = 0;

    constructor(model: Model, config?: Partial<SimulationConfig>) {
        this.model = model;
        this.config = { ...DEFAULT_SIMULATION_CONFIG, ...config };
    }

    /** Run the full simulation and return results. */
    run(): SimulationResult {
        this.placementEngine = new PlacementEngine(this.model);
        const state = this.createEmptyState();
        const queue = new EventQueue();

        // Step 1 — load manual inductions as fixed occupancy
        this.initializeFixedOccupancy(state, queue);

        // Step 2 — create ArrivalEvents for each auto-induction
        this.initializeAutoInductions(state, queue);

        // Step 3 — process events
        let eventCount = 0;
        while (!queue.isEmpty()) {
            if (eventCount >= this.config.maxEvents) {
                state.eventLog.push({
                    kind: 'SIM_EVENT_LIMIT',
                    time: state.currentTime,
                    inductionId: '',
                    reason: `Circuit breaker: exceeded ${this.config.maxEvents} events`,
                });
                break;
            }

            const event = queue.pop()!;
            state.currentTime = event.time;
            eventCount++;

            // Expire waiting aircraft past their deadline
            this.expireWaitingAircraft(state);

            // Track queue depth
            if (state.waitingQueue.length > this.maxQueueDepth) {
                this.maxQueueDepth = state.waitingQueue.length;
            }

            // Track peak occupancy
            if (state.occupiedBays.size > this.peakOccupancy) {
                this.peakOccupancy = state.occupiedBays.size;
                this.peakOccupancyTime = state.currentTime;
            }

            // Dispatch
            switch (event.kind) {
                case 'ARRIVAL':
                    this.handleArrival(event, state, queue);
                    break;
                case 'DEPARTURE':
                    this.handleDeparture(event, state, queue);
                    break;
                case 'RETRY_PLACEMENT':
                    this.handleRetryPlacement(event, state, queue);
                    break;
                case 'DEPARTURE_RETRY':
                    this.handleDepartureRetry(event, state, queue);
                    break;
            }
        }

        // Step 4 — finalize: anything still in the queue becomes failed
        this.finalise(state);

        return this.buildResult(state, eventCount);
    }

    // ================================================================
    // Initialization
    // ================================================================

    private createEmptyState(): SimulationState {
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
     * Design reference: SIMULATION_DESIGN.md §5.1
     */
    private initializeFixedOccupancy(state: SimulationState, queue: EventQueue): void {
        for (let i = 0; i < this.model.inductions.length; i++) {
            const ind = this.model.inductions[i];
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
                const key = `${hangarName}::${bayName}`;
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
     * Handles `after` dependencies:
     * - If dependency is a manual induction: arrival = max(notBefore, manual.end)
     * - If dependency is another auto-induction: defer arrival until dependency departs
     */
    private initializeAutoInductions(state: SimulationState, queue: EventQueue): void {
        const searchWindow = calculateSearchWindow(this.model);
        const windowStart = searchWindow.start.getTime();
        this.searchWindowStart = windowStart;

        // Build a lookup of manual induction end times by ID
        const manualEndTimes = new Map<string, number>();
        for (let i = 0; i < this.model.inductions.length; i++) {
            const ind = this.model.inductions[i];
            const id = ind.id ?? `manual_${i}`;
            manualEndTimes.set(id, new Date(ind.end).getTime());
        }

        // Build set of all auto-induction IDs for dependency resolution
        const autoInductionIds = new Set<string>();
        for (const autoInd of this.model.autoInductions) {
            const aircraft = autoInd.aircraft?.ref;
            if (!aircraft) continue;
            const id = autoInd.id ?? `auto_${aircraft.name}`;
            autoInductionIds.add(id);
        }

        for (const autoInd of this.model.autoInductions) {
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

                // Manual induction dependency: use its end time
                const manualEnd = manualEndTimes.get(depId);
                if (manualEnd !== undefined) {
                    if (manualEnd > arrivalTime) arrivalTime = manualEnd;
                } else if (autoInductionIds.has(depId)) {
                    // Auto-induction dependency: we can't know end time yet
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
                // Defer this arrival until the dependency departs
                this.pendingArrivals.set(inductionId, event);
                // Register in dependency map
                const deps = this.dependencyMap.get(pendingAutoDep) ?? [];
                deps.push(inductionId);
                this.dependencyMap.set(pendingAutoDep, deps);
            } else {
                queue.push(event);
            }
        }
    }

    // ================================================================
    // Event handlers
    // ================================================================

    /**
     * Handle an aircraft arrival: attempt placement immediately.
     * If successful, occupy bays and schedule departure.
     * If failed, queue the aircraft (unless past deadline).
     */
    private handleArrival(
        event: ArrivalEvent,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        const aircraft = event.autoInduction.aircraft?.ref;
        if (!aircraft) return;

        // Record the originally requested arrival time for waitTime computation
        if (!this.requestedArrivalTimes.has(event.inductionId)) {
            this.requestedArrivalTimes.set(event.inductionId, event.time);
        }

        // Track placement attempts
        const prevAttempts = this.placementAttemptCounts.get(event.inductionId) ?? 0;
        this.placementAttemptCounts.set(event.inductionId, prevAttempts + 1);

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

        // Attempt placement
        const result = this.placementEngine.attemptPlacement(
            event.inductionId, aircraft as any, clearance, durationMs,
            preferredHangar, requires, state, this.config,
        );

        if (result.placed) {
            // Placed immediately — no queue position
            if (!this.queuePositions.has(event.inductionId)) {
                this.queuePositions.set(event.inductionId, null);
            }
            if (!this.waitReasons.has(event.inductionId)) {
                this.waitReasons.set(event.inductionId, null);
            }
            this.recordPlacement(result, aircraft.name, event.inductionId,
                event.autoInduction, state, queue);
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
            // Build structured wait reason from rejections
            const waitReason = this.buildWaitReason(result.rejections, aircraft.name);
            if (!this.waitReasons.has(event.inductionId)) {
                this.waitReasons.set(event.inductionId, waitReason);
            }
            // Queue for later retry
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
                placementAttempts: this.placementAttemptCounts.get(event.inductionId) ?? 1,
                queuePosition: state.waitingQueue.length,
            };
            state.waitingQueue.push(waiting);

            // Record queue position on first queue entry
            if (!this.queuePositions.has(event.inductionId)) {
                this.queuePositions.set(event.inductionId, waiting.queuePosition);
            }

            // Track queue depth
            if (state.waitingQueue.length > this.maxQueueDepth) {
                this.maxQueueDepth = state.waitingQueue.length;
                this.maxQueueDepthTime = state.currentTime;
            }

            state.eventLog.push({
                kind: 'ARRIVAL_QUEUED',
                time: state.currentTime,
                inductionId: event.inductionId,
                aircraft: aircraft.name,
                reason: result.rejections.map(r => r.ruleId).join(', '),
            });
        }
    }

    /**
     * Handle a departure event (maintenance ended).
     * For manual (fixed) inductions: free bays unconditionally.
     * For auto inductions: check departure path and handle blocking.
     */
    private handleDeparture(
        event: DepartureEvent,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        if (event.fixed) {
            // Manual departure: free bays unconditionally
            this.completeDeparture(event.inductionId, event.hangarName,
                event.bayNames, event.doorName, 'manual', state, queue);
        } else {
            // Auto departure: check if exit path is clear
            const depResult = this.placementEngine.checkDeparturePath(
                event.inductionId, event.hangarName, event.bayNames, state,
            );

            if (depResult.clear) {
                this.completeDeparture(event.inductionId, event.hangarName,
                    event.bayNames, event.doorName, 'auto', state, queue);
            } else {
                // Track first departure delay reason
                if (!this.departureDelayReasons.has(event.inductionId)) {
                    this.departureDelayReasons.set(
                        event.inductionId,
                        this.buildDepartureDelayReason(event, depResult.blockingInductionIds, state),
                    );
                }

                // Departure blocked
                state.eventLog.push({
                    kind: 'DEPARTURE_BLOCKED',
                    time: state.currentTime,
                    inductionId: event.inductionId,
                    hangar: event.hangarName,
                    bays: event.bayNames,
                    blockedBy: depResult.blockingInductionIds,
                    reason: `Blocked by: ${depResult.blockingInductionIds.join(', ')}`,
                });

                // Mark departure as blocked in active inductions
                const active = state.activeInductions.find(a => a.id === event.inductionId);
                if (active && active.departureBlockedSince === null) {
                    active.departureBlockedSince = state.currentTime;
                }

                // Add to pending departures if not already there
                const existingPending = state.pendingDepartures.find(
                    p => p.inductionId === event.inductionId,
                );
                if (!existingPending) {
                    state.pendingDepartures.push({
                        inductionId: event.inductionId,
                        aircraftName: active?.aircraftName ?? '',
                        hangarName: event.hangarName,
                        bayNames: event.bayNames,
                        doorName: event.doorName,
                        durationExpiredAt: state.currentTime,
                        retryCount: 0,
                    });
                }

                // Schedule retry when the earliest blocker is scheduled to depart
                const earliestBlockerEnd = this.findEarliestBlockerEnd(
                    depResult.blockingInductionIds, state,
                );
                const retryTime = earliestBlockerEnd ?? state.currentTime + 1;

                queue.push({
                    kind: 'DEPARTURE_RETRY',
                    time: retryTime,
                    priority: EVENT_PRIORITY.DEPARTURE_RETRY,
                    inductionId: event.inductionId,
                });
            }
        }
    }

    /**
     * Handle a retry-placement event: process the entire waiting queue.
     */
    private handleRetryPlacement(
        _event: RetryPlacementEvent,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        this.processWaitingQueue(state, queue);
    }

    /**
     * Handle a departure-retry event: re-check if the blocked departure can proceed.
     */
    private handleDepartureRetry(
        event: DepartureRetryEvent,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        const pending = state.pendingDepartures.find(
            p => p.inductionId === event.inductionId,
        );
        if (!pending) return; // Already departed via another path

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
            // Remove from pending
            const idx = state.pendingDepartures.indexOf(pending);
            if (idx >= 0) state.pendingDepartures.splice(idx, 1);

            this.completeDeparture(event.inductionId, pending.hangarName,
                pending.bayNames, pending.doorName, 'auto', state, queue);
        } else {
            // Still blocked — schedule another retry
            state.eventLog.push({
                kind: 'DEPARTURE_BLOCKED',
                time: state.currentTime,
                inductionId: event.inductionId,
                hangar: pending.hangarName,
                bays: pending.bayNames,
                blockedBy: depResult.blockingInductionIds,
                reason: `Still blocked by: ${depResult.blockingInductionIds.join(', ')}`,
            });

            const earliestBlockerEnd = this.findEarliestBlockerEnd(
                depResult.blockingInductionIds, state,
            );
            const retryTime = earliestBlockerEnd ?? state.currentTime + 1;

            queue.push({
                kind: 'DEPARTURE_RETRY',
                time: retryTime,
                priority: EVENT_PRIORITY.DEPARTURE_RETRY,
                inductionId: event.inductionId,
            });
        }
    }

    // ================================================================
    // Process waiting queue
    // ================================================================

    /**
     * Iterate through the waiting queue, attempting placement for each.
     * After each successful placement, state changes, so subsequent
     * attempts in the same pass see updated occupancy (first-come-first-served).
     */
    private processWaitingQueue(state: SimulationState, queue: EventQueue): void {
        const remaining: WaitingAircraft[] = [];

        for (const waiting of state.waitingQueue) {
            const aircraft = waiting.aircraft;
            const durationMs = waiting.autoInduction.duration * MINUTES_TO_MS;
            const preferredHangar = waiting.autoInduction.preferredHangar?.ref as any;
            const requires = waiting.autoInduction.requires;

            // Track placement attempt
            const prevAttempts = this.placementAttemptCounts.get(waiting.inductionId) ?? 0;
            this.placementAttemptCounts.set(waiting.inductionId, prevAttempts + 1);
            waiting.placementAttempts = prevAttempts + 1;

            const result = this.placementEngine.attemptPlacement(
                waiting.inductionId, aircraft as any, waiting.clearance as any,
                durationMs, preferredHangar, requires, state, this.config,
            );

            if (result.placed) {
                this.recordPlacement(result, aircraft.name, waiting.inductionId,
                    waiting.autoInduction, state, queue);
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
                // Still can't place — accumulate rejections and keep in queue
                waiting.rejections.push(...result.rejections);
                remaining.push(waiting);
            }
        }

        state.waitingQueue = remaining;
    }

    // ================================================================
    // Shared helpers
    // ================================================================

    /**
     * Record a successful placement: occupy bays, track active induction,
     * schedule departure event, and unlock any `after` dependents.
     */
    private recordPlacement(
        result: { hangarName: string; doorName: string; bayNames: string[]; startTime: number; endTime: number },
        aircraftName: string,
        inductionId: string,
        autoInduction: any,
        state: SimulationState,
        queue: EventQueue,
    ): void {
        // Occupy bays
        for (const bayName of result.bayNames) {
            const key = `${result.hangarName}::${bayName}`;
            const info: OccupiedBayInfo = {
                inductionId,
                aircraftName,
                hangarName: result.hangarName,
                bayNames: result.bayNames,
                doorName: result.doorName,
                startTime: result.startTime,
                endTime: result.endTime,
                fixed: false,
            };
            state.occupiedBays.set(key, info);
        }

        // Track as active induction
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

        // Track peak occupancy
        if (state.occupiedBays.size > this.peakOccupancy) {
            this.peakOccupancy = state.occupiedBays.size;
            this.peakOccupancyTime = state.currentTime;
        }

        // Schedule departure
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

    /**
     * Complete a departure: free bays, move to completed, trigger retry
     * for waiting queue and any `after` dependents.
     */
    private completeDeparture(
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
            state.occupiedBays.delete(`${hangarName}::${bayName}`);
        }

        // Move from active to completed
        const activeIdx = state.activeInductions.findIndex(a => a.id === inductionId);
        if (activeIdx >= 0) {
            const active = state.activeInductions[activeIdx];
            state.activeInductions.splice(activeIdx, 1);

            const requestedArrival = this.requestedArrivalTimes.get(inductionId);
            const waitTime = (kind === 'auto' && requestedArrival !== undefined)
                ? Math.max(0, active.actualStart - requestedArrival)
                : 0;

            state.completedInductions.push({
                id: active.id,
                kind,
                aircraftName: active.aircraftName,
                hangarName: active.hangarName,
                doorName: active.doorName,
                bayNames: active.bayNames,
                actualStart: active.actualStart,
                maintenanceEnd: active.scheduledEnd,
                actualEnd: state.currentTime,
                waitTime,
                departureDelay: Math.max(0, state.currentTime - active.scheduledEnd),
                waitReason: this.waitReasons.get(inductionId) ?? null,
                departureDelayReason: this.departureDelayReasons.get(inductionId) ?? null,
                placementAttempts: this.placementAttemptCounts.get(inductionId) ?? 1,
                queuePosition: this.queuePositions.get(inductionId) ?? null,
            });
        }

        state.eventLog.push({
            kind: 'DEPARTURE_CLEARED',
            time: state.currentTime,
            inductionId,
            hangar: hangarName,
            bays: bayNames,
        });

        // Unlock `after` dependents: if any auto-induction was waiting on this one
        const dependents = this.dependencyMap.get(inductionId);
        if (dependents) {
            for (const depId of dependents) {
                const pendingEvent = this.pendingArrivals.get(depId);
                if (pendingEvent) {
                    this.pendingArrivals.delete(depId);
                    // Update arrival time: max of original time and current time
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

        // Schedule retry for waiting queue
        if (state.waitingQueue.length > 0) {
            queue.push({
                kind: 'RETRY_PLACEMENT',
                time: state.currentTime,
                priority: EVENT_PRIORITY.RETRY_PLACEMENT,
            });
        }

        // Also re-check pending departures that might now be unblocked
        for (const pending of state.pendingDepartures) {
            if (pending.inductionId === inductionId) continue;
            if (pending.hangarName !== hangarName) continue;
            // Schedule an immediate departure retry for co-located pending departures
            queue.push({
                kind: 'DEPARTURE_RETRY',
                time: state.currentTime,
                priority: EVENT_PRIORITY.DEPARTURE_RETRY,
                inductionId: pending.inductionId,
            });
        }
    }

    /**
     * Find the earliest scheduled end time among the blocking inductions.
     * This lets us retry exactly when something might change.
     */
    private findEarliestBlockerEnd(
        blockerIds: string[],
        state: SimulationState,
    ): number | undefined {
        let earliest: number | undefined;

        for (const blockerId of blockerIds) {
            // Check active inductions
            const active = state.activeInductions.find(a => a.id === blockerId);
            if (active) {
                if (earliest === undefined || active.scheduledEnd < earliest) {
                    earliest = active.scheduledEnd;
                }
            }
            // Check occupiedBays
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

    // ================================================================
    // Expiry & finalization
    // ================================================================

    /** Remove waiting aircraft whose deadline has passed. */
    private expireWaitingAircraft(state: SimulationState): void {
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
    private finalise(state: SimulationState): void {
        // Anything still waiting → never placed
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
            // Remove from active
            const activeIdx = state.activeInductions.findIndex(a => a.id === pending.inductionId);
            if (activeIdx >= 0) {
                const active = state.activeInductions[activeIdx];
                state.activeInductions.splice(activeIdx, 1);
                const reqArr = this.requestedArrivalTimes.get(pending.inductionId);
                const pendingWait = reqArr !== undefined
                    ? Math.max(0, active.actualStart - reqArr)
                    : 0;
                state.completedInductions.push({
                    id: active.id,
                    kind: 'auto',
                    aircraftName: active.aircraftName,
                    hangarName: active.hangarName,
                    doorName: active.doorName,
                    bayNames: active.bayNames,
                    actualStart: active.actualStart,
                    maintenanceEnd: active.scheduledEnd,
                    actualEnd: state.currentTime,
                    waitTime: pendingWait,
                    departureDelay: state.currentTime - active.scheduledEnd,
                    waitReason: this.waitReasons.get(pending.inductionId) ?? null,
                    departureDelayReason: this.departureDelayReasons.get(pending.inductionId) ?? null,
                    placementAttempts: this.placementAttemptCounts.get(pending.inductionId) ?? 1,
                    queuePosition: this.queuePositions.get(pending.inductionId) ?? null,
                });
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
    // Structured reason builders
    // ================================================================

    /**
     * Build a structured wait reason from placement rejections.
     * Returns a human-readable, DSML-grounded explanation.
     */
    private buildWaitReason(
        rejections: PlacementRejection[],
        aircraftName: string,
    ): string {
        if (rejections.length === 0) return `No placement found for ${aircraftName}`;

        // Group by ruleId, take the most informative rejection
        const byRule = new Map<string, PlacementRejection[]>();
        for (const r of rejections) {
            const arr = byRule.get(r.ruleId) ?? [];
            arr.push(r);
            byRule.set(r.ruleId, arr);
        }

        const parts: string[] = [];
        for (const [ruleId, rejs] of byRule) {
            const r = rejs[0]; // representative
            const evidence = r.evidence as Record<string, any>;
            switch (ruleId) {
                case 'SFR16_TIME_OVERLAP': {
                    const bays = evidence.bayNames as string[] | undefined;
                    parts.push(`Bay set {${bays?.join(', ') ?? '?'}} has time conflict in ${r.hangar ?? '?'}`);
                    break;
                }
                case 'SFR11_DOOR_FIT':
                    parts.push(`No door in ${r.hangar ?? '?'} fits aircraft ${aircraftName}`);
                    break;
                case 'NO_SUITABLE_BAY_SET':
                    parts.push(`No connected bay set large enough in ${r.hangar ?? '?'}`);
                    break;
                case 'SFR_DYNAMIC_REACHABILITY': {
                    const unreachable = evidence.unreachableNodeIds as string[] | undefined;
                    parts.push(`Bays unreachable via access path in ${r.hangar ?? '?'} — blocked nodes: ${unreachable?.join(', ') ?? '?'}`);
                    break;
                }
                case 'SFR_CORRIDOR_FIT': {
                    const violations = evidence.corridorViolations as string[] | undefined;
                    parts.push(`Aircraft too wide for corridor in ${r.hangar ?? '?'} — blocked at: ${violations?.join(', ') ?? '?'}`);
                    break;
                }
                default:
                    parts.push(r.message);
            }
        }

        return parts.join('; ');
    }

    /**
     * Build a structured departure delay reason.
     */
    private buildDepartureDelayReason(
        event: DepartureEvent,
        blockingIds: string[],
        state: SimulationState,
    ): string {
        // Find the earliest blocker's scheduled end for context
        const blockerDetails = blockingIds.map(id => {
            const active = state.activeInductions.find(a => a.id === id);
            if (active) {
                const endIso = new Date(active.scheduledEnd).toISOString().replace(/:\d{2}\.\d{3}Z$/, '');
                return `${id} (departs ${endIso})`;
            }
            return id;
        });

        return `Exit path from {${event.bayNames.join(', ')}} to ${event.doorName || 'door'} blocked — occupied by ${blockerDetails.join(', ')}`;
    }

    // ================================================================
    // Result compilation
    // ================================================================

    private buildResult(state: SimulationState, eventCount: number): SimulationResult {
        // Partition completions into auto placements (for scheduledInductions)
        const scheduledInductions: SimulationPlacement[] = state.completedInductions
            .filter(c => c.kind === 'auto')
            .map(c => ({
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
            }));

        // Also include active auto-inductions that never departed (simulation ended)
        for (const active of state.activeInductions) {
            if (active.kind !== 'auto') continue;
            const reqArrival = this.requestedArrivalTimes.get(active.id);
            const activeWait = reqArrival !== undefined
                ? Math.max(0, active.actualStart - reqArrival)
                : 0;
            scheduledInductions.push({
                inductionId: active.id,
                aircraftName: active.aircraftName,
                hangarName: active.hangarName,
                doorName: active.doorName,
                bayNames: active.bayNames,
                actualStart: active.actualStart,
                maintenanceEnd: active.scheduledEnd,
                actualEnd: state.currentTime,
                requestedStart: active.actualStart - activeWait,
                waitTime: activeWait,
                departureDelay: Math.max(0, state.currentTime - active.scheduledEnd),
                waitReason: this.waitReasons.get(active.id) ?? null,
                departureDelayReason: this.departureDelayReasons.get(active.id) ?? null,
                placementAttempts: this.placementAttemptCounts.get(active.id) ?? 1,
                queuePosition: this.queuePositions.get(active.id) ?? null,
            });
        }

        // Build failed inductions from waiting queue + structurally infeasible + pending arrivals
        const failedInductions: FailedInduction[] = [];

        // Build a lookup for auto-induction AST nodes (needed for structurally infeasible)
        const autoAstById = new Map<string, typeof this.model.autoInductions[number]>();
        for (const autoInd of this.model.autoInductions) {
            const id = autoInd.id ?? `auto_${autoInd.aircraft?.ref?.name ?? 'unknown'}`;
            autoAstById.set(id, autoInd);
        }

        // From waiting queue (never placed)
        for (const waiting of state.waitingQueue) {
            failedInductions.push({
                inductionId: waiting.inductionId,
                aircraftName: waiting.aircraft.name,
                preferredHangar: waiting.autoInduction.preferredHangar?.ref?.name,
                reason: waiting.deadline !== null && state.currentTime > waiting.deadline
                    ? 'SIM_DEADLINE_EXCEEDED'
                    : 'SIM_NEVER_PLACED',
                lastAttemptTime: waiting.rejections.length > 0
                    ? waiting.rejections[waiting.rejections.length - 1].attemptTime
                    : null,
                rejections: waiting.rejections,
                requestedArrival: waiting.requestedArrival,
                deadline: waiting.deadline,
            });
        }

        // From expired waiting aircraft (deadline exceeded during simulation)
        for (const expired of this.expiredWaiting) {
            failedInductions.push({
                inductionId: expired.inductionId,
                aircraftName: expired.aircraft.name,
                preferredHangar: expired.autoInduction.preferredHangar?.ref?.name,
                reason: 'SIM_DEADLINE_EXCEEDED',
                lastAttemptTime: expired.rejections.length > 0
                    ? expired.rejections[expired.rejections.length - 1].attemptTime
                    : null,
                rejections: expired.rejections,
                requestedArrival: expired.requestedArrival,
                deadline: expired.deadline,
            });
        }

        // From structurally infeasible (logged during init)
        for (const entry of state.eventLog) {
            if (entry.kind === 'STRUCTURALLY_INFEASIBLE') {
                const astNode = autoAstById.get(entry.inductionId);
                const notBeforeMs = astNode?.notBefore ? new Date(astNode.notBefore).getTime() : this.searchWindowStart;
                const notAfterMs = astNode?.notAfter ? new Date(astNode.notAfter).getTime() : null;
                failedInductions.push({
                    inductionId: entry.inductionId,
                    aircraftName: entry.aircraft ?? '',
                    reason: 'STRUCTURALLY_INFEASIBLE',
                    lastAttemptTime: null,
                    rejections: [],
                    requestedArrival: notBeforeMs,
                    deadline: notAfterMs,
                });
            }
        }

        // From pending arrivals (dependency never resolved)
        for (const [depId, event] of this.pendingArrivals) {
            const aircraft = event.autoInduction.aircraft?.ref;
            const notAfterMs = event.autoInduction.notAfter
                ? new Date(event.autoInduction.notAfter).getTime()
                : null;
            failedInductions.push({
                inductionId: depId,
                aircraftName: aircraft?.name ?? '',
                reason: 'DEPENDENCY_NEVER_PLACED',
                lastAttemptTime: null,
                rejections: [],
                requestedArrival: event.time,
                deadline: notAfterMs,
            });
        }

        // Statistics
        const firstTime = state.eventLog.length > 0
            ? state.eventLog[0].time
            : 0;
        const lastTime = state.eventLog.length > 0
            ? state.eventLog[state.eventLog.length - 1].time
            : 0;

        const deadlockCount = state.eventLog.filter(e => e.kind === 'DEADLOCK_DETECTED').length;

        // Find max wait time and corresponding induction
        let maxWaitTime = 0;
        let maxWaitInduction = '';
        for (const p of scheduledInductions) {
            if (p.waitTime > maxWaitTime) {
                maxWaitTime = p.waitTime;
                maxWaitInduction = p.inductionId;
            }
        }

        const statistics: SimulationStats = {
            simulatedDuration: lastTime - firstTime,
            totalEvents: eventCount,
            totalAutoInductions: this.model.autoInductions.length,
            placedCount: scheduledInductions.length,
            failedCount: failedInductions.length,
            maxQueueDepth: this.maxQueueDepth,
            maxQueueDepthTime: this.maxQueueDepthTime,
            totalWaitTime: scheduledInductions.reduce((sum, p) => sum + p.waitTime, 0),
            totalDepartureDelay: scheduledInductions.reduce((sum, p) => sum + p.departureDelay, 0),
            maxWaitTime,
            maxWaitInduction,
            deadlockCount,
            avgUtilisation: 0, // TODO: compute from bay-time data
            peakOccupancy: this.peakOccupancy,
            peakOccupancyTime: this.peakOccupancyTime,
            utilisationByHangar: {},
            windowStart: firstTime,
            windowEnd: lastTime,
        };

        return {
            scheduledInductions,
            failedInductions,
            eventLog: state.eventLog,
            statistics,
        };
    }
}
