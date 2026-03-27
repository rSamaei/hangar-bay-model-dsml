/**
 * Shared structural mock helpers for simulator tests.
 *
 * Each helper creates a plain object that satisfies the Langium AST interface
 * structurally (no Langium runtime required). All dimension/property arguments
 * have sensible defaults so tests only need to specify values relevant to the
 * scenario under test.
 */

// ---------------------------------------------------------------------------
// Langium reference wrapper
// ---------------------------------------------------------------------------

/** Minimal Langium-like Reference wrapper. */
export function ref<T>(val: T | undefined) {
    return { ref: val, $refText: (val as any)?.name ?? '' };
}

// ---------------------------------------------------------------------------
// Domain object mocks
// ---------------------------------------------------------------------------

export function mkAircraft(
    name: string,
    wingspan = 11,
    length = 8,
    height = 3,
    tailHeight?: number
) {
    return {
        name,
        wingspan,
        length,
        height,
        tailHeight: tailHeight ?? height,
        $type: 'AircraftType'
    };
}

export function mkDoor(name: string, width = 15, height = 5) {
    return { name, width, height, accessNode: undefined, $type: 'HangarDoor' };
}

export function mkBay(
    name: string,
    width = 12,
    depth = 10,
    height = 5,
    row?: number,
    col?: number,
    adjacent: any[] = []
) {
    return {
        name,
        width,
        depth,
        height,
        row,
        col,
        adjacent,
        accessNode: undefined,
        $type: 'HangarBay'
    };
}

export function mkHangar(
    name: string,
    doors: any[] = [],
    bays: any[] = [],
    rows?: number,
    cols?: number
) {
    return { name, doors, grid: { bays, rows, cols }, $type: 'Hangar' };
}

export function mkClearance(
    name: string,
    lateralMargin = 0,
    longitudinalMargin = 0,
    verticalMargin = 0
) {
    return {
        name,
        lateralMargin,
        longitudinalMargin,
        verticalMargin,
        $type: 'ClearanceEnvelope'
    };
}

// ---------------------------------------------------------------------------
// Induction mocks
// ---------------------------------------------------------------------------

export function mkManualInduction(
    id: string | undefined,
    aircraft: any,
    hangar: any,
    bays: any[],
    door: any,
    start: string,
    end: string
) {
    return {
        id,
        aircraft: ref(aircraft),
        hangar: ref(hangar),
        bays: bays.map((b: any) => ref(b)),
        door: door ? ref(door) : undefined,
        start,
        end,
        clearance: undefined,
        $type: 'Induction'
    };
}

export function mkAutoInduction(
    id: string | undefined,
    aircraft: any,
    hangar: any | undefined,
    duration: number,
    options: {
        notBefore?: string;
        notAfter?: string;
        precedingInductions?: any[];
        requires?: number;
    } = {}
) {
    return {
        id,
        aircraft: ref(aircraft),
        preferredHangar: hangar ? ref(hangar) : undefined,
        duration,
        requires: options.requires,
        notBefore: options.notBefore,
        notAfter: options.notAfter,
        precedingInductions: (options.precedingInductions ?? []).map((a: any) => ref(a)),
        clearance: undefined,
        $type: 'AutoInduction'
    };
}

// ---------------------------------------------------------------------------
// Model mock
// ---------------------------------------------------------------------------

export function mkModel(
    hangars: any[] = [],
    inductions: any[] = [],
    autoInductions: any[] = [],
    accessPaths: any[] = []
) {
    return {
        name: 'TestAirfield',
        hangars,
        inductions,
        autoInductions,
        accessPaths,
        $type: 'Model'
    };
}

// ---------------------------------------------------------------------------
// Access path mocks (used by PlacementEngine and corridor-fit tests)
// ---------------------------------------------------------------------------

export function mkAccessNode(
    name: string,
    width?: number,
    height?: number
) {
    return { name, width, height, $type: 'AccessNode' as const };
}

export function mkAccessLink(
    fromNode: any,
    toNode: any,
    bidirectional = false
) {
    return {
        from: ref(fromNode),
        to: ref(toNode),
        bidirectional,
        $type: 'AccessLink' as const,
    };
}

export function mkAccessPath(
    name: string,
    nodes: ReturnType<typeof mkAccessNode>[] = [],
    links: ReturnType<typeof mkAccessLink>[] = []
) {
    return { name, nodes, links, $type: 'AccessPath' as const };
}

// ---------------------------------------------------------------------------
// SimulationState builder (used by PlacementEngine and event-handler tests)
// ---------------------------------------------------------------------------

import type { SimulationState } from '../../src/simulation/types.js';

/**
 * Builds a minimal `SimulationState` for use in simulation unit tests.
 * All collections are empty and `currentTime` defaults to epoch ms for
 * 2024-06-01T08:00:00Z. Pass `overrides` to customise any field.
 */
export function mkPlacementEngineState(
    overrides: Partial<SimulationState> = {}
): SimulationState {
    return {
        currentTime: Date.parse('2024-06-01T08:00:00Z'),
        occupiedBays: new Map(),
        waitingQueue: [],
        pendingDepartures: [],
        activeInductions: [],
        completedInductions: [],
        fixedOccupancy: [],
        eventLog: [],
        ...overrides,
    };
}
