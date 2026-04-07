/**
 * Tests for SFR22_CORRIDOR_FIT violations in buildValidationReport.
 *
 * Layout used in all tests:
 *   Door(MainDoor) → N_door → N_corridor(width=8m) → N_bay → Bay1
 *
 * Aircraft: effectiveWingspan = wingspan (no clearance applied in these mocks).
 * buildValidationReport is exercised via analyzeAndSchedule so the full pipeline runs.
 */
import { describe, expect, test } from 'vitest';
import { buildValidationReport } from '../src/builders/validation-report.js';
import type { CorridorFitViolation } from '../src/types/validation.js';

// ---------------------------------------------------------------------------
// Fixture helpers (structural mocks — no Langium runtime needed)
// ---------------------------------------------------------------------------

function ref<T>(val: T | undefined) {
    return { ref: val, $refText: (val as any)?.name ?? '' };
}

function mkNode(name: string, width?: number) {
    return { name, width, $type: 'AccessNode' };
}

function mkLink(fromNode: any, toNode: any, bidirectional = true) {
    return { from: ref(fromNode), to: ref(toNode), bidirectional, $type: 'AccessLink' };
}

function mkPath(name: string, nodes: any[], links: any[]) {
    return { name, nodes, links, $type: 'AccessPath' };
}

function mkDoor(name: string, width: number, height: number, accessNode?: any) {
    return { name, width, height, accessNode: accessNode ? ref(accessNode) : undefined, $type: 'HangarDoor' };
}

function mkBay(name: string, width: number, depth: number, height: number, accessNode?: any) {
    return { name, width, depth, height, adjacent: [], accessNode: accessNode ? ref(accessNode) : undefined, $type: 'HangarBay' };
}

function mkHangar(name: string, doors: any[], bays: any[]) {
    return { name, doors, grid: { bays }, $type: 'Hangar' };
}

function mkAircraft(name: string, wingspan: number, length: number, height: number) {
    return { name, wingspan, length, height, tailHeight: height, $type: 'AircraftType' };
}

function mkInduction(
    id: string | undefined,
    aircraft: any,
    hangar: any,
    bays: any[],
    start: string,
    end: string
) {
    return {
        id,
        aircraft: ref(aircraft),
        hangar:   ref(hangar),
        bays: bays.map((b: any) => ref(b)),
        door: undefined,
        clearance: undefined,
        start,
        end,
        $type: 'Induction'
    };
}

function mkModel(hangars: any[], inductions: any[], accessPaths: any[]): any {
    return {
        name: 'TestAirfield',
        hangars,
        inductions,
        autoInductions: [],
        accessPaths,
        $type: 'Model'
    };
}

// ---------------------------------------------------------------------------
// Shared corridor layout
// Door → N_door → N_corridor(width=8m, no bayName) → N_bay → Bay1
// ---------------------------------------------------------------------------

const CORRIDOR_WIDTH = 8;

const nDoor      = mkNode('N_door');
const nCorridor  = mkNode('N_corridor', CORRIDOR_WIDTH);
const nBay       = mkNode('N_bay');
const mainDoor   = mkDoor('MainDoor', 20, 6, nDoor);
const bay1       = mkBay('Bay1', 15, 12, 6, nBay);
const hangar     = mkHangar('TestHangar', [mainDoor], [bay1]);
const accessPath = mkPath('P1',
    [nDoor, nCorridor, nBay],
    [mkLink(nDoor, nCorridor), mkLink(nCorridor, nBay)]
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildValidationReport — SFR22_CORRIDOR_FIT', () => {
    test('no violation when aircraft wingspan fits through corridor', () => {
        // wingspan=6 < corridorWidth=8 → fits
        const aircraft  = mkAircraft('SmallAC', 6, 10, 3);
        const induction = mkInduction('IND-SMALL', aircraft, hangar, [bay1], '2024-06-01T08:00', '2024-06-01T10:00');
        const model     = mkModel([hangar], [induction], [accessPath]);

        const report = buildValidationReport(model as any);
        const corridorViolations = report.violations.filter(v => v.ruleId === 'SFR22_CORRIDOR_FIT');
        expect(corridorViolations).toHaveLength(0);
    });

    test('violation emitted when aircraft wingspan exceeds corridor width', () => {
        // wingspan=12 > corridorWidth=8 → blocked
        const aircraft  = mkAircraft('WideAC', 12, 15, 4);
        const induction = mkInduction('IND-WIDE', aircraft, hangar, [bay1], '2024-06-01T08:00', '2024-06-01T10:00');
        const model     = mkModel([hangar], [induction], [accessPath]);

        const report = buildValidationReport(model as any);
        const corridorViolations = report.violations.filter(v => v.ruleId === 'SFR22_CORRIDOR_FIT');
        expect(corridorViolations).toHaveLength(1);
    });

    test('violation has warning severity', () => {
        const aircraft  = mkAircraft('WideAC', 12, 15, 4);
        const induction = mkInduction('IND-WIDE', aircraft, hangar, [bay1], '2024-06-01T08:00', '2024-06-01T10:00');
        const model     = mkModel([hangar], [induction], [accessPath]);

        const report = buildValidationReport(model as any);
        const v = report.violations.find(v => v.ruleId === 'SFR22_CORRIDOR_FIT')!;
        expect(v.severity).toBe('warning');
    });

    test('violation evidence has correct fields', () => {
        const aircraft  = mkAircraft('WideAC', 12, 15, 4);
        const induction = mkInduction('IND-WIDE', aircraft, hangar, [bay1], '2024-06-01T08:00', '2024-06-01T10:00');
        const model     = mkModel([hangar], [induction], [accessPath]);

        const report = buildValidationReport(model as any);
        const v = report.violations.find(v => v.ruleId === 'SFR22_CORRIDOR_FIT') as CorridorFitViolation;
        expect(v.evidence.aircraftName).toBe('WideAC');
        expect(v.evidence.effectiveWingspan).toBe(12);
        expect(v.evidence.corridorNodeName).toBe('N_corridor');
        expect(v.evidence.corridorWidth).toBe(CORRIDOR_WIDTH);
        expect(v.evidence.unreachableBays).toContain('Bay1');
    });

    test('no violation when hangar has no access graph modelled', () => {
        // Door and bay have no accessNode — graph is null → skipped
        const bareHangar  = mkHangar('BareHangar', [mkDoor('D1', 20, 6)], [mkBay('B1', 15, 12, 6)]);
        const aircraft    = mkAircraft('WideAC', 12, 15, 4);
        const ind         = mkInduction(undefined, aircraft, bareHangar, [mkBay('B1', 15, 12, 6)], '2024-06-01T08:00', '2024-06-01T10:00');
        const model       = mkModel([bareHangar], [ind], []);

        const report = buildValidationReport(model as any);
        expect(report.violations.filter(v => v.ruleId === 'SFR22_CORRIDOR_FIT')).toHaveLength(0);
    });

    test('one violation per unique narrow corridor node, collecting all blocked bays', () => {
        // Two bays, both blocked by the same narrow corridor.
        // Layout: N_door → N_corridor(8m) → N_bay1 + N_bay2 (via separate edges)
        const nBay1b = mkNode('N_bay1b');
        const nBay2b = mkNode('N_bay2b');
        const bay1b  = mkBay('Bay1b', 15, 12, 6, nBay1b);
        const bay2b  = mkBay('Bay2b', 15, 12, 6, nBay2b);
        const nCorr  = mkNode('N_corr', 8);
        const nDoorB = mkNode('N_doorB');
        const doorB  = mkDoor('DoorB', 20, 6, nDoorB);
        const hangarB = mkHangar('HangarB', [doorB], [bay1b, bay2b]);
        const pathB   = mkPath('PB',
            [nDoorB, nCorr, nBay1b, nBay2b],
            [mkLink(nDoorB, nCorr), mkLink(nCorr, nBay1b), mkLink(nCorr, nBay2b)]
        );
        const aircraft  = mkAircraft('WideAC', 12, 15, 4);
        const ind = mkInduction('IND-2BAY', aircraft, hangarB, [bay1b, bay2b], '2024-06-01T08:00', '2024-06-01T10:00');
        const model = mkModel([hangarB], [ind], [pathB]);

        const report = buildValidationReport(model as any);
        const corridorVs = report.violations.filter(v => v.ruleId === 'SFR22_CORRIDOR_FIT') as CorridorFitViolation[];
        // Exactly one violation (one corridor node)
        expect(corridorVs).toHaveLength(1);
        // Both bays listed as unreachable
        expect(corridorVs[0].evidence.unreachableBays).toHaveLength(2);
        expect(corridorVs[0].evidence.unreachableBays).toContain('Bay1b');
        expect(corridorVs[0].evidence.unreachableBays).toContain('Bay2b');
    });
});
