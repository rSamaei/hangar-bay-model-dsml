/**
 * Core discrete-event simulation orchestrator.
 *
 * Delegates initialization to state-initializer, event dispatch to
 * event-handlers, state mutations to state-mutator, and result
 * compilation to result-builder.
 *
 * Design reference: SIMULATION_DESIGN.md §5–§6
 */

import type { Model } from '../../../language/out/generated/ast.js';
import { EventQueue } from './event-queue.js';
import { PlacementEngine } from './placement-engine.js';
import { InductionTracker } from './induction-tracker.js';
import { buildSimulationResult, type PeakStats } from './result-builder.js';
import { initializeSimulation } from './state-initializer.js';
import { StateMutator } from './state-mutator.js';
import { EventHandlers } from './event-handlers.js';
import {
    DEFAULT_SIMULATION_CONFIG,
    type SimulationConfig,
    type SimulationResult,
    type WaitingAircraft,
} from './types.js';

// ============================================================
// DiscreteEventSimulator
// ============================================================

export class DiscreteEventSimulator {
    private readonly model: Model;
    private readonly config: SimulationConfig;

    constructor(model: Model, config?: Partial<SimulationConfig>) {
        this.model = model;
        this.config = { ...DEFAULT_SIMULATION_CONFIG, ...config };
    }

    /** Run the full simulation and return results. */
    run(): SimulationResult {
        const placementEngine = new PlacementEngine(this.model);
        const tracker = new InductionTracker();
        const queue = new EventQueue();

        // Step 1+2 — initialize state, fixed occupancy, and auto-induction arrivals
        const { state, dependencyMap, pendingArrivals, searchWindowStart } =
            initializeSimulation(this.model, queue);

        // Accumulated run data
        const peakStats: PeakStats = {
            maxQueueDepth: 0,
            maxQueueDepthTime: 0,
            peakOccupancy: 0,
            peakOccupancyTime: 0,
        };
        const expiredWaiting: WaitingAircraft[] = [];

        // Wire up collaborators
        const mutator = new StateMutator({
            tracker,
            config: this.config,
            dependencyMap,
            pendingArrivals,
            expiredWaiting,
            peakStats,
        });

        const handlers = new EventHandlers({
            placementEngine,
            tracker,
            config: this.config,
            mutator,
        });

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

            mutator.expireWaitingAircraft(state);
            mutator.updatePeakStats(state);

            switch (event.kind) {
                case 'ARRIVAL':
                    handlers.handleArrival(event, state, queue);
                    break;
                case 'DEPARTURE':
                    handlers.handleDeparture(event, state, queue);
                    break;
                case 'RETRY_PLACEMENT':
                    handlers.handleRetryPlacement(event, state, queue);
                    break;
                case 'DEPARTURE_RETRY':
                    handlers.handleDepartureRetry(event, state, queue);
                    break;
            }
        }

        // Step 4 — finalize
        mutator.finalise(state);

        return buildSimulationResult({
            state,
            eventCount,
            tracker,
            expiredWaiting,
            pendingArrivals,
            astAutoInductions: this.model.autoInductions,
            searchWindowStart,
            peakStats,
        });
    }
}
