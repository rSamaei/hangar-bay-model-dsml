/**
 * Extended unit tests for toScheduleResult() covering branches not exercised
 * by the existing test suite:
 *
 *   - Line 64: f.deadline is non-null → timeEvidence.notAfter set from deadline
 *   - Lines 77–82: f.rejections is empty → generic fallback rejection created
 */
import { describe, expect, test } from 'vitest';
import { toScheduleResult } from '../src/simulation/adapter.js';

// Minimal SimulationStats — all zeroes
const EMPTY_STATS = {
    simulatedDuration: 0, totalEvents: 0, totalAutoInductions: 0,
    placedCount: 0, failedCount: 0, maxQueueDepth: 0, maxQueueDepthTime: 0,
    totalWaitTime: 0, totalDepartureDelay: 0, maxWaitTime: 0,
    maxWaitInduction: '', deadlockCount: 0, avgUtilisation: 0,
    peakOccupancy: 0, peakOccupancyTime: 0, utilisationByHangar: {},
    windowStart: 0, windowEnd: 0,
};

describe('toScheduleResult — deadline evidence (line 64)', () => {
    test('non-null deadline is included as notAfter in rejection evidence', () => {
        const deadlineMs = new Date('2030-06-01T12:00:00Z').getTime();

        const simResult = {
            scheduledInductions: [],
            failedInductions: [{
                inductionId: 'FAIL-1',
                aircraftName: 'Cessna',
                reason: 'SIM_NEVER_PLACED',
                lastAttemptTime: null,
                rejections: [{ ruleId: 'SFR11_DOOR_FIT', message: 'fail', attemptTime: 0, evidence: {} }],
                requestedArrival: deadlineMs - 3_600_000,
                deadline: deadlineMs,
            }],
            eventLog: [],
            statistics: EMPTY_STATS,
        };

        const result = toScheduleResult(simResult as any, []);

        const reasons = result.rejectionReasons.get('FAIL-1')!;
        expect(reasons).toBeDefined();
        expect(reasons[0].evidence.notAfter).toBe(new Date(deadlineMs).toISOString());
    });

    test('null deadline falls back to windowEnd ISO string', () => {
        const windowEnd = new Date('2030-12-31T23:59:00Z').getTime();
        const stats = { ...EMPTY_STATS, windowEnd };

        const simResult = {
            scheduledInductions: [],
            failedInductions: [{
                inductionId: 'FAIL-2',
                aircraftName: 'Cessna',
                reason: 'SIM_NEVER_PLACED',
                lastAttemptTime: null,
                rejections: [{ ruleId: 'NO_SUITABLE_BAY_SET', message: 'fail', attemptTime: 0, evidence: {} }],
                requestedArrival: null,
                deadline: null,
            }],
            eventLog: [],
            statistics: stats,
        };

        const result = toScheduleResult(simResult as any, []);

        const reasons = result.rejectionReasons.get('FAIL-2')!;
        expect(reasons[0].evidence.notAfter).toBe(new Date(windowEnd).toISOString());
    });
});

describe('toScheduleResult — empty rejections fallback (lines 77–82)', () => {
    test('empty rejections array produces a generic fallback rejection from f.reason', () => {
        const simResult = {
            scheduledInductions: [],
            failedInductions: [{
                inductionId: 'FAIL-3',
                aircraftName: 'Cessna',
                reason: 'STRUCTURALLY_INFEASIBLE',
                lastAttemptTime: 42_000,
                rejections: [],   // ← empty → triggers fallback
                requestedArrival: null,
                deadline: null,
            }],
            eventLog: [],
            statistics: EMPTY_STATS,
        };

        const result = toScheduleResult(simResult as any, []);

        const reasons = result.rejectionReasons.get('FAIL-3')!;
        expect(reasons).toHaveLength(1);
        expect(reasons[0].ruleId).toBe('STRUCTURALLY_INFEASIBLE');
        expect(reasons[0].message).toContain('STRUCTURALLY_INFEASIBLE');
        expect(reasons[0].evidence.lastAttemptTime).toBe(42_000);
    });
});
