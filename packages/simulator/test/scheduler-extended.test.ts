/**
 * Extended unit tests for AutoScheduler covering branches not exercised by
 * scheduler.test.ts:
 *
 *   - Lines 46–48:  makeBayRejection.rejectedSets mapper — needs non-empty
 *                   bayResult.rejections (aircraft fits door but not bays)
 *   - Lines 120–124: INVALID_AIRCRAFT_REF path — aircraft.ref is null/undefined
 *   - Line 154:     tryScheduleAuto return { success: false } after all bay-set
 *                   candidates fail timing — i.e. spatial placement succeeds but
 *                   every candidate bay is blocked by a prior induction
 *
 * Also validates the evidence shape produced by makeConflictRejection (tested
 * indirectly via rejectionReasons).
 */
import { describe, expect, test } from 'vitest';
import { AutoScheduler } from '../src/scheduler.js';
import { mkAircraft, mkDoor, mkBay, mkHangar, mkAutoInduction, mkModel } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);
const MAIN_DOOR = mkDoor('MainDoor', 13, 3);
const BAY1 = mkBay('Bay1', 12, 10, 3, 0, 0);
const ALPHA_HANGAR = mkHangar('Alpha', [MAIN_DOOR], [BAY1], 1, 1);

// ---------------------------------------------------------------------------
// Lines 120–124: INVALID_AIRCRAFT_REF
//
// tryScheduleAuto returns immediately when autoInd.aircraft.ref is undefined.
// ---------------------------------------------------------------------------

describe('AutoScheduler — unresolved aircraft reference', () => {
    test('null aircraft ref produces INVALID_AIRCRAFT_REF rejection', () => {
        // Construct an auto-induction with an unresolved aircraft reference
        const autoWithNullRef = {
            id: 'BAD-REF',
            aircraft: { ref: undefined, $refText: 'Ghost' },
            preferredHangar: { ref: ALPHA_HANGAR, $refText: 'Alpha' },
            duration: 60,
            requires: undefined,
            notBefore: undefined,
            notAfter: undefined,
            precedingInductions: [],
            clearance: undefined,
            $type: 'AutoInduction',
        };

        const model = mkModel([ALPHA_HANGAR], [], [autoWithNullRef as any]);
        const result = new AutoScheduler().schedule(model);

        expect(result.scheduled).toHaveLength(0);
        expect(result.unscheduled).toHaveLength(1);

        const reasons = result.rejectionReasons.get('BAD-REF')!;
        expect(reasons).toHaveLength(1);
        expect(reasons[0].ruleId).toBe('INVALID_AIRCRAFT_REF');
        expect(reasons[0].message).toBe('Aircraft reference not resolved');
        expect(reasons[0].evidence).toMatchObject({ autoInductionId: 'BAD-REF' });
    });
});

// ---------------------------------------------------------------------------
// Lines 46–48: makeBayRejection.rejectedSets mapper
//
// Aircraft fits through the door (wide door) but is too wide for every bay.
// findSuitableBaySets returns rejections (tried-and-failed sets), so the map
// callback at lines 46–48 executes.
// ---------------------------------------------------------------------------

describe('AutoScheduler — bay rejection with rejectedSets details', () => {
    test('rejection has NO_SUITABLE_BAY_SET ruleId with rejectedSets evidence when bays are too narrow', () => {
        // Aircraft wingspan=20 — too wide for 12 m bays but passes through a 25 m door
        const wideAircraft = mkAircraft('WideBody', 20, 15, 4, 4);
        const wideDoor = mkDoor('WideDoor', 25, 5);
        const narrowBay = mkBay('NarrowBay', 12, 15, 5, 0, 0);
        const hangar = mkHangar('NarrowHangar', [wideDoor], [narrowBay], 1, 1);

        const auto = mkAutoInduction('NARROW-FAIL', wideAircraft, hangar, 60);
        const result = new AutoScheduler().schedule(mkModel([hangar], [], [auto]));

        expect(result.scheduled).toHaveLength(0);
        const reasons = result.rejectionReasons.get('NARROW-FAIL')!;
        expect(reasons).toBeDefined();

        const bayRejection = reasons.find(r => r.ruleId === 'NO_SUITABLE_BAY_SET');
        expect(bayRejection).toBeDefined();
        expect(bayRejection!.evidence).toHaveProperty('hangar', 'NarrowHangar');
        expect(bayRejection!.evidence).toHaveProperty('baysRequired');
        // rejectedSets is populated (lines 46–48 ran for each rejection entry)
        expect(bayRejection!.evidence).toHaveProperty('rejectedSets');
        const rejectedSets = bayRejection!.evidence.rejectedSets as any[];
        expect(rejectedSets.length).toBeGreaterThan(0);
        expect(rejectedSets[0]).toHaveProperty('ruleId');
        expect(rejectedSets[0]).toHaveProperty('message');
        expect(rejectedSets[0]).toHaveProperty('evidence');
    });
});

// ---------------------------------------------------------------------------
// Line 154: tryScheduleAuto final `return { success: false, rejections }`
//
// Spatial placement succeeds (door + bays fit the aircraft) but ALL bay-set
// candidates are blocked by a pre-existing scheduled induction at the same
// time slot.  With a single bay and a fixed notBefore/notAfter window that
// already contains another induction, there is no alternative bay to fall
// back to, so tryScheduleAuto exhausts all candidates and returns false.
// ---------------------------------------------------------------------------

describe('AutoScheduler — all bay-set candidates blocked by time conflict', () => {
    test('returns failure with SFR16_TIME_OVERLAP when every bay set is temporally occupied', () => {
        // Use a fixed time window so both autos target the same slot.
        const notBefore = '2030-01-01T08:00:00Z';
        const notAfter  = '2030-01-01T09:00:00Z'; // 60 min window, exactly one slot

        // IND-A is scheduled first and occupies Bay1 for 60 min.
        const autoA = mkAutoInduction('IND-A', CESSNA, ALPHA_HANGAR, 60, { notBefore, notAfter });
        // IND-B targets the same hangar and same forced time window.
        const autoB = mkAutoInduction('IND-B', CESSNA, ALPHA_HANGAR, 60, { notBefore, notAfter });

        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA, autoB]));

        // IND-A is placed; IND-B cannot be placed (only one bay, same time slot)
        expect(result.scheduled.find(s => s.id === 'IND-A')).toBeDefined();
        expect(result.unscheduled.find(a => a.id === 'IND-B')).toBeDefined();
    });

    test('makeConflictRejection evidence has correct shape (hangar, bays, requestedWindow, conflictingInductions)', () => {
        const notBefore = '2030-06-01T08:00:00Z';
        const notAfter  = '2030-06-01T09:00:00Z';

        const autoA = mkAutoInduction('IND-A', CESSNA, ALPHA_HANGAR, 60, { notBefore, notAfter });
        const autoB = mkAutoInduction('IND-B', CESSNA, ALPHA_HANGAR, 60, { notBefore, notAfter });

        const result = new AutoScheduler().schedule(mkModel([ALPHA_HANGAR], [], [autoA, autoB]));

        const reasons = result.rejectionReasons.get('IND-B')!;
        expect(reasons).toBeDefined();

        const conflict = reasons.find(r => r.ruleId === 'SFR16_TIME_OVERLAP');
        expect(conflict).toBeDefined();
        expect(conflict!.evidence).toHaveProperty('hangar', 'Alpha');
        expect(conflict!.evidence).toHaveProperty('bays');
        expect(conflict!.evidence).toHaveProperty('requestedWindow');
        expect((conflict!.evidence.requestedWindow as any)).toHaveProperty('start');
        expect((conflict!.evidence.requestedWindow as any)).toHaveProperty('end');
        expect(conflict!.evidence).toHaveProperty('conflictingInductions');
        expect((conflict!.evidence.conflictingInductions as string[])).toContain('IND-A');
    });
});
