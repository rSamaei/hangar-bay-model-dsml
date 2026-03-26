/**
 * Unit tests for well-formedness checks (WF_* and SFR7_* rules).
 *
 * Imports directly from the TypeScript source so v8 instruments the source
 * for coverage, rather than running through the Langium runtime + compiled JS.
 *
 * Uses structural mocks — plain objects cast to the relevant AST types.
 * No Langium runtime is loaded.
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { Model, Hangar, HangarBay, AccessLink } from '../../src/generated/ast.js';
import {
    checkDuplicateAircraftNames,
    checkDuplicateBayNames,
    checkDuplicateHangarNames,
    checkDuplicateClearanceNames,
    checkSelfAdjacency,
    checkSelfLoopAccessLink,
    checkAtLeastOneHangar,
} from '../../src/validators/well-formedness-checks.js';

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
// WF_DUPLICATE_AIRCRAFT
// ---------------------------------------------------------------------------

describe('checkDuplicateAircraftNames', () => {
    test('duplicate aircraft names — accept called with WF_DUPLICATE_AIRCRAFT', () => {
        const accept = mockAccept();
        const model = {
            aircraftTypes: [{ name: 'Hawk' }, { name: 'Hawk' }],
        } as unknown as Model;
        checkDuplicateAircraftNames(model, accept);
        expect(calledWithCode(accept, 'WF_DUPLICATE_AIRCRAFT')).toBe(true);
    });

    test('distinct aircraft names — accept not called', () => {
        const accept = mockAccept();
        const model = {
            aircraftTypes: [{ name: 'Hawk' }, { name: 'Eagle' }],
        } as unknown as Model;
        checkDuplicateAircraftNames(model, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// WF_DUPLICATE_BAY
// ---------------------------------------------------------------------------

describe('checkDuplicateBayNames', () => {
    test('duplicate bay names within hangar — accept called with WF_DUPLICATE_BAY', () => {
        const accept = mockAccept();
        const bay1 = { name: 'B1' };
        const bay2 = { name: 'B1' };
        const hangar = {
            name: 'Alpha',
            grid: { bays: [bay1, bay2] },
        } as unknown as Hangar;
        checkDuplicateBayNames(hangar, accept);
        expect(calledWithCode(accept, 'WF_DUPLICATE_BAY')).toBe(true);
    });

    test('distinct bay names — accept not called', () => {
        const accept = mockAccept();
        const hangar = {
            name: 'Alpha',
            grid: { bays: [{ name: 'B1' }, { name: 'B2' }] },
        } as unknown as Hangar;
        checkDuplicateBayNames(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// WF_DUPLICATE_HANGAR
// ---------------------------------------------------------------------------

describe('checkDuplicateHangarNames', () => {
    test('duplicate hangar names — accept called with WF_DUPLICATE_HANGAR', () => {
        const accept = mockAccept();
        const model = {
            hangars: [{ name: 'Alpha' }, { name: 'Alpha' }],
        } as unknown as Model;
        checkDuplicateHangarNames(model, accept);
        expect(calledWithCode(accept, 'WF_DUPLICATE_HANGAR')).toBe(true);
    });

    test('distinct hangar names — accept not called', () => {
        const accept = mockAccept();
        const model = {
            hangars: [{ name: 'Alpha' }, { name: 'Beta' }],
        } as unknown as Model;
        checkDuplicateHangarNames(model, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// WF_DUPLICATE_CLEARANCE
// ---------------------------------------------------------------------------

describe('checkDuplicateClearanceNames', () => {
    test('duplicate clearance names — accept called with WF_DUPLICATE_CLEARANCE', () => {
        const accept = mockAccept();
        const model = {
            clearanceEnvelopes: [{ name: 'WingTip' }, { name: 'WingTip' }],
        } as unknown as Model;
        checkDuplicateClearanceNames(model, accept);
        expect(calledWithCode(accept, 'WF_DUPLICATE_CLEARANCE')).toBe(true);
    });

    test('distinct clearance names — accept not called', () => {
        const accept = mockAccept();
        const model = {
            clearanceEnvelopes: [{ name: 'WingTip' }, { name: 'TailCone' }],
        } as unknown as Model;
        checkDuplicateClearanceNames(model, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SFR7_SELF_ADJACENCY
// ---------------------------------------------------------------------------

describe('checkSelfAdjacency', () => {
    test('bay lists itself as adjacent — accept called with SFR7_SELF_ADJACENCY', () => {
        const accept = mockAccept();
        const bay = { name: 'B1' } as unknown as HangarBay;
        (bay as any).adjacent = [{ ref: bay }];
        checkSelfAdjacency(bay, accept);
        expect(calledWithCode(accept, 'SFR7_SELF_ADJACENCY')).toBe(true);
    });

    test('bay lists only other bays — accept not called', () => {
        const accept = mockAccept();
        const bay1 = { name: 'B1' } as unknown as HangarBay;
        const bay2 = { name: 'B2' } as unknown as HangarBay;
        (bay1 as any).adjacent = [{ ref: bay2 }];
        checkSelfAdjacency(bay1, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SFR7_SELF_LOOP
// ---------------------------------------------------------------------------

describe('checkSelfLoopAccessLink', () => {
    test('link from node to itself — accept called with SFR7_SELF_LOOP', () => {
        const accept = mockAccept();
        const node = { name: 'Entry' };
        const link = {
            from: { ref: node },
            to: { ref: node },
        } as unknown as AccessLink;
        checkSelfLoopAccessLink(link, accept);
        expect(calledWithCode(accept, 'SFR7_SELF_LOOP')).toBe(true);
    });

    test('link between distinct nodes — accept not called', () => {
        const accept = mockAccept();
        const link = {
            from: { ref: { name: 'Entry' } },
            to: { ref: { name: 'Bay1Proxy' } },
        } as unknown as AccessLink;
        checkSelfLoopAccessLink(link, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// WF_NO_HANGARS
// ---------------------------------------------------------------------------

describe('checkAtLeastOneHangar', () => {
    test('model with no hangars — accept called with WF_NO_HANGARS', () => {
        const accept = mockAccept();
        const model = { hangars: [] } as unknown as Model;
        checkAtLeastOneHangar(model, accept);
        expect(calledWithCode(accept, 'WF_NO_HANGARS')).toBe(true);
    });

    test('model with at least one hangar — accept not called', () => {
        const accept = mockAccept();
        const model = { hangars: [{ name: 'Alpha' }] } as unknown as Model;
        checkAtLeastOneHangar(model, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});
