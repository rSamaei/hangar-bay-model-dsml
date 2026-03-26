/**
 * Unit tests for auto-induction-checks.ts (SFR18/21/SFR_BAY_COUNT_OVERRIDE).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime.
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { AutoInduction } from '../../src/generated/ast.js';
import {
    checkAutoInductionTimeWindow,
    checkAutoPrecedenceCycles,
    checkAutoInductionBayCountOverride,
} from '../../src/validators/auto-induction-checks.js';

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

// ---------------------------------------------------------------------------
// checkAutoInductionTimeWindow — SFR21
// ---------------------------------------------------------------------------

describe('checkAutoInductionTimeWindow', () => {
    test('notBefore > notAfter — SFR21 error', () => {
        const accept = mockAccept();
        const autoInd = {
            notBefore: '2024-06-01T10:00',
            notAfter:  '2024-06-01T08:00',
        } as unknown as AutoInduction;
        checkAutoInductionTimeWindow(autoInd, accept);
        expect(calledWithCode(accept, 'SFR21_TIME_WINDOW')).toBe(true);
    });

    test('valid notBefore < notAfter — no error', () => {
        const accept = mockAccept();
        const autoInd = {
            notBefore: '2024-06-01T08:00',
            notAfter:  '2024-06-01T12:00',
        } as unknown as AutoInduction;
        checkAutoInductionTimeWindow(autoInd, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkAutoPrecedenceCycles — SFR18
// ---------------------------------------------------------------------------

describe('checkAutoPrecedenceCycles', () => {
    test('A→B→A cycle — SFR18 error', () => {
        const accept = mockAccept();
        const autoA = { $type: 'AutoInduction', precedingInductions: [] } as unknown as AutoInduction;
        const autoB = {
            $type: 'AutoInduction',
            precedingInductions: [{ ref: autoA }],
        } as unknown as AutoInduction;
        // Close the cycle: A depends on B
        (autoA as any).precedingInductions = [{ ref: autoB }];
        checkAutoPrecedenceCycles(autoA, accept);
        expect(calledWithCode(accept, 'SFR18_PRECEDENCE_CYCLE')).toBe(true);
    });

    test('B depends on A (no cycle) — no error', () => {
        const accept = mockAccept();
        const autoA = {
            $type: 'AutoInduction',
            precedingInductions: [],
        } as unknown as AutoInduction;
        const autoB = {
            $type: 'AutoInduction',
            precedingInductions: [{ ref: autoA }],
        } as unknown as AutoInduction;
        checkAutoPrecedenceCycles(autoB, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('empty precedingInductions — no error', () => {
        const accept = mockAccept();
        const autoInd = {
            $type: 'AutoInduction',
            precedingInductions: [],
        } as unknown as AutoInduction;
        checkAutoPrecedenceCycles(autoInd, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkAutoInductionBayCountOverride — SFR_BAY_COUNT_OVERRIDE
// ---------------------------------------------------------------------------

describe('checkAutoInductionBayCountOverride', () => {
    test('requires < geometric minimum — SFR_BAY_COUNT_OVERRIDE warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 25, length: 8, height: 3 };
        const bays = [
            { name: 'B1', width: 12 },
            { name: 'B2', width: 12 },
            { name: 'B3', width: 12 },
        ];
        const hangar = { name: 'H1', grid: { bays } };
        const model = {
            $type: 'Model',
            hangars: [hangar],
        };
        const autoInd = {
            requires: 2,   // wingspan 25 needs 3 bays (12+12+12=36≥25)
            aircraft: { ref: aircraft },
            clearance: undefined,
            preferredHangar: undefined,
        } as unknown as AutoInduction;
        (autoInd as any).$container = model;
        checkAutoInductionBayCountOverride(autoInd, accept);
        expect(calledWithCode(accept, 'SFR_BAY_COUNT_OVERRIDE')).toBe(true);
    });

    test('requires >= geometric minimum — no warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Cessna', wingspan: 11, length: 8, height: 3 };
        const bays = [{ name: 'B1', width: 12 }];
        const hangar = { name: 'H1', grid: { bays } };
        const model = {
            $type: 'Model',
            hangars: [hangar],
        };
        const autoInd = {
            requires: 1,   // wingspan 11 needs 1 bay (12≥11), requires=1 is OK
            aircraft: { ref: aircraft },
            clearance: undefined,
            preferredHangar: undefined,
        } as unknown as AutoInduction;
        (autoInd as any).$container = model;
        checkAutoInductionBayCountOverride(autoInd, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});
