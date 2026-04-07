/**
 * Extended unit tests for buildValidationReport() covering branches not
 * exercised by the existing test suite:
 *
 *   - Lines 244–270: checkTimeOverlaps + inductionSide — two overlapping manual
 *                    inductions produce SFR23_TIME_OVERLAP violations
 *   - Lines 289–291: schedFailedViolation — SFR23_TIME_OVERLAP as primary reason
 *                    → message includes "time slot conflict"
 *   - Lines 296–297: schedFailedViolation — unknown ruleId fallback
 *                    → message uses primary.message directly
 *   - Lines 329–331: sortViolations id tie-breaking — two violations with same
 *                    ruleId/type/name but different ids → sorted by id
 */
import { describe, expect, test } from 'vitest';
import { buildValidationReport } from '../src/builders/validation-report.js';
import { mkAircraft, mkDoor, mkBay, mkHangar, mkManualInduction, mkAutoInduction, mkModel } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);
const MAIN_DOOR = mkDoor('MainDoor', 13, 3);
const BAY1 = mkBay('Bay1', 12, 10, 3, 0, 0);
const BAY2 = mkBay('Bay2', 12, 10, 3, 0, 1);
const ALPHA_HANGAR = mkHangar('Alpha', [MAIN_DOOR], [BAY1, BAY2], 1, 2);

// ---------------------------------------------------------------------------
// Lines 244–270: SFR23_TIME_OVERLAP from checkTimeOverlaps + inductionSide
//
// Two manual inductions in the same hangar / bay with overlapping windows
// trigger detectConflicts() → SFR23_TIME_OVERLAP violation with full evidence.
// ---------------------------------------------------------------------------

describe('buildValidationReport — SFR23_TIME_OVERLAP from overlapping manual inductions', () => {
    test('two overlapping inductions produce an SFR23_TIME_OVERLAP violation', () => {
        const indA = mkManualInduction(
            'IND-A', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const indB = mkManualInduction(
            'IND-B', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T09:00', '2024-06-01T11:00'
        );

        const model = mkModel([ALPHA_HANGAR], [indA, indB], []);
        const { violations } = buildValidationReport(model);

        const overlap = violations.filter(v => v.ruleId === 'SFR23_TIME_OVERLAP');
        expect(overlap).toHaveLength(1);
    });

    test('SFR23_TIME_OVERLAP violation has correct evidence shape', () => {
        const indA = mkManualInduction(
            'IND-A', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const indB = mkManualInduction(
            'IND-B', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T09:00', '2024-06-01T11:00'
        );

        const model = mkModel([ALPHA_HANGAR], [indA, indB], []);
        const { violations } = buildValidationReport(model);

        const v = violations.find(v => v.ruleId === 'SFR23_TIME_OVERLAP')!;
        const ev = v.evidence as any;

        expect(ev).toHaveProperty('induction1');
        expect(ev).toHaveProperty('induction2');
        expect(ev).toHaveProperty('overlapInterval');
        expect(ev.overlapInterval).toHaveProperty('start');
        expect(ev.overlapInterval).toHaveProperty('end');
        expect(ev).toHaveProperty('intersectingBays');
        expect(ev.intersectingBays).toContain('Bay1');

        // inductionSide fields (lines 263–269)
        expect(ev.induction1).toHaveProperty('aircraft');
        expect(ev.induction1).toHaveProperty('hangar');
        expect(ev.induction1).toHaveProperty('bays');
        expect(ev.induction1).toHaveProperty('timeWindow');
    });
});

// ---------------------------------------------------------------------------
// Lines 289–291: schedFailedViolation — SFR23_TIME_OVERLAP primary reason
// ---------------------------------------------------------------------------

describe('buildValidationReport — schedFailedViolation SFR23_TIME_OVERLAP branch', () => {
    test('primary reason SFR23_TIME_OVERLAP → message contains "time slot conflict"', () => {
        const auto = mkAutoInduction('BLOCKED', CESSNA, ALPHA_HANGAR, 60);

        const scheduleResult = {
            scheduled: [],
            unscheduled: [auto as any],
            rejectionReasons: new Map([
                ['BLOCKED', [{
                    ruleId: 'SFR23_TIME_OVERLAP',
                    message: 'Time slot conflict',
                    evidence: { conflictingInductions: ['IND-EXISTING'], hangar: 'Alpha' }
                }]]
            ])
        };

        const model = mkModel([ALPHA_HANGAR], [], [auto as any]);
        const { violations } = buildValidationReport(model, scheduleResult as any);

        const failed = violations.find(v => v.ruleId === 'SCHED_FAILED')!;
        expect(failed).toBeDefined();
        expect(failed.message).toContain('time slot conflict');
        expect(failed.message).toContain('IND-EXISTING');
    });

    test('SFR23_TIME_OVERLAP with empty conflictingInductions falls back to "other inductions"', () => {
        const auto = mkAutoInduction('BLOCKED2', CESSNA, ALPHA_HANGAR, 60);

        const scheduleResult = {
            scheduled: [],
            unscheduled: [auto as any],
            rejectionReasons: new Map([
                ['BLOCKED2', [{
                    ruleId: 'SFR23_TIME_OVERLAP',
                    message: 'Time slot conflict',
                    evidence: { conflictingInductions: [], hangar: 'Alpha' }
                }]]
            ])
        };

        const model = mkModel([ALPHA_HANGAR], [], [auto as any]);
        const { violations } = buildValidationReport(model, scheduleResult as any);

        const failed = violations.find(v => v.ruleId === 'SCHED_FAILED')!;
        expect(failed.message).toContain('other inductions');
    });
});

// ---------------------------------------------------------------------------
// Line 295: schedFailedViolation — NO_SUITABLE_BAY_SET branch
// ---------------------------------------------------------------------------

describe('buildValidationReport — schedFailedViolation NO_SUITABLE_BAY_SET branch', () => {
    test('primary reason NO_SUITABLE_BAY_SET → message contains "no suitable bay configuration"', () => {
        const auto = mkAutoInduction('BAY-FAIL', CESSNA, ALPHA_HANGAR, 60);

        const scheduleResult = {
            scheduled: [],
            unscheduled: [auto as any],
            rejectionReasons: new Map([
                ['BAY-FAIL', [{
                    ruleId: 'NO_SUITABLE_BAY_SET',
                    message: 'No suitable bay sets in hangar Alpha',
                    evidence: { hangar: 'Alpha' },
                }]],
            ]),
        };

        const model = mkModel([ALPHA_HANGAR], [], [auto as any]);
        const { violations } = buildValidationReport(model, scheduleResult as any);

        const failed = violations.find(v => v.ruleId === 'SCHED_FAILED')!;
        expect(failed).toBeDefined();
        expect(failed.message).toContain('no suitable bay configuration');
    });
});

// ---------------------------------------------------------------------------
// Lines 296–297: schedFailedViolation — unknown ruleId fallback
// ---------------------------------------------------------------------------

describe('buildValidationReport — schedFailedViolation unknown ruleId fallback', () => {
    test('unknown primary ruleId → message appends primary.message directly', () => {
        const auto = mkAutoInduction('UNKNOWN-FAIL', CESSNA, ALPHA_HANGAR, 60);

        const scheduleResult = {
            scheduled: [],
            unscheduled: [auto as any],
            rejectionReasons: new Map([
                ['UNKNOWN-FAIL', [{
                    ruleId: 'SOME_CUSTOM_RULE',
                    message: 'Custom failure reason text',
                    evidence: {}
                }]]
            ])
        };

        const model = mkModel([ALPHA_HANGAR], [], [auto as any]);
        const { violations } = buildValidationReport(model, scheduleResult as any);

        const failed = violations.find(v => v.ruleId === 'SCHED_FAILED')!;
        expect(failed).toBeDefined();
        expect(failed.message).toContain('Custom failure reason text');
    });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Lines 282–284: schedFailedViolation — null id + null aircraft ref
//
// When the unscheduled auto has no id and no aircraft.ref, all three fallback
// branches (id ?? fallback, aircraft.ref?.name ?? 'unknown', name ?? 'Unknown')
// and the rejectionReasons.get(autoId) ?? [] fallback fire.
// ---------------------------------------------------------------------------

describe('buildValidationReport — schedFailedViolation null-id and null-aircraft fallbacks', () => {
    test('auto with id=undefined and aircraft.ref=undefined uses all fallback strings', () => {
        const nullIdAuto = {
            id: undefined,
            aircraft: { ref: undefined, $refText: 'Ghost' },
            preferredHangar: undefined,
            duration: 60,
            requires: undefined,
            notBefore: undefined,
            notAfter: undefined,
            precedingInductions: [],
            clearance: undefined,
            $type: 'AutoInduction',
        };

        // No rejection reasons for 'auto_unknown' → reasons = [] → primary = undefined
        const scheduleResult = {
            scheduled: [],
            unscheduled: [nullIdAuto as any],
            rejectionReasons: new Map(),
        };

        const model = mkModel([ALPHA_HANGAR], [], [nullIdAuto as any]);
        const { violations } = buildValidationReport(model, scheduleResult as any);

        const failed = violations.find(v => v.ruleId === 'SCHED_FAILED')!;
        expect(failed).toBeDefined();
        // aircraftName fell back to 'Unknown' (line 283)
        expect(failed.subject.name).toBe('Unknown');
        // autoId fell back to 'auto_unknown' (lines 282 inner ?? 'unknown')
        expect(failed.subject.id).toBe('auto_unknown');
    });
});

// ---------------------------------------------------------------------------
// Line 290: schedFailedViolation — SFR23_TIME_OVERLAP with no conflictingInductions key
//
// primary.evidence?.conflictingInductions ?? [] fires when the key is absent.
// ---------------------------------------------------------------------------

describe('buildValidationReport — schedFailedViolation SFR16 with missing conflictingInductions', () => {
    test('SFR23_TIME_OVERLAP without conflictingInductions in evidence uses ?? [] fallback', () => {
        const auto = mkAutoInduction('SFR16-NO-LIST', CESSNA, ALPHA_HANGAR, 60);

        const scheduleResult = {
            scheduled: [],
            unscheduled: [auto as any],
            rejectionReasons: new Map([
                ['SFR16-NO-LIST', [{
                    ruleId: 'SFR23_TIME_OVERLAP',
                    message: 'Conflict',
                    evidence: {}, // no conflictingInductions key
                }]],
            ]),
        };

        const model = mkModel([ALPHA_HANGAR], [], [auto as any]);
        const { violations } = buildValidationReport(model, scheduleResult as any);

        const failed = violations.find(v => v.ruleId === 'SCHED_FAILED')!;
        expect(failed).toBeDefined();
        // conflictingInductions ?? [] → empty list → join('') = '' → 'other inductions'
        expect(failed.message).toContain('other inductions');
    });
});

// ---------------------------------------------------------------------------
// Lines 329–331: sortViolations — id tie-breaking
//
// Two violations with the same ruleId, subject.type and subject.name but
// different subject.id values — sorted by id alphabetically.
// Use SFR11_DOOR_FIT (door too narrow) on the same aircraft type, two
// inductions with ids 'IND-Z' and 'IND-A' → after sort IND-A must come first.
// ---------------------------------------------------------------------------

describe('buildValidationReport — sortViolations id tie-breaking', () => {
    test('violations with same ruleId/type/name are ordered by subject.id', () => {
        // Aircraft too wide for door: wingspan=20, door width=13 → SFR11 on both
        const wideAircraft = mkAircraft('WideBody', 20, 8, 3, 3);
        const narrowDoor = mkDoor('NarrowDoor', 13, 4);
        const hangar = mkHangar('TestHangar', [narrowDoor], [BAY1], 1, 1);

        // IND-Z comes first in the model array but should sort after IND-A
        const indZ = mkManualInduction('IND-Z', wideAircraft, hangar, [BAY1], narrowDoor,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const indA = mkManualInduction('IND-A', wideAircraft, hangar, [BAY1], narrowDoor,
            '2024-06-01T12:00', '2024-06-01T14:00');

        const model = mkModel([hangar], [indZ, indA], []);
        const { violations } = buildValidationReport(model);

        const sfr11 = violations.filter(v => v.ruleId === 'SFR11_DOOR_FIT');
        expect(sfr11).toHaveLength(2);

        // Both same ruleId='SFR11_DOOR_FIT', type='Induction', name='WideBody'
        // → tie-broken by subject.id: 'IND-A' < 'IND-Z'
        expect(sfr11[0].subject.id).toBe('IND-A');
        expect(sfr11[1].subject.id).toBe('IND-Z');
    });
});
