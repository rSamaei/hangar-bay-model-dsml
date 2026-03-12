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
