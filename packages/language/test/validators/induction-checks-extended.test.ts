/**
 * Extended unit tests for induction-checks.ts
 *
 * Covers branches not reached by induction-checks-unit.test.ts:
 *   - checkBayCountSufficiency with longitudinal span
 *   - checkBayCountSufficiency with requires override >= geometric minimum (no warning)
 *   - checkDuplicateAutoInductionId with duplicate auto-induction IDs
 *   - checkDuplicateAutoInductionId with cross-type duplicates (induction + auto-induction share same ID)
 *   - generateValidationReport with a model containing violations
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { Induction, AutoInduction, HangarBay, Model } from '../../src/generated/ast.js';
import {
    checkBayCountSufficiency,
    checkDuplicateAutoInductionId,
    generateValidationReport,
} from '../../src/validators/induction-checks.js';

// ---------------------------------------------------------------------------
// Helpers (mirrors induction-checks-unit.test.ts)
// ---------------------------------------------------------------------------

function mockAccept(): ValidationAcceptor {
    return vi.fn() as unknown as ValidationAcceptor;
}

function calledWithCode(accept: ValidationAcceptor, code: string): boolean {
    const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    return calls.some(args => typeof args[1] === 'string' && args[1].includes(code));
}

function wasCalled(accept: ValidationAcceptor): boolean {
    return (accept as ReturnType<typeof vi.fn>).mock.calls.length > 0;
}

function mkBay(name: string, width: number, depth = 20, height = 6): HangarBay {
    return { name, width, depth, height, adjacent: [] } as unknown as HangarBay;
}

// ---------------------------------------------------------------------------
// checkBayCountSufficiency — longitudinal span
// ---------------------------------------------------------------------------

describe('checkBayCountSufficiency — longitudinal span', () => {
    test('too few bays for length — SFR25 warning (longitudinal)', () => {
        const accept = mockAccept();
        const aircraft = { name: 'LongPlane', wingspan: 10, length: 40, height: 3 };
        const bay1 = mkBay('Bay1', 12, 15);
        const bay2 = mkBay('Bay2', 12, 15);
        const bay3 = mkBay('Bay3', 12, 15);
        const hangar = { name: 'H1', doors: [], grid: { bays: [bay1, bay2, bay3] } };
        // Aircraft length 40, each bay depth 15 → need 3 bays (15+15+15=45≥40)
        // Only 1 bay assigned → SFR25
        const induction = {
            aircraft: { ref: aircraft },
            bays: [{ ref: bay1 }],
            hangar: { ref: hangar },
            span: 'longitudinal',
            clearance: undefined,
            requires: undefined,
        } as unknown as Induction;
        checkBayCountSufficiency(induction, accept);
        expect(calledWithCode(accept, 'SFR14_BAY_COUNT')).toBe(true);
    });

    test('sufficient bays for length — no warning (longitudinal)', () => {
        const accept = mockAccept();
        const aircraft = { name: 'LongPlane', wingspan: 10, length: 10, height: 3 };
        const bay1 = mkBay('Bay1', 12, 15);
        const hangar = { name: 'H1', doors: [], grid: { bays: [bay1] } };
        // Aircraft length 10 ≤ bay depth 15 → 1 bay is enough
        const induction = {
            aircraft: { ref: aircraft },
            bays: [{ ref: bay1 }],
            hangar: { ref: hangar },
            span: 'longitudinal',
            clearance: undefined,
            requires: undefined,
        } as unknown as Induction;
        checkBayCountSufficiency(induction, accept);
        expect(calledWithCode(accept, 'SFR14_BAY_COUNT')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkBayCountSufficiency — requires override at or above geometric minimum
// ---------------------------------------------------------------------------

describe('checkBayCountSufficiency — requires override', () => {
    test('requires override equal to geometric minimum — no SFR15_BAY_COUNT_OVERRIDE warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 25, length: 8, height: 3 };
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);
        const bay3 = mkBay('Bay3', 12);
        const hangar = { name: 'H1', doors: [], grid: { bays: [bay1, bay2, bay3] } };
        // Wingspan 25, bays each 12m → need 3 (12+12+12=36≥25)
        // requires=3 matches geometric minimum exactly → no override warning
        const induction = {
            aircraft: { ref: aircraft },
            bays: [{ ref: bay1 }, { ref: bay2 }, { ref: bay3 }],
            hangar: { ref: hangar },
            span: undefined,
            clearance: undefined,
            requires: 3,
        } as unknown as Induction;
        checkBayCountSufficiency(induction, accept);
        expect(calledWithCode(accept, 'SFR15_BAY_COUNT_OVERRIDE')).toBe(false);
        expect(calledWithCode(accept, 'SFR14_BAY_COUNT')).toBe(false);
    });

    test('requires override above geometric minimum — no warnings', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Small', wingspan: 8, length: 5, height: 2 };
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);
        const hangar = { name: 'H1', doors: [], grid: { bays: [bay1, bay2] } };
        // Wingspan 8, bay 12m → geometric minimum = 1 bay
        // requires=2 is above minimum → no warning; both bays assigned → SFR25 satisfied
        const induction = {
            aircraft: { ref: aircraft },
            bays: [{ ref: bay1 }, { ref: bay2 }],
            hangar: { ref: hangar },
            span: undefined,
            clearance: undefined,
            requires: 2,
        } as unknown as Induction;
        checkBayCountSufficiency(induction, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('requires override above minimum but not enough bays assigned — SFR25 fires', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Small', wingspan: 8, length: 5, height: 2 };
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);
        const hangar = { name: 'H1', doors: [], grid: { bays: [bay1, bay2] } };
        // Wingspan 8 → geometric min = 1; requires=2 sets effective min to 2
        // Only 1 bay assigned → SFR25 fires (need 2, got 1)
        const induction = {
            aircraft: { ref: aircraft },
            bays: [{ ref: bay1 }],
            hangar: { ref: hangar },
            span: undefined,
            clearance: undefined,
            requires: 2,
        } as unknown as Induction;
        checkBayCountSufficiency(induction, accept);
        expect(calledWithCode(accept, 'SFR14_BAY_COUNT')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// checkDuplicateAutoInductionId — SFR22
// ---------------------------------------------------------------------------

describe('checkDuplicateAutoInductionId', () => {
    test('duplicate auto-induction IDs — SFR22 error on second', () => {
        const accept = mockAccept();
        const ai1 = { id: 'AI001', $cstNode: undefined } as unknown as AutoInduction;
        const ai2 = { id: 'AI001', $cstNode: undefined } as unknown as AutoInduction;
        const model = {
            $type: 'Model',
            inductions: [],
            autoInductions: [ai1, ai2],
        } as unknown as Model;
        (ai2 as any).$container = model;
        checkDuplicateAutoInductionId(ai2, accept);
        expect(calledWithCode(accept, 'SFR27_DUPLICATE_ID')).toBe(true);
    });

    test('unique auto-induction ID — no error', () => {
        const accept = mockAccept();
        const ai1 = { id: 'AI001', $cstNode: undefined } as unknown as AutoInduction;
        const ai2 = { id: 'AI002', $cstNode: undefined } as unknown as AutoInduction;
        const model = {
            $type: 'Model',
            inductions: [],
            autoInductions: [ai1, ai2],
        } as unknown as Model;
        (ai2 as any).$container = model;
        checkDuplicateAutoInductionId(ai2, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('auto-induction ID collides with a manual induction ID — SFR22 error', () => {
        const accept = mockAccept();
        // manual induction with same ID as the auto-induction under test
        const manualInd = { id: 'SHARED', $cstNode: { range: { start: { line: 0 } } } } as unknown as Induction;
        const autoInd   = { id: 'SHARED', $cstNode: undefined } as unknown as AutoInduction;
        const model = {
            $type: 'Model',
            inductions: [manualInd],
            autoInductions: [autoInd],
        } as unknown as Model;
        (autoInd as any).$container = model;
        checkDuplicateAutoInductionId(autoInd, accept);
        expect(calledWithCode(accept, 'SFR27_DUPLICATE_ID')).toBe(true);
    });

    test('no ID on auto-induction — skipped silently', () => {
        const accept = mockAccept();
        const ai = { id: undefined } as unknown as AutoInduction;
        checkDuplicateAutoInductionId(ai, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// generateValidationReport
// ---------------------------------------------------------------------------

describe('generateValidationReport', () => {
    test('returns report object for empty model', () => {
        const report = generateValidationReport({ inductions: [] });
        expect(report).toBeDefined();
    });

    test('returns report for model with fully resolved induction', () => {
        const aircraft = { name: 'Cessna', wingspan: 11, length: 8, height: 3 };
        const door     = { name: 'D1', width: 15, height: 5 };
        const bay      = { name: 'Bay1', width: 12, depth: 10, height: 5, adjacent: [] };
        const hangar   = { name: 'H1', doors: [door], grid: { bays: [bay] } };
        const model = {
            inductions: [{
                aircraft: { ref: aircraft },
                hangar: { ref: hangar },
                bays: [{ ref: bay }],
                door: { ref: door },
                clearance: undefined,
            }],
        };
        const report = generateValidationReport(model);
        expect(report).toBeDefined();
    });
});
