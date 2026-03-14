/**
 * Unit tests for analyzeAndSchedule() — the top-level analysis pipeline.
 *
 * analyzeAndSchedule() orchestrates:
 *   1. AutoScheduler.schedule()   (if autoInductions exist)
 *   2. buildValidationReport()
 *   3. buildExportModel()
 *
 * Both builders access aircraft dimensions, bay geometry, and adjacency data,
 * so fixtures must include the full structural mock (aircraft wingspan/length/
 * height, bay width/depth/height/row/col, hangar grid rows/cols).
 *
 * The dynamic-reachability check (SFR_DYNAMIC_REACHABILITY) is automatically
 * skipped when no doors or bays carry an accessNode — which is true for all
 * fixtures below — so no access-path mocks are required.
 */
import { describe, expect, test } from 'vitest';
import { analyzeAndSchedule } from '../src/analysis.js';
import { mkAircraft, mkDoor, mkBay, mkHangar, mkManualInduction, mkAutoInduction, mkModel } from './helpers/fixtures.js';

// ---------------------------------------------------------------------------
// Standard fixtures
// ---------------------------------------------------------------------------

// Small aircraft that fits in all test doors and bays below
// wingspan=11, length=8, height=2.7, tailHeight=2.7
const CESSNA = mkAircraft('Cessna172', 11, 8, 2.7, 2.7);

// Aircraft whose wingspan (30 m) exceeds the door width (13 m)
const WIDE_AIRCRAFT = mkAircraft('WideJet', 30, 20, 5, 5);

// Door fits CESSNA: width=13 >= 11 wingspan, height=3 >= 2.7 tailHeight
const MAIN_DOOR = mkDoor('MainDoor', 13, 3);

// Bay fits CESSNA: sumWidth=12 >= 11, depth=10 >= 8, height=3 >= 2.7
// baysRequired = ceil(11/12) = 1
const BAY1 = mkBay('Bay1', 12, 10, 3, 0, 0);

// One-door, one-bay hangar (grid 1×1)
const ALPHA_HANGAR = mkHangar('Alpha', [MAIN_DOOR], [BAY1], 1, 1);

// ---------------------------------------------------------------------------
// Tests: return structure
// ---------------------------------------------------------------------------

describe('analyzeAndSchedule — return structure', () => {
    test('result contains both report and exportModel', () => {
        const model = mkModel([ALPHA_HANGAR], [], []);
        const result = analyzeAndSchedule(model);

        expect(result).toHaveProperty('report');
        expect(result).toHaveProperty('exportModel');
    });

    test('report has the expected summary shape', () => {
        const model = mkModel([ALPHA_HANGAR], [], []);
        const { report } = analyzeAndSchedule(model);

        expect(report).toHaveProperty('violations');
        expect(Array.isArray(report.violations)).toBe(true);
        expect(report).toHaveProperty('timestamp');
        expect(report).toHaveProperty('summary');
        expect(report.summary).toHaveProperty('totalViolations');
        expect(report.summary).toHaveProperty('bySeverity');
        expect(report.summary.bySeverity).toHaveProperty('errors');
        expect(report.summary.bySeverity).toHaveProperty('warnings');
    });

    test('exportModel carries the airfield name and required top-level keys', () => {
        const model = mkModel([ALPHA_HANGAR], [], []);
        const { exportModel } = analyzeAndSchedule(model);

        expect(exportModel.airfieldName).toBe('TestAirfield');
        expect(exportModel).toHaveProperty('inductions');
        expect(exportModel).toHaveProperty('derived');
    });
});

// ---------------------------------------------------------------------------
// Tests: clean model (no violations expected)
// ---------------------------------------------------------------------------

describe('analyzeAndSchedule — clean model', () => {
    test('model with no inductions produces zero violations', () => {
        const model = mkModel([ALPHA_HANGAR], [], []);
        const { report } = analyzeAndSchedule(model);

        expect(report.summary.totalViolations).toBe(0);
        expect(report.violations).toHaveLength(0);
    });

    test('valid manual induction appears in exportModel.inductions', () => {
        const ind = mkManualInduction(
            'IND-001', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const model = mkModel([ALPHA_HANGAR], [ind], []);
        const { report, exportModel } = analyzeAndSchedule(model);

        expect(report.summary.totalViolations).toBe(0);
        expect(exportModel.inductions).toHaveLength(1);
        expect(exportModel.inductions[0].id).toBe('IND-001');
        expect(exportModel.inductions[0].kind).toBe('manual');
    });
});

// ---------------------------------------------------------------------------
// Tests: auto-induction scheduling
// ---------------------------------------------------------------------------

describe('analyzeAndSchedule — auto-inductions', () => {
    test('model with auto-inductions includes autoSchedule in exportModel', () => {
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, 60);
        const model = mkModel([ALPHA_HANGAR], [], [autoA]);
        const { exportModel } = analyzeAndSchedule(model);

        expect(exportModel.autoSchedule).toBeDefined();
        expect(exportModel.autoSchedule).toHaveProperty('scheduled');
        expect(exportModel.autoSchedule).toHaveProperty('unscheduled');
    });

    test('schedulable auto-induction appears in autoSchedule.scheduled with kind=auto', () => {
        const autoA = mkAutoInduction('A', CESSNA, ALPHA_HANGAR, 60);
        const model = mkModel([ALPHA_HANGAR], [], [autoA]);
        const { exportModel } = analyzeAndSchedule(model);

        expect(exportModel.autoSchedule!.scheduled).toHaveLength(1);
        expect(exportModel.autoSchedule!.scheduled[0].id).toBe('A');
        expect(exportModel.autoSchedule!.scheduled[0].kind).toBe('auto');
    });
});

// ---------------------------------------------------------------------------
// Tests: scheduling failure
// ---------------------------------------------------------------------------

describe('analyzeAndSchedule — scheduling failure', () => {
    test('auto-induction that cannot be scheduled produces a SCHED_FAILED violation', () => {
        // WIDE_AIRCRAFT wingspan=30 does not fit through MAIN_DOOR width=13
        const autoA = mkAutoInduction('WIDE-001', WIDE_AIRCRAFT, ALPHA_HANGAR, 60);
        const model = mkModel([ALPHA_HANGAR], [], [autoA]);
        const { report } = analyzeAndSchedule(model);

        const failed = report.violations.filter(v => v.ruleId === 'SCHED_FAILED');
        expect(failed).toHaveLength(1);
        expect(failed[0].subject.id).toBe('WIDE-001');
    });

    test('SCHED_FAILED violation has warning severity (not error)', () => {
        const autoA = mkAutoInduction('WIDE-001', WIDE_AIRCRAFT, ALPHA_HANGAR, 60);
        const model = mkModel([ALPHA_HANGAR], [], [autoA]);
        const { report } = analyzeAndSchedule(model);

        const failed = report.violations.find(v => v.ruleId === 'SCHED_FAILED')!;
        expect(failed.severity).toBe('warning');
    });
});

// ---------------------------------------------------------------------------
// Tests: aircraft-level clearance fallback
// ---------------------------------------------------------------------------

// A clearance envelope attached to the aircraft type (not to any induction).
// lateralMargin=2 means effective wingspan = raw + 2.
const AIRCRAFT_CLEARANCE = {
    name: 'AircraftDefaultClearance',
    lateralMargin: 2,
    longitudinalMargin: 0,
    verticalMargin: 0,
    $type: 'ClearanceEnvelope'
};

// Aircraft: raw wingspan=10, but with AIRCRAFT_CLEARANCE applied: effectiveWingspan=12.
const AIRCRAFT_WITH_DEFAULT_CLEARANCE = {
    name: 'ClearanceAircraft',
    wingspan: 10,
    length: 8,
    height: 3,
    tailHeight: 3,
    clearance: { ref: AIRCRAFT_CLEARANCE, $refText: 'AircraftDefaultClearance' },
    $type: 'AircraftType'
};

// Door width=11: raw wingspan 10 fits, but effective wingspan 12 does not.
const TIGHT_DOOR = mkDoor('TightDoor', 11, 4);
const TIGHT_BAY  = mkBay('TightBay', 12, 10, 4, 0, 0);
const TIGHT_HANGAR = mkHangar('TightHangar', [TIGHT_DOOR], [TIGHT_BAY], 1, 1);

describe('analyzeAndSchedule — aircraft-level clearance fallback', () => {
    test('SFR11_DOOR_FIT is raised when aircraft-level clearance makes wingspan exceed door (no induction-level clearance)', () => {
        // Without the two-level fallback fix the report would resolve clearance=undefined,
        // use raw wingspan=10 (fits door width=11) and produce no violation.
        // With the fix it resolves aircraft.clearance?.ref, gets effectiveWingspan=12 and raises SFR11.
        const ind = mkManualInduction(
            'IND-CLR', AIRCRAFT_WITH_DEFAULT_CLEARANCE, TIGHT_HANGAR, [TIGHT_BAY], TIGHT_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const model = mkModel([TIGHT_HANGAR], [ind], []);
        const { report } = analyzeAndSchedule(model);

        const doorFit = report.violations.filter(v => v.ruleId === 'SFR11_DOOR_FIT');
        expect(doorFit).toHaveLength(1);
        expect((doorFit[0] as any).evidence.effectiveDimensions.wingspan).toBe(12); // 10 + lateralMargin=2
        expect((doorFit[0] as any).evidence.clearanceName).toBe('AircraftDefaultClearance');
    });

    test('effective dimensions in exportModel reflect aircraft-level clearance when no induction-level clearance', () => {
        const ind = mkManualInduction(
            'IND-CLR', AIRCRAFT_WITH_DEFAULT_CLEARANCE, TIGHT_HANGAR, [TIGHT_BAY], TIGHT_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const model = mkModel([TIGHT_HANGAR], [ind], []);
        const { exportModel } = analyzeAndSchedule(model);

        expect(exportModel.inductions).toHaveLength(1);
        // wingspanEff in derived properties must include the aircraft-level clearance margin
        expect(exportModel.inductions[0].derived.wingspanEff).toBe(12); // 10 + 2
    });

    test('no SFR11 violation when aircraft has no clearance and raw wingspan fits door', () => {
        // Control: same geometry, aircraft without any clearance — should pass SFR11.
        const bareAircraft = mkAircraft('BareAircraft', 10, 8, 3, 3);
        const ind = mkManualInduction(
            'IND-BARE', bareAircraft, TIGHT_HANGAR, [TIGHT_BAY], TIGHT_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const model = mkModel([TIGHT_HANGAR], [ind], []);
        const { report } = analyzeAndSchedule(model);

        expect(report.violations.filter(v => v.ruleId === 'SFR11_DOOR_FIT')).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Tests: span direction threading into baysRequired
// ---------------------------------------------------------------------------

// Aircraft: narrow wingspan (5 m) but long body (20 m).
// Lateral  → span = wingspan = 5  → one 12 m wide bay covers it → baysRequired = 1
// Longitudinal → span = length = 20 → bays are 8 m deep: need 3 (8+8+8=24 ≥ 20) → baysRequired = 3
const NARROW_LONG = mkAircraft('NarrowLong', 5, 20, 3, 3);
const WIDE_DOOR   = mkDoor('WideDoor', 20, 4);

// Three bays, each 12 m wide × 8 m deep — arranged in a column so they're adjacent
const LONG_BAY1 = mkBay('LBay1', 12, 8, 4, 0, 0);
const LONG_BAY2 = mkBay('LBay2', 12, 8, 4, 1, 0);
const LONG_BAY3 = mkBay('LBay3', 12, 8, 4, 2, 0);
const LONG_HANGAR = mkHangar('LongHangar', [WIDE_DOOR], [LONG_BAY1, LONG_BAY2, LONG_BAY3], 3, 1);

function mkManualInductionWithSpan(
    id: string,
    aircraft: any,
    hangar: any,
    bays: any[],
    door: any,
    start: string,
    end: string,
    span: string
) {
    return {
        ...mkManualInduction(id, aircraft, hangar, bays, door, start, end),
        span
    };
}

describe('analyzeAndSchedule — span direction threaded into baysRequired', () => {
    test('lateral induction: baysRequired uses wingspan (1 bay for narrow aircraft)', () => {
        const ind = mkManualInductionWithSpan(
            'LATERAL-IND', NARROW_LONG, LONG_HANGAR, [LONG_BAY1], WIDE_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00', 'lateral'
        );
        const model = mkModel([LONG_HANGAR], [ind], []);
        const { exportModel } = analyzeAndSchedule(model);

        // wingspan=5, widest bay=12 → greedy needs 1 bay
        expect(exportModel.inductions[0].derived.baysRequired).toBe(1);
    });

    test('longitudinal induction: baysRequired uses length (3 bays for long aircraft)', () => {
        const ind = mkManualInductionWithSpan(
            'LONGIT-IND', NARROW_LONG, LONG_HANGAR, [LONG_BAY1, LONG_BAY2, LONG_BAY3], WIDE_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00', 'longitudinal'
        );
        const model = mkModel([LONG_HANGAR], [ind], []);
        const { exportModel } = analyzeAndSchedule(model);

        // length=20, bay depths=[8,8,8] → greedy: 8+8+8=24 ≥ 20 → 3 bays
        expect(exportModel.inductions[0].derived.baysRequired).toBe(3);
    });

    test('omitting span defaults to lateral (baysRequired uses wingspan)', () => {
        const ind = mkManualInduction(
            'DEFAULT-IND', NARROW_LONG, LONG_HANGAR, [LONG_BAY1], WIDE_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00'
        );
        const model = mkModel([LONG_HANGAR], [ind], []);
        const { exportModel } = analyzeAndSchedule(model);

        expect(exportModel.inductions[0].derived.baysRequired).toBe(1);
    });
});
