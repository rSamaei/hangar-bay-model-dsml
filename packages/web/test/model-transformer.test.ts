/**
 * Unit tests for backend/services/model-transformer.ts
 *
 * transformToDomainModel() maps a Langium AST (LangiumModel) to a plain
 * DomainModel object.  Because all access is through plain object properties
 * we can use structural mocks — no Langium runtime is needed.
 *
 * Covers:
 *   - Airfield name propagated
 *   - Aircraft fields: name, wingspan, length, height, tailHeight, clearance ref
 *   - Aircraft with no clearance → clearance is undefined
 *   - Clearance envelope mapped correctly
 *   - Hangar doors mapped correctly
 *   - Hangar bays: dimensions, row/col, adjacent refs, accessNode
 *   - Manual induction: id, aircraft, hangar, bays, door, start, end, metadata
 *   - Induction with no id → auto-generated id
 *   - Auto-induction: id, aircraft, duration, preferredHangar, precedingInductions
 */
import { describe, expect, test } from 'vitest';
import { transformToDomainModel } from '../backend/services/model-transformer.js';

// ---------------------------------------------------------------------------
// Minimal AST mock helpers (no Langium runtime required)
// ---------------------------------------------------------------------------

function mkRef<T extends { name: string }>(node: T) {
    return { ref: node, $refText: node.name };
}

function mkAircraftType(name: string, wingspan: number, length: number, height: number,
    tailHeight?: number, clearanceNode?: { name: string }) {
    return {
        name, wingspan, length, height,
        tailHeight,
        clearance: clearanceNode ? mkRef(clearanceNode) : undefined,
        $type: 'AircraftType' as const
    };
}

function mkClearance(name: string, lateral: number, longitudinal: number, vertical: number) {
    return { name, lateralMargin: lateral, longitudinalMargin: longitudinal, verticalMargin: vertical };
}

function mkDoor(name: string, width: number, height: number, accessNode?: { name: string }) {
    return { name, width, height, accessNode: accessNode ? mkRef(accessNode) : undefined };
}

function mkBay(name: string, width: number, depth: number, height: number,
    row?: number, col?: number, adjacent?: { name: string }[], accessNode?: { name: string }) {
    return {
        name, width, depth, height, row, col,
        adjacent: (adjacent ?? []).map(mkRef),
        accessNode: accessNode ? mkRef(accessNode) : undefined,
        $type: 'HangarBay' as const
    };
}

function mkHangar(name: string, doors: any[], bays: any[], rows?: number, cols?: number) {
    return { name, doors, grid: { bays, rows, cols }, $type: 'Hangar' as const };
}

function mkInduction(id: string | undefined, aircraft: any, hangar: any, bays: any[],
    door: any, start: string, end: string, tags?: Record<string, string>) {
    return {
        id,
        aircraft: mkRef(aircraft),
        hangar: mkRef(hangar),
        bays: bays.map(mkRef),
        door: door ? mkRef(door) : undefined,
        start, end,
        metadata: tags
            ? { tags: Object.entries(tags).map(([key, value]) => ({ key, value })) }
            : undefined,
        $type: 'Induction' as const
    };
}

function mkAutoInduction(id: string | undefined, aircraft: any, preferredHangar: any | undefined,
    duration: number, opts: { notBefore?: string; notAfter?: string; precedingIds?: string[] } = {}) {
    return {
        id,
        aircraft: mkRef(aircraft),
        preferredHangar: preferredHangar ? mkRef(preferredHangar) : undefined,
        duration,
        notBefore: opts.notBefore,
        notAfter: opts.notAfter,
        precedingInductions: (opts.precedingIds ?? []).map(pid => mkRef({ name: pid, id: pid })),
        metadata: undefined,
        $type: 'AutoInduction' as const
    };
}

function mkModel(overrides: Partial<{
    name: string;
    clearanceEnvelopes: any[];
    aircraftTypes: any[];
    accessPaths: any[];
    hangars: any[];
    inductions: any[];
    autoInductions: any[];
}>): any {
    return {
        name: 'TestField',
        clearanceEnvelopes: [],
        aircraftTypes: [],
        accessPaths: [],
        hangars: [],
        inductions: [],
        autoInductions: [],
        ...overrides
    };
}

// ---------------------------------------------------------------------------
// Standard fixtures
// ---------------------------------------------------------------------------

const STD_CLEARANCE = mkClearance('StdClear', 1.5, 2.0, 0.5);
const CESSNA = mkAircraftType('Cessna', 11, 8.3, 2.7, 2.7);
const CESSNA_WITH_CLEAR = mkAircraftType('Cessna', 11, 8.3, 2.7, 2.7, STD_CLEARANCE);
const MAIN_DOOR = mkDoor('MainDoor', 15, 5);
const BAY1 = mkBay('Bay1', 12, 10, 5, 0, 0);
const ALPHA_HANGAR = mkHangar('Alpha', [MAIN_DOOR], [BAY1], 1, 1);

// ---------------------------------------------------------------------------
// Tests: top-level airfield
// ---------------------------------------------------------------------------

describe('transformToDomainModel — airfield name', () => {
    test('airfield name is propagated', () => {
        const result = transformToDomainModel(mkModel({ name: 'RAF_Base' }));
        expect(result.airfield.name).toBe('RAF_Base');
    });

    test('missing name falls back to "Unnamed Airfield"', () => {
        const result = transformToDomainModel(mkModel({ name: undefined as any }));
        expect(result.airfield.name).toBe('Unnamed Airfield');
    });
});

// ---------------------------------------------------------------------------
// Tests: aircraft
// ---------------------------------------------------------------------------

describe('transformToDomainModel — aircraft', () => {
    test('maps all numeric dimensions correctly', () => {
        const result = transformToDomainModel(mkModel({ aircraftTypes: [CESSNA] }));
        const ac = result.aircraft[0];
        expect(ac.name).toBe('Cessna');
        expect(ac.wingspan).toBe(11);
        expect(ac.length).toBe(8.3);
        expect(ac.height).toBe(2.7);
        expect(ac.tailHeight).toBe(2.7);
    });

    test('aircraft with clearance ref maps clearance name', () => {
        const result = transformToDomainModel(mkModel({ aircraftTypes: [CESSNA_WITH_CLEAR] }));
        expect(result.aircraft[0].clearance).toBe('StdClear');
    });

    test('aircraft without clearance has undefined clearance', () => {
        const result = transformToDomainModel(mkModel({ aircraftTypes: [CESSNA] }));
        expect(result.aircraft[0].clearance).toBeUndefined();
    });

    test('tailHeight falls back to height when not set', () => {
        const noTail = mkAircraftType('NoTail', 10, 8, 3, undefined);
        const result = transformToDomainModel(mkModel({ aircraftTypes: [noTail] }));
        expect(result.aircraft[0].tailHeight).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// Tests: clearance envelopes
// ---------------------------------------------------------------------------

describe('transformToDomainModel — clearance envelopes', () => {
    test('clearance envelope margins mapped correctly', () => {
        const result = transformToDomainModel(mkModel({ clearanceEnvelopes: [STD_CLEARANCE] }));
        const c = result.clearances[0];
        expect(c.name).toBe('StdClear');
        expect(c.lateralMargin).toBe(1.5);
        expect(c.longitudinalMargin).toBe(2.0);
        expect(c.verticalMargin).toBe(0.5);
    });
});

// ---------------------------------------------------------------------------
// Tests: hangars / doors / bays
// ---------------------------------------------------------------------------

describe('transformToDomainModel — hangars', () => {
    test('door dimensions mapped correctly', () => {
        const result = transformToDomainModel(mkModel({ hangars: [ALPHA_HANGAR] }));
        const door = result.hangars[0].doors[0];
        expect(door.name).toBe('MainDoor');
        expect(door.width).toBe(15);
        expect(door.height).toBe(5);
    });

    test('bay dimensions and grid coords mapped correctly', () => {
        const result = transformToDomainModel(mkModel({ hangars: [ALPHA_HANGAR] }));
        const bay = result.hangars[0].bays[0];
        expect(bay.name).toBe('Bay1');
        expect(bay.width).toBe(12);
        expect(bay.depth).toBe(10);
        expect(bay.height).toBe(5);
        expect(bay.row).toBe(0);
        expect(bay.col).toBe(0);
    });

    test('bay adjacent refs resolved to names', () => {
        const bay2 = mkBay('Bay2', 12, 10, 5, 0, 1);
        const bay1adj = mkBay('Bay1', 12, 10, 5, 0, 0, [{ name: 'Bay2' }]);
        const hangar = mkHangar('H', [MAIN_DOOR], [bay1adj, bay2]);
        const result = transformToDomainModel(mkModel({ hangars: [hangar] }));
        expect(result.hangars[0].bays[0].adjacent).toContain('Bay2');
    });
});

// ---------------------------------------------------------------------------
// Tests: manual inductions
// ---------------------------------------------------------------------------

describe('transformToDomainModel — inductions', () => {
    test('explicit induction id is preserved', () => {
        const ind = mkInduction('IND-001', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const result = transformToDomainModel(mkModel({ inductions: [ind] }));
        expect(result.inductions[0].id).toBe('IND-001');
    });

    test('induction without id gets an auto-generated id', () => {
        const ind = mkInduction(undefined, CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const result = transformToDomainModel(mkModel({ inductions: [ind] }));
        expect(typeof result.inductions[0].id).toBe('string');
        expect(result.inductions[0].id.length).toBeGreaterThan(0);
    });

    test('aircraft, hangar and bay names resolved correctly', () => {
        const ind = mkInduction('I1', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const result = transformToDomainModel(mkModel({ inductions: [ind] }));
        const i = result.inductions[0];
        expect(i.aircraft).toBe('Cessna');
        expect(i.hangar).toBe('Alpha');
        expect(i.bays).toContain('Bay1');
    });

    test('time window fields start and end are preserved', () => {
        const ind = mkInduction('I1', CESSNA, ALPHA_HANGAR, [BAY1], MAIN_DOOR,
            '2024-06-01T08:00', '2024-06-01T10:00');
        const result = transformToDomainModel(mkModel({ inductions: [ind] }));
        expect(result.inductions[0].start).toBe('2024-06-01T08:00');
        expect(result.inductions[0].end).toBe('2024-06-01T10:00');
    });
});

// ---------------------------------------------------------------------------
// Tests: auto-inductions
// ---------------------------------------------------------------------------

describe('transformToDomainModel — auto-inductions', () => {
    test('explicit auto-induction id is preserved', () => {
        const ai = mkAutoInduction('AUTO-1', CESSNA, ALPHA_HANGAR, 60);
        const result = transformToDomainModel(mkModel({ autoInductions: [ai] }));
        expect(result.autoInductions[0].id).toBe('AUTO-1');
    });

    test('duration and preferredHangar mapped correctly', () => {
        const ai = mkAutoInduction('A1', CESSNA, ALPHA_HANGAR, 120);
        const result = transformToDomainModel(mkModel({ autoInductions: [ai] }));
        const a = result.autoInductions[0];
        expect(a.duration).toBe(120);
        expect(a.preferredHangar).toBe('Alpha');
    });
});
