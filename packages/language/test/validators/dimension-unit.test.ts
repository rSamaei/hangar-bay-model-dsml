/**
 * Unit tests for dimension-checks.ts (SFR20 + SFR26 rules).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime.
 */
import { describe, expect, test, vi } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { AircraftType, HangarBay, HangarDoor, ClearanceEnvelope, Model } from '../../src/generated/ast.js';
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
    return calls.some(args => typeof args[1] === 'string' && args[1].includes(code));
}

// ---------------------------------------------------------------------------
// SFR20 — Aircraft dimensions
// ---------------------------------------------------------------------------

describe('checkAircraftDimensions', () => {
    test('zero wingspan — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 0, length: 10, height: 5 } as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero length — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 10, length: 0, height: 5 } as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero height — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 10, length: 10, height: 0 } as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('negative tailHeight — SFR20 error', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 10, length: 10, height: 5, tailHeight: -1 } as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('all valid positive values — accept not called', () => {
        const accept = mockAccept();
        const aircraft = { wingspan: 11, length: 8, height: 3 } as AircraftType;
        checkAircraftDimensions(aircraft, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SFR20 — Bay dimensions
// ---------------------------------------------------------------------------

describe('checkBayDimensions', () => {
    test('zero width — SFR20 error', () => {
        const accept = mockAccept();
        const bay = { width: 0, depth: 10, height: 5 } as HangarBay;
        checkBayDimensions(bay, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero depth — SFR20 error', () => {
        const accept = mockAccept();
        const bay = { width: 12, depth: 0, height: 5 } as HangarBay;
        checkBayDimensions(bay, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero height — SFR20 error', () => {
        const accept = mockAccept();
        const bay = { width: 12, depth: 15, height: 0 } as HangarBay;
        checkBayDimensions(bay, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// SFR20 — Door dimensions
// ---------------------------------------------------------------------------

describe('checkDoorDimensions', () => {
    test('zero width — SFR20 error', () => {
        const accept = mockAccept();
        const door = { width: 0, height: 5 } as HangarDoor;
        checkDoorDimensions(door, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('zero height — SFR20 error', () => {
        const accept = mockAccept();
        const door = { width: 10, height: 0 } as HangarDoor;
        checkDoorDimensions(door, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// SFR20 — Clearance dimensions
// ---------------------------------------------------------------------------

describe('checkClearanceDimensions', () => {
    test('negative lateralMargin — SFR20 error', () => {
        const accept = mockAccept();
        const c = { lateralMargin: -1, longitudinalMargin: 0, verticalMargin: 0 } as ClearanceEnvelope;
        checkClearanceDimensions(c, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('negative longitudinalMargin — SFR20 error', () => {
        const accept = mockAccept();
        const c = { lateralMargin: 0, longitudinalMargin: -1, verticalMargin: 0 } as ClearanceEnvelope;
        checkClearanceDimensions(c, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('negative verticalMargin — SFR20 error', () => {
        const accept = mockAccept();
        const c = { lateralMargin: 0, longitudinalMargin: 0, verticalMargin: -1 } as ClearanceEnvelope;
        checkClearanceDimensions(c, accept);
        expect(calledWithCode(accept, 'SFR20_DIMENSIONS')).toBe(true);
    });

    test('all zero margins (valid) — accept not called', () => {
        const accept = mockAccept();
        const c = { lateralMargin: 0, longitudinalMargin: 0, verticalMargin: 0 } as ClearanceEnvelope;
        checkClearanceDimensions(c, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SFR26 — Unreferenced clearance envelope
// ---------------------------------------------------------------------------

function mkModel(clearance: ClearanceEnvelope, aircraftClearanceRef?: ClearanceEnvelope): Model {
    return {
        $type: 'Model',
        aircraftTypes: aircraftClearanceRef
            ? [{ clearance: { ref: aircraftClearanceRef } }]
            : [],
        inductions: [],
        autoInductions: [],
    } as unknown as Model;
}

describe('checkUnreferencedClearanceEnvelope', () => {
    test('clearance not referenced by any aircraft — SFR26 warning', () => {
        const accept = mockAccept();
        const clearance = { name: 'WingTip' } as ClearanceEnvelope;
        const model = mkModel(clearance);
        (clearance as any).$container = model;
        checkUnreferencedClearanceEnvelope(clearance, accept);
        expect(calledWithCode(accept, 'SFR26_UNREFERENCED_CLEARANCE')).toBe(true);
    });

    test('clearance referenced by an aircraft — accept not called', () => {
        const accept = mockAccept();
        const clearance = { name: 'WingTip' } as ClearanceEnvelope;
        const model = mkModel(clearance, clearance);
        (clearance as any).$container = model;
        checkUnreferencedClearanceEnvelope(clearance, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});
