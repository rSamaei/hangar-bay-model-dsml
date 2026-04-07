/**
 * Unit tests for induction-checks.ts (SFR11/12/13/14/21/22/24/25 rules).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime.
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { Induction, HangarBay, Model } from '../../src/generated/ast.js';
import {
    greedyBaysRequired,
    checkInductionTimeWindow,
    checkInductionFeasibility,
    checkBayHangarMembership,
    checkDoorFitPrecheck,
    checkBayCountSufficiency,
    checkDuplicateInductionId,
} from '../../src/validators/induction-checks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockAccept(): ValidationAcceptor {
    return vi.fn() as unknown as ValidationAcceptor;
}

function wasCalled(accept: ValidationAcceptor): boolean {
    return (accept as ReturnType<typeof vi.fn>).mock.calls.length > 0;
}

function calledWithCode(accept: ValidationAcceptor, code: string): boolean {
    const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    return calls.some(args => typeof args[1] === 'string' && args[1].includes(code));
}

function calledWithSeverity(accept: ValidationAcceptor, severity: string, code: string): boolean {
    const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    return calls.some(args => args[0] === severity && typeof args[1] === 'string' && args[1].includes(code));
}

// ---------------------------------------------------------------------------
// greedyBaysRequired
// ---------------------------------------------------------------------------

describe('greedyBaysRequired', () => {
    test('exact fit — 2 bays cover threshold', () => {
        const { count } = greedyBaysRequired([10, 10, 10], 20);
        expect(count).toBe(2);
    });

    test('fractional fit — all 3 bays needed', () => {
        const { count } = greedyBaysRequired([10, 10, 10], 25);
        expect(count).toBe(3);
    });

    test('single bay covers threshold', () => {
        const { count } = greedyBaysRequired([10], 5);
        expect(count).toBe(1);
    });

    test('empty dimensions array — zero bays used', () => {
        const { count } = greedyBaysRequired([], 0);
        expect(count).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// checkInductionTimeWindow — SFR21
// ---------------------------------------------------------------------------

describe('checkInductionTimeWindow', () => {
    test('start > end — SFR21 error', () => {
        const accept = mockAccept();
        const induction = {
            start: '2024-06-01T10:00',
            end: '2024-06-01T08:00',
        } as unknown as Induction;
        checkInductionTimeWindow(induction, accept);
        expect(calledWithCode(accept, 'SFR26_TIME_WINDOW')).toBe(true);
    });

    test('start === end — SFR21 error', () => {
        const accept = mockAccept();
        const induction = {
            start: '2024-06-01T08:00',
            end: '2024-06-01T08:00',
        } as unknown as Induction;
        checkInductionTimeWindow(induction, accept);
        expect(calledWithCode(accept, 'SFR26_TIME_WINDOW')).toBe(true);
    });

    test('start < end — no error', () => {
        const accept = mockAccept();
        const induction = {
            start: '2024-06-01T08:00',
            end: '2024-06-01T12:00',
        } as unknown as Induction;
        checkInductionTimeWindow(induction, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkInductionFeasibility — SFR11/12/13
// ---------------------------------------------------------------------------

function mkBay(name: string, width: number, depth = 20, height = 6): HangarBay {
    return { name, width, depth, height, adjacent: [] } as unknown as HangarBay;
}

describe('checkInductionFeasibility', () => {
    test('door too narrow — SFR11 error', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 20, length: 8, height: 3 };
        const door = { name: 'D1', width: 10, height: 5 };
        const bay = mkBay('Bay1', 25);
        const hangar = { name: 'H1', doors: [door], grid: { bays: [bay] } };
        const induction = {
            aircraft: { ref: aircraft },
            door: { ref: door },
            bays: [{ ref: bay }],
            hangar: { ref: hangar },
            span: undefined,
            clearance: undefined,
        } as unknown as Induction;
        checkInductionFeasibility(induction, accept);
        expect(calledWithCode(accept, 'SFR11_DOOR_FIT')).toBe(true);
    });

    test('bay too narrow (single bay) — SFR12 error', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 20, length: 8, height: 3 };
        const door = { name: 'D1', width: 25, height: 5 };
        const bay = mkBay('Bay1', 15);
        const hangar = { name: 'H1', doors: [door], grid: { bays: [bay] } };
        const induction = {
            aircraft: { ref: aircraft },
            door: { ref: door },
            bays: [{ ref: bay }],
            hangar: { ref: hangar },
            span: undefined,
            clearance: undefined,
        } as unknown as Induction;
        checkInductionFeasibility(induction, accept);
        expect(calledWithSeverity(accept, 'error', 'SFR12_BAY_FIT')).toBe(true);
    });

    test('multi-bay: combined pass, per-bay fail — downgraded to info', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 20, length: 8, height: 3 };
        const door = { name: 'D1', width: 25, height: 5 };
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);
        // Make bays adjacent so contiguity passes
        (bay1 as any).adjacent = [{ ref: bay2 }];
        (bay2 as any).adjacent = [{ ref: bay1 }];
        const hangar = { name: 'H1', doors: [door], grid: { bays: [bay1, bay2] } };
        const induction = {
            aircraft: { ref: aircraft },
            door: { ref: door },
            bays: [{ ref: bay1 }, { ref: bay2 }],
            hangar: { ref: hangar },
            span: 'lateral',
            clearance: undefined,
        } as unknown as Induction;
        checkInductionFeasibility(induction, accept);
        // Per-bay fails but combined (12+12=24 >= 20) passes → severity info
        expect(calledWithSeverity(accept, 'info', 'SFR12_BAY_FIT')).toBe(true);
        expect(calledWithSeverity(accept, 'error', 'SFR12_BAY_FIT')).toBe(false);
    });

    test('multi-bay: combined fail — per-bay error + SFR12_COMBINED error', () => {
        const accept = mockAccept();
        const aircraft = { name: 'VeryWide', wingspan: 30, length: 8, height: 3 };
        const door = { name: 'D1', width: 35, height: 5 };
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);
        (bay1 as any).adjacent = [{ ref: bay2 }];
        (bay2 as any).adjacent = [{ ref: bay1 }];
        const hangar = { name: 'H1', doors: [door], grid: { bays: [bay1, bay2] } };
        const induction = {
            aircraft: { ref: aircraft },
            door: { ref: door },
            bays: [{ ref: bay1 }, { ref: bay2 }],
            hangar: { ref: hangar },
            span: 'lateral',
            clearance: undefined,
        } as unknown as Induction;
        checkInductionFeasibility(induction, accept);
        // Combined 12+12=24 < 30 → combined fails, per-bay stay as errors
        expect(calledWithCode(accept, 'SFR12_COMBINED')).toBe(true);
        expect(calledWithSeverity(accept, 'error', 'SFR12_BAY_FIT')).toBe(true);
    });

    test('two disconnected bays — SFR13 contiguity error', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Cessna', wingspan: 11, length: 8, height: 3 };
        const door = { name: 'D1', width: 15, height: 5 };
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);
        // No adjacency refs, no grid → disconnected
        const hangar = { name: 'H1', doors: [door], grid: { bays: [bay1, bay2] } };
        const induction = {
            aircraft: { ref: aircraft },
            door: { ref: door },
            bays: [{ ref: bay1 }, { ref: bay2 }],
            hangar: { ref: hangar },
            span: 'lateral',
            clearance: undefined,
        } as unknown as Induction;
        checkInductionFeasibility(induction, accept);
        expect(calledWithCode(accept, 'SFR16_CONTIGUITY')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// checkBayHangarMembership — SFR14
// ---------------------------------------------------------------------------

describe('checkBayHangarMembership', () => {
    test('bay belongs to a different hangar — SFR14 error', () => {
        const accept = mockAccept();
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);  // belongs to otherHangar
        const hangar = { name: 'Alpha', grid: { bays: [bay1] } };
        const induction = {
            hangar: { ref: hangar },
            bays: [{ ref: bay2 }],
            $container: {
                $type: 'Model',
                hangars: [hangar],
                inductions: [],
                autoInductions: [],
            },
        } as unknown as Induction;
        checkBayHangarMembership(induction, accept);
        expect(calledWithCode(accept, 'SFR17_BAY_OWNERSHIP')).toBe(true);
    });

    test('bay belongs to the correct hangar — no error', () => {
        const accept = mockAccept();
        const bay1 = mkBay('Bay1', 12);
        const hangar = { name: 'Alpha', grid: { bays: [bay1] } };
        const induction = {
            hangar: { ref: hangar },
            bays: [{ ref: bay1 }],
            $container: {
                $type: 'Model',
                hangars: [hangar],
                inductions: [],
                autoInductions: [],
            },
        } as unknown as Induction;
        checkBayHangarMembership(induction, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkDoorFitPrecheck — SFR24
// ---------------------------------------------------------------------------

describe('checkDoorFitPrecheck', () => {
    test('aircraft cannot fit through any hangar door — SFR24 warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 30, length: 8, height: 3, tailHeight: undefined };
        const hangar = {
            name: 'H1',
            doors: [{ width: 15, height: 5 }],
        };
        const induction = {
            door: undefined,
            aircraft: { ref: aircraft },
            hangar: { ref: hangar },
            clearance: undefined,
        } as unknown as Induction;
        checkDoorFitPrecheck(induction, accept);
        expect(calledWithCode(accept, 'SFR13_DOOR_FIT_PRECHECK')).toBe(true);
    });

    test('aircraft fits at least one door — no warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Cessna', wingspan: 11, length: 8, height: 3, tailHeight: undefined };
        const hangar = {
            name: 'H1',
            doors: [{ width: 15, height: 5 }],
        };
        const induction = {
            door: undefined,
            aircraft: { ref: aircraft },
            hangar: { ref: hangar },
            clearance: undefined,
        } as unknown as Induction;
        checkDoorFitPrecheck(induction, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkBayCountSufficiency — SFR25 + SFR15_BAY_COUNT_OVERRIDE
// ---------------------------------------------------------------------------

describe('checkBayCountSufficiency', () => {
    test('fewer bays assigned than geometric minimum — SFR25 warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 25, length: 8, height: 3 };
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);
        const bay3 = mkBay('Bay3', 12);
        const hangar = { name: 'H1', doors: [], grid: { bays: [bay1, bay2, bay3] } };
        // Only 1 bay assigned, but wingspan 25 needs 3 × 12m bays
        const induction = {
            aircraft: { ref: aircraft },
            bays: [{ ref: bay1 }],
            hangar: { ref: hangar },
            span: undefined,
            clearance: undefined,
            requires: undefined,
        } as unknown as Induction;
        checkBayCountSufficiency(induction, accept);
        expect(calledWithCode(accept, 'SFR14_BAY_COUNT')).toBe(true);
    });

    test('requires override below geometric minimum — SFR15_BAY_COUNT_OVERRIDE warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 25, length: 8, height: 3 };
        const bay1 = mkBay('Bay1', 12);
        const bay2 = mkBay('Bay2', 12);
        const bay3 = mkBay('Bay3', 12);
        const hangar = { name: 'H1', doors: [], grid: { bays: [bay1, bay2, bay3] } };
        // Wingspan 25 needs 3 bays (12+12+12=36≥25), but requires=2 declares less
        const induction = {
            aircraft: { ref: aircraft },
            bays: [{ ref: bay1 }, { ref: bay2 }, { ref: bay3 }],
            hangar: { ref: hangar },
            span: undefined,
            clearance: undefined,
            requires: 2,
        } as unknown as Induction;
        checkBayCountSufficiency(induction, accept);
        expect(calledWithCode(accept, 'SFR15_BAY_COUNT_OVERRIDE')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// checkDuplicateInductionId — SFR22
// ---------------------------------------------------------------------------

describe('checkDuplicateInductionId', () => {
    test('duplicate induction IDs — SFR22 error on the second', () => {
        const accept = mockAccept();
        const ind1 = { id: 'IND001', $cstNode: undefined } as unknown as Induction;
        const ind2 = { id: 'IND001', $cstNode: undefined } as unknown as Induction;
        const model = {
            $type: 'Model',
            inductions: [ind1, ind2],
            autoInductions: [],
        } as unknown as Model;
        (ind2 as any).$container = model;
        checkDuplicateInductionId(ind2, accept);
        expect(calledWithCode(accept, 'SFR27_DUPLICATE_ID')).toBe(true);
    });

    test('unique induction ID — no error', () => {
        const accept = mockAccept();
        const ind1 = { id: 'IND001', $cstNode: undefined } as unknown as Induction;
        const ind2 = { id: 'IND002', $cstNode: undefined } as unknown as Induction;
        const model = {
            $type: 'Model',
            inductions: [ind1, ind2],
            autoInductions: [],
        } as unknown as Model;
        (ind2 as any).$container = model;
        checkDuplicateInductionId(ind2, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});
