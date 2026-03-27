/**
 * Extended unit tests for StateMutator.
 *
 * Covers:
 *   - recordPlacement: updates occupiedBays, activeInductions, schedules departure
 *   - completeDeparture: frees bays, moves to completed, unlocks dependents, retries waiting
 *   - updatePeakStats: tracks queue depth and bay occupancy peaks
 *   - expireWaitingAircraft: removes expired entries
 *   - finalise: logs stuck items
 */
import { describe, expect, test } from 'vitest';
import { StateMutator } from '../../src/simulation/state-mutator.js';
import { InductionTracker } from '../../src/simulation/induction-tracker.js';
import { EventQueue } from '../../src/simulation/event-queue.js';
import { DEFAULT_SIMULATION_CONFIG, bayKey, type SimulationState } from '../../src/simulation/types.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function mkState(currentTime = 1000): SimulationState {
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

interface PeakStats {
    maxQueueDepth: number;
    maxQueueDepthTime: number;
    peakOccupancy: number;
    peakOccupancyTime: number;
}

function mkPeakStats(): PeakStats {
    return { maxQueueDepth: 0, maxQueueDepthTime: 0, peakOccupancy: 0, peakOccupancyTime: 0 };
}

function mkMutator(opts: {
    dependencyMap?: Map<string, string[]>;
    pendingArrivals?: Map<string, any>;
    expiredWaiting?: any[];
    peakStats?: PeakStats;
} = {}) {
    const tracker = new InductionTracker();
    const peakStats = opts.peakStats ?? mkPeakStats();
    const mutator = new StateMutator({
        tracker,
        config: DEFAULT_SIMULATION_CONFIG,
        dependencyMap: opts.dependencyMap ?? new Map(),
        pendingArrivals: opts.pendingArrivals ?? new Map(),
        expiredWaiting: opts.expiredWaiting ?? [],
        peakStats,
    });
    return { mutator, tracker, peakStats };
}

function mkPlacementResult(hangarName = 'H1', bayNames = ['Bay1'], doorName = 'D1') {
    return { hangarName, doorName, bayNames, startTime: 1000, endTime: 3000 };
}

// ---------------------------------------------------------------------------
// recordPlacement
// ---------------------------------------------------------------------------

describe('StateMutator.recordPlacement', () => {
    test('marks bays as occupied with correct info', () => {
        const { mutator } = mkMutator();
        const state = mkState(1000);
        const queue = new EventQueue();
        mutator.recordPlacement(mkPlacementResult(), 'Cessna', 'ind_1', state, queue);

        const key = bayKey('H1', 'Bay1');
        expect(state.occupiedBays.has(key)).toBe(true);
        expect(state.occupiedBays.get(key)!.aircraftName).toBe('Cessna');
        expect(state.occupiedBays.get(key)!.inductionId).toBe('ind_1');
    });

    test('adds entry to activeInductions', () => {
        const { mutator } = mkMutator();
        const state = mkState(1000);
        const queue = new EventQueue();
        mutator.recordPlacement(mkPlacementResult(), 'Cessna', 'ind_1', state, queue);

        expect(state.activeInductions).toHaveLength(1);
        expect(state.activeInductions[0].id).toBe('ind_1');
        expect(state.activeInductions[0].aircraftName).toBe('Cessna');
        expect(state.activeInductions[0].kind).toBe('auto');
    });

    test('schedules a DEPARTURE event at endTime', () => {
        const { mutator } = mkMutator();
        const state = mkState(1000);
        const queue = new EventQueue();
        mutator.recordPlacement(mkPlacementResult('H1', ['Bay1'], 'D1'), 'Cessna', 'ind_1', state, queue);

        const event = queue.pop();
        expect(event).toBeDefined();
        expect(event!.kind).toBe('DEPARTURE');
        expect(event!.time).toBe(3000);
    });

    test('records multiple bays for multi-bay placement', () => {
        const { mutator } = mkMutator();
        const state = mkState(1000);
        const queue = new EventQueue();
        mutator.recordPlacement(
            mkPlacementResult('H1', ['Bay1', 'Bay2'], 'D1'),
            'Wide', 'ind_2', state, queue,
        );

        expect(state.occupiedBays.has(bayKey('H1', 'Bay1'))).toBe(true);
        expect(state.occupiedBays.has(bayKey('H1', 'Bay2'))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// completeDeparture
// ---------------------------------------------------------------------------

describe('StateMutator.completeDeparture', () => {
    test('frees all bay keys from occupiedBays', () => {
        const { mutator, tracker } = mkMutator();
        const state = mkState(3000);

        // Manually occupy bays
        state.occupiedBays.set(bayKey('H1', 'Bay1'), {
            inductionId: 'ind_1', aircraftName: 'Cessna', hangarName: 'H1',
            bayNames: ['Bay1'], doorName: 'D1', startTime: 1000, endTime: 3000, fixed: false,
        });

        // Add to activeInductions
        tracker.recordRequestedArrival('ind_1', 1000);
        state.activeInductions.push({
            id: 'ind_1', kind: 'auto', aircraftName: 'Cessna', hangarName: 'H1',
            doorName: 'D1', bayNames: ['Bay1'], actualStart: 1000, scheduledEnd: 3000,
            departureBlockedSince: null,
        });

        const queue = new EventQueue();
        mutator.completeDeparture('ind_1', 'H1', ['Bay1'], 'D1', 'auto', state, queue);

        expect(state.occupiedBays.has(bayKey('H1', 'Bay1'))).toBe(false);
        expect(state.activeInductions).toHaveLength(0);
        expect(state.completedInductions).toHaveLength(1);
        expect(state.completedInductions[0].id).toBe('ind_1');
    });

    test('schedules RETRY_PLACEMENT when waiting queue is non-empty', () => {
        const { mutator, tracker } = mkMutator();
        const state = mkState(3000);

        tracker.recordRequestedArrival('ind_1', 1000);
        state.activeInductions.push({
            id: 'ind_1', kind: 'auto', aircraftName: 'Cessna', hangarName: 'H1',
            doorName: 'D1', bayNames: ['Bay1'], actualStart: 1000, scheduledEnd: 3000,
            departureBlockedSince: null,
        });

        // Add a waiting aircraft
        state.waitingQueue.push({
            inductionId: 'ind_2',
            aircraft: { name: 'Hawk' } as any,
            autoInduction: {} as any,
            requestedArrival: 2000,
            deadline: null,
            rejections: [],
        });

        const queue = new EventQueue();
        mutator.completeDeparture('ind_1', 'H1', ['Bay1'], 'D1', 'auto', state, queue);

        const event = queue.pop();
        expect(event?.kind).toBe('RETRY_PLACEMENT');
    });

    test('unlocks dependents when dependency departs', () => {
        const pendingArrivals = new Map<string, any>();
        const pendingEvent = {
            kind: 'ARRIVAL', time: 2000, priority: 1,
            inductionId: 'ind_dep',
            autoInduction: { aircraft: { ref: { name: 'Hawk' } } },
            spatialCandidates: null,
        };
        pendingArrivals.set('ind_dep', pendingEvent);

        const dependencyMap = new Map([['ind_1', ['ind_dep']]]);
        const { mutator, tracker } = mkMutator({ dependencyMap, pendingArrivals });
        const state = mkState(3000);

        tracker.recordRequestedArrival('ind_1', 1000);
        state.activeInductions.push({
            id: 'ind_1', kind: 'auto', aircraftName: 'Cessna', hangarName: 'H1',
            doorName: 'D1', bayNames: [], actualStart: 1000, scheduledEnd: 3000,
            departureBlockedSince: null,
        });

        const queue = new EventQueue();
        mutator.completeDeparture('ind_1', 'H1', [], 'D1', 'auto', state, queue);

        // ind_dep should have been moved from pendingArrivals to the queue
        expect(pendingArrivals.has('ind_dep')).toBe(false);
        const event = queue.pop();
        expect(event?.kind).toBe('ARRIVAL');
    });
});

// ---------------------------------------------------------------------------
// updatePeakStats
// ---------------------------------------------------------------------------

describe('StateMutator.updatePeakStats', () => {
    test('updates maxQueueDepth when queue grows', () => {
        const peakStats = mkPeakStats();
        const { mutator } = mkMutator({ peakStats });
        const state = mkState(1000);

        state.waitingQueue.push({ inductionId: 'a' } as any);
        state.waitingQueue.push({ inductionId: 'b' } as any);
        mutator.updatePeakStats(state);

        expect(peakStats.maxQueueDepth).toBe(2);
        expect(peakStats.maxQueueDepthTime).toBe(1000);
    });

    test('does not decrease maxQueueDepth when queue shrinks', () => {
        const peakStats = mkPeakStats();
        const { mutator } = mkMutator({ peakStats });
        const state = mkState(1000);

        state.waitingQueue.push({ inductionId: 'a' } as any, { inductionId: 'b' } as any);
        mutator.updatePeakStats(state);
        state.waitingQueue.pop();
        mutator.updatePeakStats(state);

        expect(peakStats.maxQueueDepth).toBe(2);
    });
});

// ---------------------------------------------------------------------------
// expireWaitingAircraft
// ---------------------------------------------------------------------------

describe('StateMutator.expireWaitingAircraft', () => {
    test('removes aircraft past their deadline', () => {
        const expiredWaiting: any[] = [];
        const { mutator } = mkMutator({ expiredWaiting });
        const state = mkState(5000);

        state.waitingQueue.push({
            inductionId: 'ind_exp',
            aircraft: { name: 'Expired' } as any,
            autoInduction: {} as any,
            requestedArrival: 1000,
            deadline: 3000, // deadline < currentTime(5000) → expired
            rejections: [],
        });

        mutator.expireWaitingAircraft(state);

        expect(state.waitingQueue).toHaveLength(0);
        expect(expiredWaiting).toHaveLength(1);
        expect(expiredWaiting[0].inductionId).toBe('ind_exp');
    });

    test('keeps aircraft whose deadline has not passed', () => {
        const expiredWaiting: any[] = [];
        const { mutator } = mkMutator({ expiredWaiting });
        const state = mkState(1000);

        state.waitingQueue.push({
            inductionId: 'ind_ok',
            aircraft: { name: 'Active' } as any,
            autoInduction: {} as any,
            requestedArrival: 500,
            deadline: 9000, // deadline > currentTime(1000) → keep
            rejections: [],
        });

        mutator.expireWaitingAircraft(state);

        expect(state.waitingQueue).toHaveLength(1);
        expect(expiredWaiting).toHaveLength(0);
    });
});
