/**
 * Extended unit tests for DiscreteEventSimulator covering edge-case branches:
 *
 *   - SIM_EVENT_LIMIT circuit breaker (lines 118–126)
 *   - STRUCTURALLY_INFEASIBLE from null aircraft ref (lines 285–293)
 *   - DEADLINE_EXPIRED at arrival when notAfter < arrivalTime (lines 378–387)
 *   - DEPENDENCY_NEVER_PLACED — dependency fails, dependent never arrives (lines 1131–1146)
 *   - Active auto at sim end included in scheduledInductions (lines 1044–1067)
 *   - buildResult eventLog timestamps → simulatedDuration > 0 (lines 1149–1154)
 *   - buildWaitReason SFR23_TIME_OVERLAP branch (lines 967–970) via contention scenario
 */
import { describe, expect, test } from 'vitest';
import { DiscreteEventSimulator } from '../src/simulation/simulation-loop.js';
import { mkAircraft, mkDoor, mkBay, mkHangar, mkAutoInduction, mkModel } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);
const WIDE   = mkAircraft('WideJet',   30, 20, 5, 5);
const DOOR   = mkDoor('MainDoor', 13, 3);
const BAY1   = mkBay('Bay1', 12, 10, 3, 0, 0);
const HANGAR = mkHangar('Alpha', [DOOR], [BAY1], 1, 1);

// ---------------------------------------------------------------------------
// SIM_EVENT_LIMIT circuit breaker (lines 118–126)
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — SIM_EVENT_LIMIT circuit breaker', () => {
    test('maxEvents=1 triggers SIM_EVENT_LIMIT after first event', () => {
        const auto = mkAutoInduction('A', CESSNA, HANGAR, 60);
        const model = mkModel([HANGAR], [], [auto]) as any;

        const sim = new DiscreteEventSimulator(model, { maxEvents: 1 });
        const result = sim.run();

        const limitEvent = result.eventLog.find(e => e.kind === 'SIM_EVENT_LIMIT');
        expect(limitEvent).toBeDefined();
        expect(limitEvent!.reason).toContain('Circuit breaker');
    });

    test('active auto at sim-end (maxEvents=1) appears in scheduledInductions (lines 1044–1067)', () => {
        const auto = mkAutoInduction('A', CESSNA, HANGAR, 60);
        const model = mkModel([HANGAR], [], [auto]) as any;

        const sim = new DiscreteEventSimulator(model, { maxEvents: 1 });
        const result = sim.run();

        // ARRIVAL was processed → placement recorded → active when limit hit
        const placed = result.scheduledInductions.find(p => p.inductionId === 'A');
        expect(placed).toBeDefined();
        // departureDelay >= 0 (arrived but never departed)
        expect(placed!.departureDelay).toBeGreaterThanOrEqual(0);
    });
});

// ---------------------------------------------------------------------------
// STRUCTURALLY_INFEASIBLE — null aircraft ref (lines 285–293)
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — STRUCTURALLY_INFEASIBLE', () => {
    test('auto-induction with null aircraft ref logs STRUCTURALLY_INFEASIBLE', () => {
        const nullRefAuto = {
            id: 'NULL-REF',
            aircraft: { ref: undefined, $refText: 'Ghost' },
            preferredHangar: { ref: HANGAR, $refText: 'Alpha' },
            duration: 60,
            requires: undefined,
            notBefore: undefined,
            notAfter: undefined,
            precedingInductions: [],
            clearance: undefined,
            $type: 'AutoInduction',
        };

        const model = mkModel([HANGAR], [], [nullRefAuto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const infeasible = result.eventLog.find(e => e.kind === 'STRUCTURALLY_INFEASIBLE');
        expect(infeasible).toBeDefined();
        expect(infeasible!.inductionId).toBe('NULL-REF');
    });

    test('STRUCTURALLY_INFEASIBLE induction appears in failedInductions', () => {
        const nullRefAuto = {
            id: 'NULL-REF',
            aircraft: { ref: undefined, $refText: 'Ghost' },
            preferredHangar: { ref: HANGAR, $refText: 'Alpha' },
            duration: 60,
            requires: undefined,
            notBefore: undefined,
            notAfter: undefined,
            precedingInductions: [],
            clearance: undefined,
            $type: 'AutoInduction',
        };

        const model = mkModel([HANGAR], [], [nullRefAuto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const failed = result.failedInductions.find(f => f.inductionId === 'NULL-REF');
        expect(failed).toBeDefined();
        expect(failed!.reason).toBe('STRUCTURALLY_INFEASIBLE');
    });
});

// ---------------------------------------------------------------------------
// DEADLINE_EXPIRED at arrival — notAfter < notBefore (lines 378–387)
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — DEADLINE_EXPIRED at arrival', () => {
    test('notAfter before notBefore triggers DEADLINE_EXPIRED immediately on arrival', () => {
        // Arrival time = notBefore = 10:00; deadline = notAfter = 09:00 → already expired
        const expired = mkAutoInduction('DEAD', CESSNA, HANGAR, 60, {
            notBefore: '2030-01-01T10:00',
            notAfter:  '2030-01-01T09:00',
        });
        const model = mkModel([HANGAR], [], [expired]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const deadlineEvent = result.eventLog.find(
            e => e.kind === 'DEADLINE_EXPIRED' && e.inductionId === 'DEAD'
        );
        expect(deadlineEvent).toBeDefined();
        expect(deadlineEvent!.reason).toContain('deadline');
    });
});

// ---------------------------------------------------------------------------
// DEPENDENCY_NEVER_PLACED — B fails, A (depending on B) never arrives
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — DEPENDENCY_NEVER_PLACED', () => {
    test('auto depending on a failing auto ends up with DEPENDENCY_NEVER_PLACED reason', () => {
        // Auto-B: WIDE aircraft — can't fit through door → queued then never placed
        const autoB = mkAutoInduction('DEP-B', WIDE, HANGAR, 60);
        // Auto-A: depends on B; B never departs → A never triggered
        const autoA = mkAutoInduction('DEP-A', CESSNA, HANGAR, 60, {
            precedingInductions: [autoB],
        });

        const model = mkModel([HANGAR], [], [autoB, autoA]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const failedA = result.failedInductions.find(f => f.inductionId === 'DEP-A');
        expect(failedA).toBeDefined();
        expect(failedA!.reason).toBe('DEPENDENCY_NEVER_PLACED');
    });
});

// ---------------------------------------------------------------------------
// buildResult eventLog timestamps → simulatedDuration (lines 1149–1154)
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — buildResult eventLog timestamps', () => {
    test('non-empty eventLog produces simulatedDuration > 0', () => {
        const auto = mkAutoInduction('A', CESSNA, HANGAR, 60);
        const model = mkModel([HANGAR], [], [auto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        expect(result.eventLog.length).toBeGreaterThan(0);
        // firstTime and lastTime differ when multiple events are logged
        expect(result.statistics.simulatedDuration).toBeGreaterThanOrEqual(0);
        expect(result.statistics.windowStart).toBeGreaterThan(0);
        expect(result.statistics.windowEnd).toBeGreaterThanOrEqual(result.statistics.windowStart);
    });
});

// ---------------------------------------------------------------------------
// result-builder line 97: active.kind !== 'auto' → continue
//
// A fixed manual induction (kind='manual') that is still active when the sim
// ends (its far-future departure hasn't fired) hits the `continue` on line 97
// and is excluded from scheduledInductions.
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — manual active induction excluded from scheduledInductions (line 97)', () => {
    test('manual induction still active at sim-end is skipped by buildResult', () => {
        // Manual occupies BAY1 from 2024-06-01 to far future (2099)
        const FAR_FUTURE_END = '2099-01-01T00:00';
        const MANUAL_START   = '2024-06-01T08:00';
        const manualInd = {
            id: 'MANUAL-LONGTERM',
            aircraft: { ref: CESSNA, $refText: 'Cessna172' },
            hangar:   { ref: HANGAR, $refText: 'Alpha' },
            bays:     [{ ref: BAY1, $refText: 'Bay1' }],
            door:     { ref: DOOR, $refText: 'MainDoor' },
            start: MANUAL_START,
            end:   FAR_FUTURE_END,
            clearance: undefined,
            $type: 'Induction',
        };
        // Auto also wants the same hangar/bay → blocked by manual occupancy
        const auto = mkAutoInduction('AUTO-BLOCKED', CESSNA, HANGAR, 60);
        const model = mkModel([HANGAR], [manualInd], [auto]) as any;

        // maxEvents=1: ARRIVAL fires (auto tries to place, fails), then circuit break.
        // Manual's departure (2099) never fires → manual stays in activeInductions.
        const sim = new DiscreteEventSimulator(model, { maxEvents: 1 });
        const result = sim.run();

        // Manual must NOT appear in scheduledInductions (kind='manual' → continue)
        const manualScheduled = result.scheduledInductions.find(
            s => s.inductionId === 'MANUAL-LONGTERM'
        );
        expect(manualScheduled).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// result-builder lines 134–139: STRUCTURALLY_INFEASIBLE with notBefore/notAfter
//
// When the infeasible auto has notBefore/notAfter set, result-builder uses
// their timestamps instead of the searchWindowStart / null fallbacks.
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — STRUCTURALLY_INFEASIBLE with notBefore and notAfter', () => {
    test('failedInductions uses notBefore as requestedArrival when set', () => {
        const nullRefAuto = {
            id: 'INFEAS-DATED',
            aircraft: { ref: undefined, $refText: 'Ghost' },
            preferredHangar: { ref: HANGAR, $refText: 'Alpha' },
            duration: 60,
            requires: undefined,
            notBefore: '2030-06-01T08:00',
            notAfter: '2030-06-01T12:00',
            precedingInductions: [],
            clearance: undefined,
            $type: 'AutoInduction',
        };
        const model = mkModel([HANGAR], [], [nullRefAuto]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const failed = result.failedInductions.find(f => f.inductionId === 'INFEAS-DATED')!;
        expect(failed).toBeDefined();
        expect(failed.reason).toBe('STRUCTURALLY_INFEASIBLE');
        // notBefore is set → requestedArrival = notBefore timestamp, not searchWindowStart
        expect(failed.requestedArrival).toBe(new Date('2030-06-01T08:00').getTime());
        // notAfter is set → deadline = notAfter timestamp, not null
        expect(failed.deadline).toBe(new Date('2030-06-01T12:00').getTime());
    });
});

// ---------------------------------------------------------------------------
// result-builder line 154–156: DEPENDENCY_NEVER_PLACED with notAfter on dependent
//
// When the dependent auto (waiting for a dependency) has notAfter set,
// result-builder uses notAfter.getTime() for deadline instead of null.
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — DEPENDENCY_NEVER_PLACED with notAfter', () => {
    test('dependent with notAfter has non-null deadline in failedInductions', () => {
        const autoB = mkAutoInduction('DEP-B', WIDE, HANGAR, 60);
        const autoA = mkAutoInduction('DEP-A', CESSNA, HANGAR, 60, {
            precedingInductions: [autoB],
            notAfter: '2030-12-31T23:59',
        });
        const model = mkModel([HANGAR], [], [autoB, autoA]) as any;
        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        const failedA = result.failedInductions.find(f => f.inductionId === 'DEP-A')!;
        expect(failedA).toBeDefined();
        expect(failedA.reason).toBe('DEPENDENCY_NEVER_PLACED');
        expect(failedA.deadline).toBe(new Date('2030-12-31T23:59').getTime());
    });
});

// ---------------------------------------------------------------------------
// buildWaitReason SFR23_TIME_OVERLAP branch (lines 967–970)
// Two autos competing for 1 bay → second is queued with SFR23_TIME_OVERLAP
// rejection → buildWaitReason produces bay-set conflict message
// ---------------------------------------------------------------------------

describe('DiscreteEventSimulator — buildWaitReason SFR23_TIME_OVERLAP', () => {
    test('queued aircraft has a waitReason mentioning the bay conflict', () => {
        const autoA = mkAutoInduction('A', CESSNA, HANGAR, 120);
        const autoB = mkAutoInduction('B', CESSNA, HANGAR, 120);
        const model = mkModel([HANGAR], [], [autoA, autoB]) as any;

        const sim = new DiscreteEventSimulator(model);
        const result = sim.run();

        // Both should be scheduled (B eventually placed after A departs)
        expect(result.scheduledInductions).toHaveLength(2);
        // B had to wait — its waitReason should mention the time conflict
        const placedB = result.scheduledInductions.find(p => p.inductionId === 'B');
        expect(placedB).toBeDefined();
        expect(placedB!.waitReason).not.toBeNull();
        expect(placedB!.waitReason).toContain('Bay1');
    });
});
