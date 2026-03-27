/**
 * Unit tests for result-builder.ts
 *
 * Covers buildSimulationResult:
 *   - empty simulation → empty placements + zero stats
 *   - completed auto-inductions → appear as scheduled placements
 *   - waiting queue entry → appears as failed
 *   - expired waiting → SIM_DEADLINE_EXCEEDED reason
 *   - pending arrivals (unresolved deps) → DEPENDENCY_NEVER_PLACED
 *   - structurally infeasible log entries → STRUCTURALLY_INFEASIBLE reason
 *   - statistics: placedCount, failedCount, maxWaitTime
 */
import { describe, expect, test } from 'vitest';
import { buildSimulationResult, type PeakStats } from '../../src/simulation/result-builder.js';
import { InductionTracker } from '../../src/simulation/induction-tracker.js';
import type { SimulationState } from '../../src/simulation/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkState(overrides: Partial<SimulationState> = {}): SimulationState {
    return {
        currentTime: 10000,
        occupiedBays: new Map(),
        waitingQueue: [],
        pendingDepartures: [],
        activeInductions: [],
        completedInductions: [],
        fixedOccupancy: [],
        eventLog: [],
        ...overrides,
    };
}

function mkPeakStats(): PeakStats {
    return { maxQueueDepth: 0, maxQueueDepthTime: 0, peakOccupancy: 0, peakOccupancyTime: 0 };
}

function mkCompletedInduction(id: string, waitTime = 0, departureDelay = 0) {
    return {
        id,
        kind: 'auto' as const,
        aircraftName: 'Cessna',
        hangarName: 'H1',
        doorName: 'D1',
        bayNames: ['Bay1'],
        actualStart: 2000,
        maintenanceEnd: 5000,
        actualEnd: 5000 + departureDelay,
        waitTime,
        departureDelay,
        waitReason: null,
        departureDelayReason: null,
        placementAttempts: 1,
        queuePosition: null,
    };
}

function mkWaitingAircraft(id: string, deadline: number | null = null) {
    return {
        inductionId: id,
        aircraft: { name: 'Hawk', wingspan: 11, length: 8, height: 3, tailHeight: 3, $type: 'AircraftType' } as any,
        autoInduction: { preferredHangar: undefined, notAfter: null } as any,
        requestedArrival: 1000,
        deadline,
        rejections: [],
    };
}

// ---------------------------------------------------------------------------
// Empty simulation
// ---------------------------------------------------------------------------

describe('buildSimulationResult — empty simulation', () => {
    test('returns empty scheduled and failed arrays', () => {
        const tracker = new InductionTracker();
        const result = buildSimulationResult({
            state: mkState(),
            eventCount: 0,
            tracker,
            expiredWaiting: [],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.scheduledInductions).toHaveLength(0);
        expect(result.failedInductions).toHaveLength(0);
        expect(result.statistics.placedCount).toBe(0);
        expect(result.statistics.failedCount).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Scheduled inductions
// ---------------------------------------------------------------------------

describe('buildSimulationResult — scheduled inductions', () => {
    test('converts completedInductions to placements', () => {
        const tracker = new InductionTracker();
        tracker.recordRequestedArrival('ind_1', 1000);
        const state = mkState({
            completedInductions: [mkCompletedInduction('ind_1')],
        });

        const result = buildSimulationResult({
            state, eventCount: 1, tracker,
            expiredWaiting: [],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.scheduledInductions).toHaveLength(1);
        expect(result.scheduledInductions[0].inductionId).toBe('ind_1');
    });

    test('active auto-induction at simulation end becomes a placement', () => {
        const tracker = new InductionTracker();
        tracker.recordRequestedArrival('ind_2', 1000);
        const state = mkState({
            activeInductions: [{
                id: 'ind_2', kind: 'auto', aircraftName: 'Cessna',
                hangarName: 'H1', doorName: 'D1', bayNames: ['Bay1'],
                actualStart: 2000, scheduledEnd: 8000,
                departureBlockedSince: null,
            }],
        });

        const result = buildSimulationResult({
            state, eventCount: 1, tracker,
            expiredWaiting: [],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.scheduledInductions).toHaveLength(1);
        expect(result.scheduledInductions[0].inductionId).toBe('ind_2');
    });

    test('maxWaitTime is computed correctly', () => {
        const tracker = new InductionTracker();
        tracker.recordRequestedArrival('ind_1', 1000);
        tracker.recordRequestedArrival('ind_2', 1000);
        const state = mkState({
            completedInductions: [
                mkCompletedInduction('ind_1', 500),   // waitTime=500
                mkCompletedInduction('ind_2', 1200),  // waitTime=1200 → max
            ],
        });

        const result = buildSimulationResult({
            state, eventCount: 2, tracker,
            expiredWaiting: [],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.statistics.maxWaitTime).toBe(1200);
        expect(result.statistics.maxWaitInduction).toBe('ind_2');
    });
});

// ---------------------------------------------------------------------------
// Failed inductions
// ---------------------------------------------------------------------------

describe('buildSimulationResult — failed inductions', () => {
    test('waiting queue entry becomes SIM_NEVER_PLACED', () => {
        const tracker = new InductionTracker();
        const state = mkState({
            waitingQueue: [mkWaitingAircraft('ind_w')],
        });

        const result = buildSimulationResult({
            state, eventCount: 0, tracker,
            expiredWaiting: [],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.failedInductions).toHaveLength(1);
        expect(result.failedInductions[0].reason).toBe('SIM_NEVER_PLACED');
    });

    test('expired waiting aircraft becomes SIM_DEADLINE_EXCEEDED', () => {
        const tracker = new InductionTracker();
        const expired = mkWaitingAircraft('ind_exp', 3000); // deadline passed

        const result = buildSimulationResult({
            state: mkState({ currentTime: 5000 }),
            eventCount: 0, tracker,
            expiredWaiting: [expired],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.failedInductions).toHaveLength(1);
        expect(result.failedInductions[0].reason).toBe('SIM_DEADLINE_EXCEEDED');
    });

    test('pending arrival (unresolved dep) becomes DEPENDENCY_NEVER_PLACED', () => {
        const tracker = new InductionTracker();
        const pendingArrivals = new Map([
            ['ind_dep', {
                kind: 'ARRIVAL', time: 2000, priority: 1,
                inductionId: 'ind_dep',
                autoInduction: {
                    aircraft: { ref: { name: 'Scout' } },
                    notAfter: null,
                } as any,
                spatialCandidates: null,
            }],
        ]);

        const result = buildSimulationResult({
            state: mkState(),
            eventCount: 0, tracker,
            expiredWaiting: [],
            pendingArrivals,
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.failedInductions).toHaveLength(1);
        expect(result.failedInductions[0].reason).toBe('DEPENDENCY_NEVER_PLACED');
    });

    test('STRUCTURALLY_INFEASIBLE event log entry becomes failed induction', () => {
        const tracker = new InductionTracker();
        const state = mkState({
            eventLog: [{
                kind: 'STRUCTURALLY_INFEASIBLE',
                time: 0,
                inductionId: 'ind_infeas',
                reason: 'Unresolved aircraft reference',
            }],
        });

        const result = buildSimulationResult({
            state, eventCount: 0, tracker,
            expiredWaiting: [],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.failedInductions).toHaveLength(1);
        expect(result.failedInductions[0].reason).toBe('STRUCTURALLY_INFEASIBLE');
    });
});

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

describe('buildSimulationResult — statistics', () => {
    test('totalDepartureDelay sums departure delays', () => {
        const tracker = new InductionTracker();
        tracker.recordRequestedArrival('i1', 1000);
        tracker.recordRequestedArrival('i2', 1000);
        const state = mkState({
            completedInductions: [
                mkCompletedInduction('i1', 0, 300),  // departureDelay=300
                mkCompletedInduction('i2', 0, 700),  // departureDelay=700
            ],
        });

        const result = buildSimulationResult({
            state, eventCount: 2, tracker,
            expiredWaiting: [],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats: mkPeakStats(),
        });

        expect(result.statistics.totalDepartureDelay).toBe(1000);
    });

    test('peakOccupancy from peakStats is reflected in statistics', () => {
        const tracker = new InductionTracker();
        const peakStats: PeakStats = {
            maxQueueDepth: 3, maxQueueDepthTime: 5000,
            peakOccupancy: 8, peakOccupancyTime: 7000,
        };

        const result = buildSimulationResult({
            state: mkState(),
            eventCount: 0, tracker,
            expiredWaiting: [],
            pendingArrivals: new Map(),
            astAutoInductions: [],
            searchWindowStart: 0,
            peakStats,
        });

        expect(result.statistics.peakOccupancy).toBe(8);
        expect(result.statistics.maxQueueDepth).toBe(3);
    });
});
