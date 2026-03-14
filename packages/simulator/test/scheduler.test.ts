/**
 * Unit tests for AutoScheduler.
 *
 * AutoScheduler operates on mock Model/AutoInduction objects that satisfy
 * the Langium AST interfaces structurally (TypeScript uses structural typing,
 * so no real Langium runtime is required).
 *
 * Fixtures produce an aircraft (Cessna172) that fits in a single-bay hangar,
 * allowing timing and dependency behaviour to be tested in isolation.
 */
import { describe, expect, test } from 'vitest';
import { AutoScheduler } from '../src/scheduler.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function mkAircraft(name: string, wingspan: number, length: number, height: number, tailHeight?: number) {
    return { name, wingspan, length, height, tailHeight: tailHeight ?? height, $type: 'AircraftType' };
}

function mkDoor(name: string, width: number, height: number) {
    return { name, width, height, accessNode: undefined, $type: 'HangarDoor' };
}

function mkBay(name: string, width: number, depth: number, height: number, row?: number, col?: number) {
    return { name, width, depth, height, row, col, adjacent: [], accessNode: undefined, $type: 'HangarBay' };
}

function mkHangar(name: string, doors: any[], bays: any[], rows?: number, cols?: number) {
    return { name, doors, grid: { bays, rows, cols }, $type: 'Hangar' };
}

function mkAutoInduction(
    id: string | undefined,
    aircraft: any,
    hangar: any | undefined,
    duration: number,
    options: { notBefore?: string; notAfter?: string; precedingInductions?: any[]; requires?: number } = {}
) {
    return {
        id,
        aircraft: { ref: aircraft, $refText: aircraft?.name ?? '' },
        preferredHangar: hangar ? { ref: hangar, $refText: hangar.name } : undefined,
        duration,
        requires: options.requires,
        notBefore: options.notBefore,
        notAfter: options.notAfter,
        precedingInductions: (options.precedingInductions ?? []).map((a: any) => ({
            ref: a,
            $refText: a?.id ?? ''
        })),
        clearance: undefined,
        $type: 'AutoInduction'
    };
}

function mkModel(hangars: any[], inductions: any[], autoInductions: any[]): any {
    return {
        name: 'TestAirfield',
        hangars,
        inductions,
        autoInductions,
        accessPaths: [],
        $type: 'Model'
    };
}

// ---------------------------------------------------------------------------
// Standard fixtures
// ---------------------------------------------------------------------------

// Small aircraft: wingspan=11, length=8, height=2.7, tailHeight=2.7
const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);

// Aircraft whose wingspan (30) exceeds the door width below
const WIDE_AIRCRAFT = mkAircraft('WideJet', 30, 20, 5, 5);

// Door fits CESSNA: width=13 >= 11 wingspan, height=3 >= 2.7 tailHeight
const MAIN_DOOR = mkDoor('MainDoor', 13, 3);

// Bay fits CESSNA: sumWidth=12 >= 11, depth=10 >= 8, height=3 >= 2.7
// baysRequired = ceil(11/12) = 1
const BAY1 = mkBay('Bay1', 12, 10, 3, 0, 0);

// Single-door, single-bay hangar with grid coords (rows=1, cols=1)
const ALPHA_HANGAR = mkHangar('Alpha', [MAIN_DOOR], [BAY1], 1, 1);

// (No hardcoded DEFAULT_START — baseline is now Date.now() at call time)

// ---------------------------------------------------------------------------
// Tests: return structure
// ---------------------------------------------------------------------------

describe('AutoScheduler — return structure', () => {
    test('empty auto-inductions returns correct empty structure', () => {
        const model = mkModel([ALPHA_HANGAR], [], []);
        const result = new AutoScheduler().schedule(model);

        expect(result).toHaveProperty('scheduled');
        expect(result).toHaveProperty('unscheduled');
        expect(result).toHaveProperty('rejectionReasons');
        expect(result.scheduled).toHaveLength(0);
        expect(result.unscheduled).toHaveLength(0);
        expect(result.rejectionReasons.size).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Tests: unconstrained scheduling
// ---------------------------------------------------------------------------

describe('AutoScheduler — unconstrained scheduling', () => {
    test('single auto-induction is placed in the correct hangar, bay, and door', () => {
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, 60);
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA]));

        expect(result.scheduled).toHaveLength(1);
        expect(result.unscheduled).toHaveLength(0);
        const s = result.scheduled[0];
        expect(s.id).toBe('A');
        expect(s.aircraft).toBe('Cessna172');
        expect(s.hangar).toBe('Alpha');
        expect(s.bays).toEqual(['Bay1']);
        expect(s.door).toBe('MainDoor');
    });

    test('start time defaults to search-window start when there are no constraints', () => {
        const before = Date.now();
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, 60);
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA]));
        const after = Date.now();

        const s = result.scheduled[0];
        const startMs = new Date(s.start).getTime();
        expect(startMs).toBeGreaterThanOrEqual(before);
        expect(startMs).toBeLessThanOrEqual(after);
        // end is exactly 60 minutes after start
        expect(new Date(s.end).getTime() - startMs).toBe(60 * 60 * 1000);
    });
});

// ---------------------------------------------------------------------------
// Tests: time constraints (notBefore / notAfter)
// ---------------------------------------------------------------------------

describe('AutoScheduler — time constraints', () => {
    test('notBefore pushes the start forward past the default search-window start', () => {
        const notBefore = '2025-12-11T10:00:00Z';
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, 60, { notBefore });
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA]));

        expect(result.scheduled).toHaveLength(1);
        expect(new Date(result.scheduled[0].start).getTime()).toBeGreaterThanOrEqual(
            new Date(notBefore).getTime()
        );
    });

    test('notAfter adjusts start so that end does not exceed the deadline', () => {
        // duration=240 min; notAfter=T09:00Z → scheduler pushes start back to T05:00Z so end=T09:00Z
        const notAfter = '2025-12-11T09:00:00Z';
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, 240, { notAfter });
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA]));

        expect(result.scheduled).toHaveLength(1);
        expect(new Date(result.scheduled[0].end).getTime()).toBeLessThanOrEqual(
            new Date(notAfter).getTime()
        );
    });

    test('scheduled end time is always exactly duration minutes after start', () => {
        const duration = 90;
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, duration, {
            notBefore: '2025-12-12T08:00:00Z'
        });
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA]));

        const s = result.scheduled[0];
        const durationMs = new Date(s.end).getTime() - new Date(s.start).getTime();
        expect(durationMs).toBe(duration * 60 * 1000);
    });
});

// ---------------------------------------------------------------------------
// Tests: dependency ordering / topological sort
// ---------------------------------------------------------------------------

describe('AutoScheduler — dependency ordering', () => {
    test('induction B with a dependency on A starts no earlier than A ends', () => {
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, 60);
        const autoB = mkAutoInduction('B', CESSNA, ALPHA_HANGAR, 60, {
            precedingInductions: [autoA]
        });
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA, autoB]));

        expect(result.scheduled).toHaveLength(2);
        const a = result.scheduled.find(s => s.id === 'A')!;
        const b = result.scheduled.find(s => s.id === 'B')!;
        expect(new Date(b.start).getTime()).toBeGreaterThanOrEqual(new Date(a.end).getTime());
    });

    test('topological sort: B listed first but depends on A — A is still scheduled first', () => {
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, 60);
        const autoB = mkAutoInduction('B', CESSNA, ALPHA_HANGAR, 60, {
            precedingInductions: [autoA]
        });
        // Pass B before A — topological sort must reorder
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoB, autoA]));

        expect(result.scheduled).toHaveLength(2);
        const a = result.scheduled.find(s => s.id === 'A')!;
        const b = result.scheduled.find(s => s.id === 'B')!;
        // A scheduled earlier than B
        expect(new Date(a.start).getTime()).toBeLessThan(new Date(b.start).getTime());
        // B starts no earlier than A ends
        expect(new Date(b.start).getTime()).toBeGreaterThanOrEqual(new Date(a.end).getTime());
    });
});

// ---------------------------------------------------------------------------
// Tests: unschedulable inductions
// ---------------------------------------------------------------------------

describe('AutoScheduler — unschedulable', () => {
    test('aircraft too wide for any door is moved to unscheduled', () => {
        const autoA = mkAutoInduction('WIDE-001', WIDE_AIRCRAFT, ALPHA_HANGAR, 60);
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA]));

        expect(result.scheduled).toHaveLength(0);
        expect(result.unscheduled).toHaveLength(1);
        expect(result.unscheduled[0].id).toBe('WIDE-001');
    });

    test('rejection reasons are populated and identify the failing rule', () => {
        const autoA = mkAutoInduction('WIDE-001', WIDE_AIRCRAFT, ALPHA_HANGAR, 60);
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA]));

        expect(result.rejectionReasons.has('WIDE-001')).toBe(true);
        const reasons = result.rejectionReasons.get('WIDE-001')!;
        expect(reasons.length).toBeGreaterThan(0);
        expect(reasons[0].ruleId).toBe('SFR11_DOOR_FIT');
    });
});

// ---------------------------------------------------------------------------
// Tests: requires clause in auto-inductions
// ---------------------------------------------------------------------------

describe('AutoScheduler — requires clause (minBaysOverride)', () => {

    /**
     * 3-bay hangar: Bay1(12m), Bay2(12m), Bay3(12m) in a row (each 12m wide).
     * Aircraft wingspan=11m → baysRequired = 1 (one bay suffices geometrically).
     * With requires=2, the scheduler must look for a 2-bay connected set.
     * All three bays fit (12m >= 11m wingspan), so a 2-bay set must be found.
     */
    test('requires=2 forces scheduler to find a 2-bay set even though 1 bay suffices geometrically', () => {
        const bay1 = mkBay('Bay1', 12, 10, 3, 0, 0);
        const bay2 = mkBay('Bay2', 12, 10, 3, 0, 1);
        const bay3 = mkBay('Bay3', 12, 10, 3, 0, 2);
        const hangar = mkHangar('Alpha', [MAIN_DOOR], [bay1, bay2, bay3], 1, 3);

        const auto = mkAutoInduction('REQ2', CESSNA, hangar, 60, { requires: 2 });
        const result = new AutoScheduler().schedule(mkModel([hangar], [], [auto]));

        expect(result.scheduled).toHaveLength(1);
        expect(result.scheduled[0].bays).toHaveLength(2);
    });

    /**
     * Single-bay hangar (ALPHA_HANGAR) with Cessna.
     * Geometry says 1 bay needed; requires=2 but only 1 bay exists.
     * The scheduler cannot satisfy the 2-bay requirement → unscheduled.
     */
    test('requires=2 in a single-bay hangar causes the induction to be unscheduled', () => {
        const auto = mkAutoInduction('REQ2-FAIL', CESSNA, ALPHA_HANGAR, 60, { requires: 2 });
        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [auto]));

        expect(result.scheduled).toHaveLength(0);
        expect(result.unscheduled).toHaveLength(1);
        expect(result.unscheduled[0].id).toBe('REQ2-FAIL');
    });
});

// ---------------------------------------------------------------------------
// Tests: bay-set fallback on time conflict
// ---------------------------------------------------------------------------

describe('AutoScheduler — bay-set iteration on time conflict', () => {
    /**
     * Two-bay hangar: Bay1 (col=0) and Bay2 (col=1), both fit CESSNA individually.
     * Two auto-inductions at the same notBefore time and same duration:
     *   - IND-A is scheduled first → assigned Bay1 (baySets[0]).
     *   - IND-B tries Bay1 → time conflict with IND-A → falls through to Bay2 → succeeds.
     * Both inductions should be scheduled at the same start time in different bays.
     */
    test('second induction uses baySets[1] when baySets[0] has a time conflict', () => {
        const bay1 = mkBay('Bay1', 12, 10, 3, 0, 0);
        const bay2 = mkBay('Bay2', 12, 10, 3, 0, 1);
        const hangar = mkHangar('DualBay', [MAIN_DOOR], [bay1, bay2], 1, 2);

        const notBefore = '2025-12-15T08:00:00Z';
        const autoA = mkAutoInduction('IND-A', CESSNA, hangar, 120, { notBefore });
        const autoB = mkAutoInduction('IND-B', CESSNA, hangar, 120, { notBefore });

        const result = new AutoScheduler().schedule(mkModel([hangar], [], [autoA, autoB]));

        expect(result.scheduled).toHaveLength(2);
        expect(result.unscheduled).toHaveLength(0);

        const a = result.scheduled.find(s => s.id === 'IND-A')!;
        const b = result.scheduled.find(s => s.id === 'IND-B')!;

        expect(a.bays).toHaveLength(1);
        expect(b.bays).toHaveLength(1);
        // Different bays — B fell through to the second candidate
        expect(a.bays[0]).not.toBe(b.bays[0]);
        // Same start time (both pinned to the same notBefore)
        expect(a.start).toBe(b.start);
    });
});
