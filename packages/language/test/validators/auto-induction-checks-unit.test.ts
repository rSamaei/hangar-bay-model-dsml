/**
 * Unit tests for auto-induction-checks.ts (SFR18 / SFR21 / SFR15_BAY_COUNT_OVERRIDE).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime.
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { AutoInduction } from '../../src/generated/ast.js';
import {
    checkAutoPrecedenceCycles,
    checkAutoInductionTimeWindow,
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
    return calls.some(args => typeof args[1] === 'string' && (args[1] as string).includes(code));
}

/** Create a minimal AutoInduction mock with the given preceding refs. */
function mkAuto(id?: string): AutoInduction {
    return {
        $type: 'AutoInduction',
        id,
        precedingInductions: [],
    } as unknown as AutoInduction;
}

// ---------------------------------------------------------------------------
// checkAutoPrecedenceCycles — SFR24_PRECEDENCE_CYCLE
// ---------------------------------------------------------------------------

describe('checkAutoPrecedenceCycles', () => {
    test('no precedingInductions — early return, no error', () => {
        const accept = mockAccept();
        const auto = mkAuto();
        checkAutoPrecedenceCycles(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('empty precedingInductions array — early return, no error', () => {
        const accept = mockAccept();
        const auto = { ...mkAuto(), precedingInductions: [] } as unknown as AutoInduction;
        checkAutoPrecedenceCycles(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('linear chain A→B (no cycle) — no error', () => {
        const accept = mockAccept();
        const autoB = mkAuto('B');
        const autoA = { ...mkAuto('A'), precedingInductions: [{ ref: autoB }] } as unknown as AutoInduction;
        checkAutoPrecedenceCycles(autoA, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('direct self-cycle A→A — SFR18 error', () => {
        const accept = mockAccept();
        const autoA = mkAuto('A');
        (autoA as any).precedingInductions = [{ ref: autoA }];
        checkAutoPrecedenceCycles(autoA, accept);
        expect(calledWithCode(accept, 'SFR24_PRECEDENCE_CYCLE')).toBe(true);
    });

    test('indirect cycle A→B→A — SFR18 error', () => {
        const accept = mockAccept();
        const autoA = mkAuto('A');
        const autoB = mkAuto('B');
        (autoA as any).precedingInductions = [{ ref: autoB }];
        (autoB as any).precedingInductions = [{ ref: autoA }];
        checkAutoPrecedenceCycles(autoA, accept);
        expect(calledWithCode(accept, 'SFR24_PRECEDENCE_CYCLE')).toBe(true);
    });

    test('shared dependency A→B and A→C, B→C — C visited once, no false positive', () => {
        const accept = mockAccept();
        const autoA = mkAuto('A');
        const autoB = mkAuto('B');
        const autoC = mkAuto('C');
        // A→B, A→C, B→C — diamond shape, no cycle
        (autoA as any).precedingInductions = [{ ref: autoB }, { ref: autoC }];
        (autoB as any).precedingInductions = [{ ref: autoC }];
        (autoC as any).precedingInductions = [];
        checkAutoPrecedenceCycles(autoA, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('precRef.ref is undefined (unresolved) — skipped gracefully', () => {
        const accept = mockAccept();
        const autoA = { ...mkAuto('A'), precedingInductions: [{ ref: undefined }] } as unknown as AutoInduction;
        checkAutoPrecedenceCycles(autoA, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('precRef.ref is a non-AutoInduction type — isAutoInduction check skips it', () => {
        const accept = mockAccept();
        // A manual induction with wrong $type — not treated as AutoInduction in the cycle check
        const manualInd = { $type: 'Induction', id: 'M1', precedingInductions: [] };
        const autoA = {
            ...mkAuto('A'),
            precedingInductions: [{ ref: manualInd }],
        } as unknown as AutoInduction;
        checkAutoPrecedenceCycles(autoA, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkAutoInductionTimeWindow — SFR21
// ---------------------------------------------------------------------------

describe('checkAutoInductionTimeWindow', () => {
    test('notBefore missing — early return, no error', () => {
        const accept = mockAccept();
        const auto = { notBefore: undefined, notAfter: '2024-01-01T18:00' } as unknown as AutoInduction;
        checkAutoInductionTimeWindow(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('notAfter missing — early return, no error', () => {
        const accept = mockAccept();
        const auto = { notBefore: '2024-01-01T08:00', notAfter: undefined } as unknown as AutoInduction;
        checkAutoInductionTimeWindow(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('notBefore === notAfter — SFR21 error (not strictly before)', () => {
        const accept = mockAccept();
        const auto = { notBefore: '2024-01-01T08:00', notAfter: '2024-01-01T08:00' } as unknown as AutoInduction;
        checkAutoInductionTimeWindow(auto, accept);
        expect(calledWithCode(accept, 'SFR26_TIME_WINDOW')).toBe(true);
    });

    test('notBefore after notAfter — SFR21 error', () => {
        const accept = mockAccept();
        const auto = { notBefore: '2024-01-01T18:00', notAfter: '2024-01-01T08:00' } as unknown as AutoInduction;
        checkAutoInductionTimeWindow(auto, accept);
        expect(calledWithCode(accept, 'SFR26_TIME_WINDOW')).toBe(true);
    });

    test('valid window (notBefore < notAfter) — no error', () => {
        const accept = mockAccept();
        const auto = { notBefore: '2024-01-01T08:00', notAfter: '2024-01-01T18:00' } as unknown as AutoInduction;
        checkAutoInductionTimeWindow(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkAutoInductionBayCountOverride — SFR15_BAY_COUNT_OVERRIDE
// ---------------------------------------------------------------------------

describe('checkAutoInductionBayCountOverride', () => {
    function mkModel(hangars: any[]) {
        return {
            $type: 'Model',
            hangars,
            inductions: [],
            autoInductions: [],
        };
    }

    function mkHangar(bays: { width: number }[]) {
        return {
            name: 'TestHangar',
            grid: { bays: bays.map((b, i) => ({ name: `Bay${i + 1}`, width: b.width, depth: 20, height: 6 })) },
        };
    }

    test('requires undefined — early return, no warning', () => {
        const accept = mockAccept();
        const auto = { requires: undefined, aircraft: { ref: { name: 'A', wingspan: 20 } } } as unknown as AutoInduction;
        checkAutoInductionBayCountOverride(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('no aircraft ref — early return, no warning', () => {
        const accept = mockAccept();
        const auto = { requires: 1, aircraft: undefined } as unknown as AutoInduction;
        checkAutoInductionBayCountOverride(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('no model container — early return, no warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'A', wingspan: 20 };
        const auto = {
            requires: 1,
            aircraft: { ref: aircraft },
            preferredHangar: undefined,
            clearance: undefined,
        } as unknown as AutoInduction;
        // No $container → AstUtils.getContainerOfType returns undefined
        checkAutoInductionBayCountOverride(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('no hangars in model — early return, no warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'A', wingspan: 20 };
        const model = mkModel([]);
        const auto = {
            requires: 1,
            aircraft: { ref: aircraft },
            preferredHangar: undefined,
            clearance: undefined,
        } as unknown as AutoInduction;
        (auto as any).$container = model;
        checkAutoInductionBayCountOverride(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('hangar with no bays — early return, no warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'A', wingspan: 20 };
        const hangar = { name: 'H', grid: { bays: [] } };
        const model = mkModel([hangar]);
        const auto = {
            requires: 1,
            aircraft: { ref: aircraft },
            preferredHangar: undefined,
            clearance: undefined,
        } as unknown as AutoInduction;
        (auto as any).$container = model;
        checkAutoInductionBayCountOverride(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('requires < geometric minimum — SFR15_BAY_COUNT_OVERRIDE warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 70, clearance: undefined };
        const hangar = mkHangar([{ width: 36 }, { width: 36 }]);
        const model = mkModel([hangar]);
        const auto = {
            requires: 1,          // geometric min = 2 (36+36=72 ≥ 70)
            aircraft: { ref: aircraft },
            preferredHangar: undefined,
            clearance: undefined,
        } as unknown as AutoInduction;
        (auto as any).$container = model;
        checkAutoInductionBayCountOverride(auto, accept);
        expect(calledWithCode(accept, 'SFR15_BAY_COUNT_OVERRIDE')).toBe(true);
    });

    test('requires === geometric minimum — no warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Narrow', wingspan: 11, clearance: undefined };
        const hangar = mkHangar([{ width: 12 }]);
        const model = mkModel([hangar]);
        const auto = {
            requires: 1,          // geometric min = 1 (12 ≥ 11)
            aircraft: { ref: aircraft },
            preferredHangar: undefined,
            clearance: undefined,
        } as unknown as AutoInduction;
        (auto as any).$container = model;
        checkAutoInductionBayCountOverride(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('preferred hangar restricts scope to that hangar', () => {
        const accept = mockAccept();
        const aircraft = { name: 'Wide', wingspan: 70, clearance: undefined };
        const preferredHangar = mkHangar([{ width: 36 }, { width: 36 }]);
        const otherHangar = mkHangar([{ width: 80 }]);
        const model = mkModel([otherHangar, preferredHangar]);
        const auto = {
            requires: 1,
            aircraft: { ref: aircraft },
            preferredHangar: { ref: preferredHangar },
            clearance: undefined,
        } as unknown as AutoInduction;
        (auto as any).$container = model;
        checkAutoInductionBayCountOverride(auto, accept);
        // Uses preferredHangar (needs 2 bays), requires=1 → warning
        expect(calledWithCode(accept, 'SFR15_BAY_COUNT_OVERRIDE')).toBe(true);
    });

    test('clearance lateral margin adds to effective wingspan', () => {
        const accept = mockAccept();
        const clearance = { lateralMargin: 5 };
        const aircraft = { name: 'A', wingspan: 30, clearance: undefined };
        // effectiveWingspan = 30 + 5 = 35; hangar has one 36m bay → min 1 bay
        const hangar = mkHangar([{ width: 36 }]);
        const model = mkModel([hangar]);
        const auto = {
            requires: 1,
            aircraft: { ref: aircraft },
            preferredHangar: undefined,
            clearance: { ref: clearance },
        } as unknown as AutoInduction;
        (auto as any).$container = model;
        checkAutoInductionBayCountOverride(auto, accept);
        // effectiveWingspan=35 ≤ 36, geometric min=1, requires=1 → no warning
        expect(wasCalled(accept)).toBe(false);
    });

    test('zero effective wingspan — early return, no warning', () => {
        const accept = mockAccept();
        const aircraft = { name: 'A', wingspan: 0, clearance: undefined };
        const hangar = mkHangar([{ width: 12 }]);
        const model = mkModel([hangar]);
        const auto = {
            requires: 1,
            aircraft: { ref: aircraft },
            preferredHangar: undefined,
            clearance: undefined,
        } as unknown as AutoInduction;
        (auto as any).$container = model;
        checkAutoInductionBayCountOverride(auto, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});
