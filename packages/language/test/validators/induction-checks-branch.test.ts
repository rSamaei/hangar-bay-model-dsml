/**
 * Branch-coverage tests for induction-checks.ts targeting uncovered lines:
 *   - Line 58  (sumDepth): longitudinal multi-bay combined-pass → INFO downgrade uses sumDepth
 *   - Line 108 (undefined): checkBayHangarMembership with no model container
 *   - Lines 119-126: unresolved bay ref ($refText) whose name exists in another hangar
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { Induction, HangarBay } from '../../src/generated/ast.js';
import {
    checkInductionFeasibility,
    checkBayHangarMembership,
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
    return calls.some(args => typeof args[1] === 'string' && (args[1] as string).includes(code));
}

function calledWithSeverity(accept: ValidationAcceptor, severity: string, code: string): boolean {
    const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    return calls.some(args => args[0] === severity && typeof args[1] === 'string' && (args[1] as string).includes(code));
}

function mkBay(name: string, width = 12, depth = 20, height = 6): HangarBay {
    return { name, width, depth, height, adjacent: [] } as unknown as HangarBay;
}

// ===========================================================================
// Line 58: sumDepth branch — longitudinal multi-bay, combined passes, per-bay fails
// ===========================================================================

describe('checkInductionFeasibility — longitudinal span, multi-bay combined pass uses sumDepth', () => {
    test('longitudinal: combined depth passes, per-bay depth fails → INFO (sumDepth path)', () => {
        const accept = mockAccept();
        // Aircraft: length 30m → needs sum of depths ≥ 30m
        // Each bay: depth 16m → individually too shallow, combined 32m ≥ 30m → combined passes
        const aircraft = { name: 'LongJet', wingspan: 10, length: 30, height: 4 };
        const door = { name: 'D1', width: 15, height: 6 };
        const bay1 = mkBay('Bay1', 12, 16);
        const bay2 = mkBay('Bay2', 12, 16);
        (bay1 as any).adjacent = [{ ref: bay2 }];
        (bay2 as any).adjacent = [{ ref: bay1 }];
        const hangar = { name: 'H1', doors: [door], grid: { bays: [bay1, bay2] } };
        const induction = {
            aircraft: { ref: aircraft },
            door: { ref: door },
            bays: [{ ref: bay1 }, { ref: bay2 }],
            hangar: { ref: hangar },
            span: 'longitudinal',
            clearance: undefined,
        } as unknown as Induction;
        checkInductionFeasibility(induction, accept);
        // Per-bay depth 16 < length 30 → fails individually
        // Combined depth 32 ≥ 30 → combined passes → downgraded to INFO
        expect(calledWithSeverity(accept, 'info', 'SFR12_BAY_FIT')).toBe(true);
        expect(calledWithSeverity(accept, 'error', 'SFR12_BAY_FIT')).toBe(false);
        expect(calledWithCode(accept, 'SFR12_COMBINED')).toBe(false);
    });
});

// ===========================================================================
// Line 108: checkBayHangarMembership with no model container
// ===========================================================================

describe('checkBayHangarMembership — no model container', () => {
    test('bay not in hangar bay set, no model container → SFR14 error still fires (via bayRef.ref path)', () => {
        const accept = mockAccept();
        const bayA = mkBay('BayA');
        const bayB = mkBay('BayB');  // belongs nowhere
        const hangar = { name: 'Alpha', grid: { bays: [bayA] } };
        // induction has no $container → getContainerOfType returns undefined → otherHangarBayNames = undefined
        const induction = {
            hangar: { ref: hangar },
            bays: [{ ref: bayB }],
            // No $container set
        } as unknown as Induction;
        checkBayHangarMembership(induction, accept);
        // bayB.ref is defined but not in hangar → SFR14 via resolved-ref path
        expect(calledWithCode(accept, 'SFR14_BAY_OWNERSHIP')).toBe(true);
    });

    test('bay in correct hangar, no model container → no error', () => {
        const accept = mockAccept();
        const bayA = mkBay('BayA');
        const hangar = { name: 'Alpha', grid: { bays: [bayA] } };
        const induction = {
            hangar: { ref: hangar },
            bays: [{ ref: bayA }],
        } as unknown as Induction;
        checkBayHangarMembership(induction, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ===========================================================================
// Lines 119-126: unresolved $refText path in checkBayHangarMembership
// ===========================================================================

describe('checkBayHangarMembership — unresolved bay ref ($refText)', () => {
    test('unresolved ref whose $refText matches a bay in another hangar → SFR14 error', () => {
        const accept = mockAccept();
        const bayA = mkBay('BayA');
        const bayB = mkBay('BayB');
        const hangarAlpha = { name: 'Alpha', grid: { bays: [bayA] } };
        const hangarBeta  = { name: 'Beta',  grid: { bays: [bayB] } };
        const model = {
            $type: 'Model',
            hangars: [hangarAlpha, hangarBeta],
            inductions: [],
            autoInductions: [],
        };
        // bayRef with no .ref (unresolved), but $refText = 'BayB' which is in hangarBeta
        const induction = {
            hangar: { ref: hangarAlpha },
            bays: [{ ref: undefined, $refText: 'BayB' }],
        } as unknown as Induction;
        (induction as any).$container = model;
        checkBayHangarMembership(induction, accept);
        expect(calledWithCode(accept, 'SFR14_BAY_OWNERSHIP')).toBe(true);
    });

    test('unresolved ref whose $refText does NOT match any other hangar bay → no SFR14 error', () => {
        const accept = mockAccept();
        const bayA = mkBay('BayA');
        const hangarAlpha = { name: 'Alpha', grid: { bays: [bayA] } };
        const model = {
            $type: 'Model',
            hangars: [hangarAlpha],
            inductions: [],
            autoInductions: [],
        };
        // unresolved ref to an unknown name that doesn't exist anywhere
        const induction = {
            hangar: { ref: hangarAlpha },
            bays: [{ ref: undefined, $refText: 'NoSuchBay' }],
        } as unknown as Induction;
        (induction as any).$container = model;
        checkBayHangarMembership(induction, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('unresolved ref whose $refText matches a bay in the SAME hangar (not other) → no SFR14 error', () => {
        const accept = mockAccept();
        const bayA = mkBay('BayA');
        const bayB = mkBay('BayB');
        const hangarAlpha = { name: 'Alpha', grid: { bays: [bayA, bayB] } };
        const model = {
            $type: 'Model',
            hangars: [hangarAlpha],
            inductions: [],
            autoInductions: [],
        };
        // BayB is in Alpha's own bay set — otherHangarBayNames won't contain it
        const induction = {
            hangar: { ref: hangarAlpha },
            bays: [{ ref: undefined, $refText: 'BayB' }],
        } as unknown as Induction;
        (induction as any).$container = model;
        checkBayHangarMembership(induction, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});
