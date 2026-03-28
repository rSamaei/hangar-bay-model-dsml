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

// ---------------------------------------------------------------------------
// finalise — pendingDepartures (lines 307–315)
//
// Aircraft placed but departure blocked at sim-end → finalise completes them.
// ---------------------------------------------------------------------------

describe('StateMutator.finalise — pendingDepartures', () => {
    test('pending departure at sim end is moved to completedInductions', () => {
        const { mutator, tracker } = mkMutator();
        const state = mkState(5000);

        tracker.recordRequestedArrival('ind_1', 1000);
        state.activeInductions.push({
            id: 'ind_1', kind: 'auto', aircraftName: 'Cessna', hangarName: 'H1',
            doorName: 'D1', bayNames: ['Bay1'], actualStart: 1000, scheduledEnd: 3000,
            departureBlockedSince: 3000,
        });
        state.pendingDepartures.push({
            inductionId: 'ind_1', aircraftName: 'Cessna', hangarName: 'H1',
            bayNames: ['Bay1'], doorName: 'D1', durationExpiredAt: 3000, retryCount: 2,
        });

        mutator.finalise(state);

        expect(state.activeInductions).toHaveLength(0);
        expect(state.completedInductions).toHaveLength(1);
        expect(state.completedInductions[0].id).toBe('ind_1');
    });

    test('pending departure with no matching active induction is silently skipped', () => {
        const { mutator } = mkMutator();
        const state = mkState(5000);

        // No matching activeInduction → the if (activeIdx >= 0) branch is false
        state.pendingDepartures.push({
            inductionId: 'ghost', aircraftName: 'Ghost', hangarName: 'H1',
            bayNames: ['Bay1'], doorName: 'D1', durationExpiredAt: 3000, retryCount: 1,
        });

        mutator.finalise(state);

        expect(state.completedInductions).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// logAndScheduleDepartureRetry — line 247: findEarliestBlockerEnd returns undefined
//
// When blockingIds is empty (no blockers found), findEarliestBlockerEnd returns
// undefined, and the ?? fallback (state.currentTime + 1) is used as retryTime.
// ---------------------------------------------------------------------------

describe('StateMutator.logAndScheduleDepartureRetry — retryTime fallback (line 247)', () => {
    test('empty blockingIds uses currentTime+1 as retryTime', () => {
        const { mutator } = mkMutator();
        const state = mkState(2000);
        const queue = new EventQueue();

        mutator.logAndScheduleDepartureRetry(
            'ind_1', 'H1', ['Bay1'], [], state, queue, 'test reason',
        );

        const event = queue.pop();
        expect(event?.kind).toBe('DEPARTURE_RETRY');
        // No blockers → findEarliestBlockerEnd returns undefined → retryTime = 2000 + 1
        expect(event?.time).toBe(2001);
    });

    test('blocker in occupiedBays with earlier endTime than activeInductions.scheduledEnd (lines 380–381)', () => {
        const { mutator } = mkMutator();
        const state = mkState(1000);
        const queue = new EventQueue();

        // blocker1 is in activeInductions with scheduledEnd=3000
        state.activeInductions.push({
            id: 'blocker1', kind: 'auto', aircraftName: 'Hawk', hangarName: 'H1',
            doorName: 'D1', bayNames: ['Bay2'], actualStart: 0, scheduledEnd: 3000,
            departureBlockedSince: null,
        });
        // blocker1 is ALSO in occupiedBays with endTime=1500 (earlier than 3000)
        state.occupiedBays.set(bayKey('H1', 'Bay2'), {
            inductionId: 'blocker1', aircraftName: 'Hawk', hangarName: 'H1',
            bayNames: ['Bay2'], doorName: 'D1', startTime: 0, endTime: 1500, fixed: false,
        });

        mutator.logAndScheduleDepartureRetry(
            'ind_1', 'H1', ['Bay1'], ['blocker1'], state, queue, 'blocked reason',
        );

        const event = queue.pop();
        expect(event?.kind).toBe('DEPARTURE_RETRY');
        // occupiedBays.endTime=1500 < activeInductions.scheduledEnd=3000
        // → findEarliestBlockerEnd returns 1500
        expect(event?.time).toBe(1500);
    });

    test('two blockers in activeInductions — second with smaller scheduledEnd wins (line 373)', () => {
        const { mutator } = mkMutator();
        const state = mkState(1000);
        const queue = new EventQueue();

        // blocker1 ends at 5000, blocker2 ends at 3000 (earlier)
        state.activeInductions.push({
            id: 'b1', kind: 'auto', aircraftName: 'Hawk', hangarName: 'H1',
            doorName: 'D1', bayNames: ['BayA'], actualStart: 0, scheduledEnd: 5000,
            departureBlockedSince: null,
        });
        state.activeInductions.push({
            id: 'b2', kind: 'auto', aircraftName: 'Cessna', hangarName: 'H1',
            doorName: 'D1', bayNames: ['BayB'], actualStart: 0, scheduledEnd: 3000,
            departureBlockedSince: null,
        });

        mutator.logAndScheduleDepartureRetry(
            'ind_1', 'H1', ['Bay1'], ['b1', 'b2'], state, queue, 'two blockers',
        );

        const event = queue.pop();
        // b1.scheduledEnd=5000, then b2.scheduledEnd=3000 < 5000 → earliest=3000
        expect(event?.time).toBe(3000);
    });
});

// ---------------------------------------------------------------------------
// completeDeparture — lines 165–166: pendingDepartures loop continue branches
//
// Line 165: skip pending departure whose inductionId matches the completing id.
// Line 166: skip pending departure in a different hangar.
// The third entry (same hangar, different id) should get a DEPARTURE_RETRY.
// ---------------------------------------------------------------------------

describe('StateMutator.completeDeparture — pendingDepartures re-check continue branches', () => {
    test('same-id pending is skipped (line 165), other-hangar is skipped (line 166), same-hangar gets retry', () => {
        const { mutator, tracker } = mkMutator();
        const state = mkState(3000);

        tracker.recordRequestedArrival('ind_1', 1000);
        state.activeInductions.push({
            id: 'ind_1', kind: 'auto', aircraftName: 'Cessna', hangarName: 'H1',
            doorName: 'D1', bayNames: ['Bay1'], actualStart: 1000, scheduledEnd: 3000,
            departureBlockedSince: null,
        });

        // Entry 1: same inductionId as completing → line 165 continue
        state.pendingDepartures.push({
            inductionId: 'ind_1', aircraftName: 'Cessna', hangarName: 'H1',
            bayNames: ['Bay1'], doorName: 'D1', durationExpiredAt: 2000, retryCount: 1,
        });
        // Entry 2: different hangar → line 166 continue
        state.pendingDepartures.push({
            inductionId: 'other', aircraftName: 'Hawk', hangarName: 'H2',
            bayNames: ['Bay2'], doorName: 'D2', durationExpiredAt: 2000, retryCount: 0,
        });
        // Entry 3: same hangar, different id → gets DEPARTURE_RETRY
        state.pendingDepartures.push({
            inductionId: 'blocked', aircraftName: 'Lear', hangarName: 'H1',
            bayNames: ['Bay3'], doorName: 'D1', durationExpiredAt: 2000, retryCount: 0,
        });

        const queue = new EventQueue();
        mutator.completeDeparture('ind_1', 'H1', ['Bay1'], 'D1', 'auto', state, queue);

        // Only 'blocked' should get a DEPARTURE_RETRY (others were skipped)
        const retryEvents: any[] = [];
        let ev;
        while ((ev = queue.pop())) retryEvents.push(ev);
        const departureRetries = retryEvents.filter(e => e.kind === 'DEPARTURE_RETRY');
        expect(departureRetries).toHaveLength(1);
        expect(departureRetries[0].inductionId).toBe('blocked');
    });
});

// ---------------------------------------------------------------------------
// handleBlockedDeparture — line 209: active?.aircraftName ?? '' when active missing
//
// When the inductionId being blocked isn't in state.activeInductions, active is
// undefined, and `active?.aircraftName ?? ''` uses the '' fallback.
// ---------------------------------------------------------------------------

describe('StateMutator.handleBlockedDeparture — active missing uses ?? empty string (line 209)', () => {
    test('inductionId not in activeInductions → aircraftName defaults to empty string', () => {
        const { mutator } = mkMutator();
        const state = mkState(2000);
        const queue = new EventQueue();

        const event: any = {
            kind: 'DEPARTURE', time: 2000, priority: 1,
            inductionId: 'ghost', hangarName: 'H1', bayNames: ['Bay1'],
            doorName: 'D1', fixed: false,
        };

        // 'ghost' is not in state.activeInductions → active = undefined → ?? '' fires
        mutator.handleBlockedDeparture('ghost', 'H1', ['Bay1'], 'D1', event, [], state, queue);

        const pending = state.pendingDepartures.find(p => p.inductionId === 'ghost')!;
        expect(pending).toBeDefined();
        expect(pending.aircraftName).toBe(''); // ?? '' fallback
    });
});
