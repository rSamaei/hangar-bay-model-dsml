/**
 * Unit tests for dimension-checks.ts (SFR20 / SFR26 rules).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime.
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { AircraftType, HangarBay, HangarDoor, ClearanceEnvelope } from '../../src/generated/ast.js';
import {
    checkAircraftDimensions,
    checkBayDimensions,
    checkDoorDimensions,
    checkClearanceDimensions,
    checkUnreferencedClearanceEnvelope,
} from '../../src/validators/dimension-checks.js';

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

// ---------------------------------------------------------------------------
// checkAircraftDimensions — SFR20
// ---------------------------------------------------------------------------

describe('checkAircraftDimensions', () => {
    test('zero wingspan — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 0, length: 8.3, height: 2.7 } as unknown as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero length — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 11, length: 0, height: 2.7 } as unknown as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero height — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 11, length: 8.3, height: 0 } as unknown as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('negative wingspan — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: -1, length: 8.3, height: 2.7 } as unknown as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero tailHeight — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 11, length: 8.3, height: 2.7, tailHeight: 0 } as unknown as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('tailHeight undefined — no tailHeight error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 11, length: 8.3, height: 2.7, tailHeight: undefined } as unknown as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('positive tailHeight — no error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 11, length: 8.3, height: 2.7, tailHeight: 3.5 } as unknown as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('all valid dimensions — no error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 11, length: 8.3, height: 2.7 } as unknown as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkBayDimensions — SFR20
// ---------------------------------------------------------------------------

describe('checkBayDimensions', () => {
    test('zero width — SFR20 error', () => {
        const accept = mockAccept();
        const bay = { width: 0, depth: 15, height: 5 } as unknown as HangarBay;
        checkBayDimensions(bay, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero depth — SFR20 error', () => {
        const accept = mockAccept();
        const bay = { width: 12, depth: 0, height: 5 } as unknown as HangarBay;
        checkBayDimensions(bay, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero height — SFR20 error', () => {
        const accept = mockAccept();
        const bay = { width: 12, depth: 15, height: 0 } as unknown as HangarBay;
        checkBayDimensions(bay, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('all valid dimensions — no error', () => {
        const accept = mockAccept();
        const bay = { width: 12, depth: 15, height: 5 } as unknown as HangarBay;
        checkBayDimensions(bay, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkDoorDimensions — SFR20
// ---------------------------------------------------------------------------

describe('checkDoorDimensions', () => {
    test('zero width — SFR20 error', () => {
        const accept = mockAccept();
        const door = { width: 0, height: 5 } as unknown as HangarDoor;
        checkDoorDimensions(door, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero height — SFR20 error', () => {
        const accept = mockAccept();
        const door = { width: 15, height: 0 } as unknown as HangarDoor;
        checkDoorDimensions(door, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('positive dimensions — no error', () => {
        const accept = mockAccept();
        const door = { width: 15, height: 5 } as unknown as HangarDoor;
        checkDoorDimensions(door, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkClearanceDimensions — SFR20
// ---------------------------------------------------------------------------

describe('checkClearanceDimensions', () => {
    test('negative lateralMargin — SFR20 error', () => {
        const accept = mockAccept();
        const cl = { lateralMargin: -0.5, longitudinalMargin: 0, verticalMargin: 0 } as unknown as ClearanceEnvelope;
        checkClearanceDimensions(cl, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('negative longitudinalMargin — SFR20 error', () => {
        const accept = mockAccept();
        const cl = { lateralMargin: 0, longitudinalMargin: -0.5, verticalMargin: 0 } as unknown as ClearanceEnvelope;
        checkClearanceDimensions(cl, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('negative verticalMargin — SFR20 error', () => {
        const accept = mockAccept();
        const cl = { lateralMargin: 0, longitudinalMargin: 0, verticalMargin: -0.5 } as unknown as ClearanceEnvelope;
        checkClearanceDimensions(cl, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('all margins zero — no error', () => {
        const accept = mockAccept();
        const cl = { lateralMargin: 0, longitudinalMargin: 0, verticalMargin: 0 } as unknown as ClearanceEnvelope;
        checkClearanceDimensions(cl, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('all margins positive — no error', () => {
        const accept = mockAccept();
        const cl = { lateralMargin: 1, longitudinalMargin: 2, verticalMargin: 0.5 } as unknown as ClearanceEnvelope;
        checkClearanceDimensions(cl, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkUnreferencedClearanceEnvelope — SFR26
// ---------------------------------------------------------------------------

describe('checkUnreferencedClearanceEnvelope', () => {
    function mkClearance(name: string): ClearanceEnvelope {
        return { name, $type: 'ClearanceEnvelope' } as unknown as ClearanceEnvelope;
    }

    test('no container — silent return (not covered by other checks)', () => {
        const accept = mockAccept();
        const cl = mkClearance('Orphan');
        // No $container: AstUtils.getContainerOfType returns undefined → early return
        checkUnreferencedClearanceEnvelope(cl, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('unused clearance envelope — SFR26 warning', () => {
        const accept = mockAccept();
        const cl = mkClearance('Unused');
        const model = {
            $type: 'Model',
            aircraftTypes: [],
            inductions: [],
            autoInductions: [],
        };
        (cl as any).$container = model;
        checkUnreferencedClearanceEnvelope(cl, accept);
        expect(calledWithCode(accept, 'SFR26_UNREFERENCED_CLEARANCE')).toBe(true);
    });

    test('clearance referenced by aircraft — no warning', () => {
        const accept = mockAccept();
        const cl = mkClearance('WingTip');
        const model = {
            $type: 'Model',
            aircraftTypes: [{ clearance: { ref: cl } }],
            inductions: [],
            autoInductions: [],
        };
        (cl as any).$container = model;
        checkUnreferencedClearanceEnvelope(cl, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('clearance referenced by induction — no warning', () => {
        const accept = mockAccept();
        const cl = mkClearance('WingTip');
        const model = {
            $type: 'Model',
            aircraftTypes: [],
            inductions: [{ clearance: { ref: cl } }],
            autoInductions: [],
        };
        (cl as any).$container = model;
        checkUnreferencedClearanceEnvelope(cl, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('clearance referenced by auto-induction — no warning', () => {
        const accept = mockAccept();
        const cl = mkClearance('WingTip');
        const model = {
            $type: 'Model',
            aircraftTypes: [],
            inductions: [],
            autoInductions: [{ clearance: { ref: cl } }],
        };
        (cl as any).$container = model;
        checkUnreferencedClearanceEnvelope(cl, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});
