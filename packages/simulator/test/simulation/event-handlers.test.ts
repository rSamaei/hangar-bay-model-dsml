/**
 * Unit tests for EventHandlers — focuses on uncovered branches:
 *   - handleDepartureRetry: retryCount > maxDepartureRetries → DEADLOCK_DETECTED (lines 216-223)
 *   - handleDepartureRetry: path blocked again → logAndScheduleDepartureRetry (lines 236-241)
 *   - handleDepartureRetry: no pending departure found → early return (line 212)
 *   - handleDepartureRetry: departure clears → completeDeparture (lines 229-234)
 */
import { describe, expect, test, vi } from 'vitest';
import { EventHandlers } from '../../src/simulation/event-handlers.js';
import { EventQueue } from '../../src/simulation/event-queue.js';
import {
    DEFAULT_SIMULATION_CONFIG,
    type SimulationState,
    type DepartureRetryEvent,
    type PendingDeparture,
    EVENT_PRIORITY,
} from '../../src/simulation/types.js';

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

function mockPlacementEngine(depResult: { clear: boolean; exitDoor?: string; blockingInductionIds?: string[] } = { clear: true, exitDoor: '' }) {
    return {
        checkDeparturePath: vi.fn().mockReturnValue(
            depResult.clear
                ? { clear: true, exitDoor: depResult.exitDoor ?? '' }
                : { clear: false, blockingInductionIds: depResult.blockingInductionIds ?? ['OTHER'] },
        ),
        attemptPlacement: vi.fn(),
    };
}

function mockTracker() {
    return {
        buildCompleted: vi.fn().mockReturnValue({ id: 'IND1' }),
        record: vi.fn(),
        meta: new Map(),
        recordPlacement: vi.fn(),
        recordWait: vi.fn(),
        recordDepartureBlock: vi.fn(),
    };
}

function mockMutator() {
    return {
        completeDeparture: vi.fn(),
        logAndScheduleDepartureRetry: vi.fn(),
        occupyBays: vi.fn(),
        handleArrivalPlaced: vi.fn(),
        handleArrivalQueued: vi.fn(),
        handleDepartureBlocked: vi.fn(),
        processWaitingQueue: vi.fn(),
        expireDeadlines: vi.fn(),
        unlockDependencies: vi.fn(),
    };
}

function emptyState(currentTime = 0): SimulationState {
    return {
        currentTime,
        occupiedBays: new Map(),
        waitingQueue: [],
        pendingDepartures: [],
        activeInductions: [],
        completedInductions: [],
        fixedOccupancy: [],
        eventLog: [],
    };
}

function mkPendingDeparture(inductionId: string, retryCount = 0): PendingDeparture {
    return {
        inductionId,
        aircraftName: 'Cessna',
        hangarName: 'Alpha',
        bayNames: ['Bay1'],
        doorName: 'Door1',
        durationExpiredAt: 1000,
        retryCount,
    };
}

function mkDepartureRetryEvent(inductionId: string): DepartureRetryEvent {
    return {
        kind: 'DEPARTURE_RETRY',
        time: 5000,
        priority: EVENT_PRIORITY.DEPARTURE_RETRY,
        inductionId,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventHandlers.handleDepartureRetry', () => {
    test('no matching pending departure → silent return (no mutator calls)', () => {
        const pe = mockPlacementEngine();
        const tracker = mockTracker();
        const mutator = mockMutator();
        const handlers = new EventHandlers({
            placementEngine: pe as any,
            tracker: tracker as any,
            config: DEFAULT_SIMULATION_CONFIG,
            mutator: mutator as any,
        });

        const state = emptyState();
        // pendingDepartures is empty — no match for 'IND_MISSING'
        const event = mkDepartureRetryEvent('IND_MISSING');
        handlers.handleDepartureRetry(event, state, new EventQueue());

        expect(mutator.completeDeparture).not.toHaveBeenCalled();
        expect(mutator.logAndScheduleDepartureRetry).not.toHaveBeenCalled();
    });

    test('retryCount exceeds maxDepartureRetries → DEADLOCK_DETECTED logged', () => {
        const pe = mockPlacementEngine({ clear: true });
        const tracker = mockTracker();
        const mutator = mockMutator();
        const config = { ...DEFAULT_SIMULATION_CONFIG, maxDepartureRetries: 2 };
        const handlers = new EventHandlers({
            placementEngine: pe as any,
            tracker: tracker as any,
            config,
            mutator: mutator as any,
        });

        const state = emptyState(5000);
        const pending = mkPendingDeparture('IND1', 2); // retryCount=2; after ++ it becomes 3 > 2
        state.pendingDepartures.push(pending);

        const event = mkDepartureRetryEvent('IND1');
        handlers.handleDepartureRetry(event, state, new EventQueue());

        // Should log DEADLOCK_DETECTED and NOT call completeDeparture
        expect(state.eventLog).toHaveLength(1);
        expect(state.eventLog[0].kind).toBe('DEADLOCK_DETECTED');
        expect(state.eventLog[0].inductionId).toBe('IND1');
        expect(mutator.completeDeparture).not.toHaveBeenCalled();
        expect(mutator.logAndScheduleDepartureRetry).not.toHaveBeenCalled();
    });

    test('departure path clear → completeDeparture called, pending removed', () => {
        const pe = mockPlacementEngine({ clear: true, exitDoor: 'Door1' });
        const tracker = mockTracker();
        const mutator = mockMutator();
        const handlers = new EventHandlers({
            placementEngine: pe as any,
            tracker: tracker as any,
            config: DEFAULT_SIMULATION_CONFIG,
            mutator: mutator as any,
        });

        const state = emptyState(5000);
        const pending = mkPendingDeparture('IND1', 0);
        state.pendingDepartures.push(pending);

        const queue = new EventQueue();
        handlers.handleDepartureRetry(mkDepartureRetryEvent('IND1'), state, queue);

        expect(mutator.completeDeparture).toHaveBeenCalledWith(
            'IND1', 'Alpha', ['Bay1'], 'Door1', 'auto', state, queue,
        );
        expect(state.pendingDepartures).toHaveLength(0);
        expect(mutator.logAndScheduleDepartureRetry).not.toHaveBeenCalled();
    });

    test('departure path still blocked → logAndScheduleDepartureRetry called', () => {
        const pe = mockPlacementEngine({ clear: false, blockingInductionIds: ['IND2', 'IND3'] });
        const tracker = mockTracker();
        const mutator = mockMutator();
        const handlers = new EventHandlers({
            placementEngine: pe as any,
            tracker: tracker as any,
            config: DEFAULT_SIMULATION_CONFIG,
            mutator: mutator as any,
        });

        const state = emptyState(5000);
        const pending = mkPendingDeparture('IND1', 0);
        state.pendingDepartures.push(pending);

        const queue = new EventQueue();
        handlers.handleDepartureRetry(mkDepartureRetryEvent('IND1'), state, queue);

        expect(mutator.logAndScheduleDepartureRetry).toHaveBeenCalledWith(
            'IND1', 'Alpha', ['Bay1'],
            ['IND2', 'IND3'],
            state, queue,
            expect.stringContaining('IND2'),
        );
        expect(mutator.completeDeparture).not.toHaveBeenCalled();
        // pending departure still present (not removed)
        expect(state.pendingDepartures).toHaveLength(1);
    });
});
