/**
 * Unit tests for well-formedness-checks.ts
 * (WF_DUPLICATE_AIRCRAFT, WF_DUPLICATE_BAY, WF_DUPLICATE_HANGAR,
 *  WF_DUPLICATE_CLEARANCE, SFR7_SELF_ADJACENCY, SFR7_SELF_LOOP, WF_NO_HANGARS).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime.
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
    return calls.some(args => typeof args[1] === 'string' && (args[1] as string).includes(code));
}

function mkModel(opts: {
    aircraftTypes?: Array<{ name: string }>;
    hangars?: Array<{ name: string }>;
    clearanceEnvelopes?: Array<{ name: string }>;
}): Model {
    return {
        $type: 'Model',
        aircraftTypes:      opts.aircraftTypes ?? [],
        hangars:            opts.hangars ?? [],
        clearanceEnvelopes: opts.clearanceEnvelopes ?? [],
        inductions:         [],
        autoInductions:     [],
    } as unknown as Model;
}

function mkHangar(name: string, bays: Array<{ name: string }>): Hangar {
    return {
        name,
        grid: { bays },
        doors: [],
    } as unknown as Hangar;
}

// ===========================================================================
// checkDuplicateAircraftNames
// ===========================================================================

describe('checkDuplicateAircraftNames', () => {
    test('no duplicates — no error', () => {
        const accept = mockAccept();
        const model = mkModel({ aircraftTypes: [{ name: 'Hawk' }, { name: 'Eagle' }] });
        checkDuplicateAircraftNames(model, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('duplicate aircraft name — WF_DUPLICATE_AIRCRAFT error on second', () => {
        const accept = mockAccept();
        const model = mkModel({ aircraftTypes: [{ name: 'Hawk' }, { name: 'Hawk' }] });
        checkDuplicateAircraftNames(model, accept);
        expect(calledWithCode(accept, 'WF_DUPLICATE_AIRCRAFT')).toBe(true);
    });

    test('three aircraft, two share a name — one error only', () => {
        const accept = mockAccept();
        const model = mkModel({ aircraftTypes: [{ name: 'A' }, { name: 'B' }, { name: 'A' }] });
        checkDuplicateAircraftNames(model, accept);
        const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
        expect(calls.length).toBe(1);
    });
});

// ===========================================================================
// checkDuplicateBayNames
// ===========================================================================

describe('checkDuplicateBayNames', () => {
    test('no duplicate bay names — no error', () => {
        const accept = mockAccept();
        const hangar = mkHangar('H', [{ name: 'Bay1' }, { name: 'Bay2' }]);
        checkDuplicateBayNames(hangar, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('duplicate bay name — WF_DUPLICATE_BAY error', () => {
        const accept = mockAccept();
        const hangar = mkHangar('H', [{ name: 'Bay1' }, { name: 'Bay1' }]);
        checkDuplicateBayNames(hangar, accept);
        expect(calledWithCode(accept, 'WF_DUPLICATE_BAY')).toBe(true);
    });

    test('three bays, two share a name — error message contains hangar name', () => {
        const accept = mockAccept();
        const hangar = mkHangar('Alpha', [{ name: 'X' }, { name: 'Y' }, { name: 'X' }]);
        checkDuplicateBayNames(hangar, accept);
        const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
        expect(calls.some(args => typeof args[1] === 'string' && args[1].includes('Alpha'))).toBe(true);
    });
});

// ===========================================================================
// checkDuplicateHangarNames
// ===========================================================================

describe('checkDuplicateHangarNames', () => {
    test('no duplicate hangar names — no error', () => {
        const accept = mockAccept();
        const model = mkModel({ hangars: [{ name: 'Alpha' }, { name: 'Beta' }] });
        checkDuplicateHangarNames(model, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('duplicate hangar name — WF_DUPLICATE_HANGAR error', () => {
        const accept = mockAccept();
        const model = mkModel({ hangars: [{ name: 'Alpha' }, { name: 'Alpha' }] });
        checkDuplicateHangarNames(model, accept);
        expect(calledWithCode(accept, 'WF_DUPLICATE_HANGAR')).toBe(true);
    });
});

// ===========================================================================
// checkDuplicateClearanceNames
// ===========================================================================

describe('checkDuplicateClearanceNames', () => {
    test('no duplicate clearance names — no error', () => {
        const accept = mockAccept();
        const model = mkModel({ clearanceEnvelopes: [{ name: 'WingTip' }, { name: 'TailCone' }] });
        checkDuplicateClearanceNames(model, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('duplicate clearance name — WF_DUPLICATE_CLEARANCE error', () => {
        const accept = mockAccept();
        const model = mkModel({ clearanceEnvelopes: [{ name: 'WingTip' }, { name: 'WingTip' }] });
        checkDuplicateClearanceNames(model, accept);
        expect(calledWithCode(accept, 'WF_DUPLICATE_CLEARANCE')).toBe(true);
    });
});

// ===========================================================================
// checkSelfAdjacency — SFR7_SELF_ADJACENCY
// ===========================================================================

describe('checkSelfAdjacency', () => {
    test('bay with no adjacent refs — no warning', () => {
        const accept = mockAccept();
        const bay = { name: 'B1', adjacent: [] } as unknown as HangarBay;
        checkSelfAdjacency(bay, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('bay lists a different bay as adjacent — no warning', () => {
        const accept = mockAccept();
        const bay1 = { name: 'B1', adjacent: [] } as unknown as HangarBay;
        const bay2 = { name: 'B2', adjacent: [{ ref: bay1 }] } as unknown as HangarBay;
        checkSelfAdjacency(bay2, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('bay lists itself as adjacent — SFR7_SELF_ADJACENCY warning', () => {
        const accept = mockAccept();
        const bay = { name: 'B1' } as unknown as HangarBay;
        (bay as any).adjacent = [{ ref: bay }];
        checkSelfAdjacency(bay, accept);
        expect(calledWithCode(accept, 'SFR7_SELF_ADJACENCY')).toBe(true);
    });

    test('bay lists self plus another — one warning (for self entry)', () => {
        const accept = mockAccept();
        const bay1 = { name: 'B1' } as unknown as HangarBay;
        const bay2 = { name: 'B2' } as unknown as HangarBay;
        (bay1 as any).adjacent = [{ ref: bay2 }, { ref: bay1 }];
        checkSelfAdjacency(bay1, accept);
        const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
        expect(calls.length).toBe(1);
        expect(calledWithCode(accept, 'SFR7_SELF_ADJACENCY')).toBe(true);
    });
});

// ===========================================================================
// checkSelfLoopAccessLink — SFR7_SELF_LOOP
// ===========================================================================

describe('checkSelfLoopAccessLink', () => {
    test('link between distinct nodes — no warning', () => {
        const accept = mockAccept();
        const nodeA = { name: 'A' };
        const nodeB = { name: 'B' };
        const link = { from: { ref: nodeA }, to: { ref: nodeB } } as unknown as AccessLink;
        checkSelfLoopAccessLink(link, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('link from a node to itself — SFR7_SELF_LOOP warning', () => {
        const accept = mockAccept();
        const nodeA = { name: 'A' };
        const link = { from: { ref: nodeA }, to: { ref: nodeA } } as unknown as AccessLink;
        checkSelfLoopAccessLink(link, accept);
        expect(calledWithCode(accept, 'SFR7_SELF_LOOP')).toBe(true);
    });

    test('from ref undefined — no warning', () => {
        const accept = mockAccept();
        const nodeA = { name: 'A' };
        const link = { from: { ref: undefined }, to: { ref: nodeA } } as unknown as AccessLink;
        checkSelfLoopAccessLink(link, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('to ref undefined — no warning', () => {
        const accept = mockAccept();
        const nodeA = { name: 'A' };
        const link = { from: { ref: nodeA }, to: { ref: undefined } } as unknown as AccessLink;
        checkSelfLoopAccessLink(link, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('both refs undefined — no warning', () => {
        const accept = mockAccept();
        const link = { from: { ref: undefined }, to: { ref: undefined } } as unknown as AccessLink;
        checkSelfLoopAccessLink(link, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ===========================================================================
// checkAtLeastOneHangar — WF_NO_HANGARS
// ===========================================================================

describe('checkAtLeastOneHangar', () => {
    test('model with no hangars — WF_NO_HANGARS warning', () => {
        const accept = mockAccept();
        const model = mkModel({ hangars: [] });
        checkAtLeastOneHangar(model, accept);
        expect(calledWithCode(accept, 'WF_NO_HANGARS')).toBe(true);
    });

    test('model with at least one hangar — no warning', () => {
        const accept = mockAccept();
        const model = mkModel({ hangars: [{ name: 'Alpha' }] });
        checkAtLeastOneHangar(model, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});
