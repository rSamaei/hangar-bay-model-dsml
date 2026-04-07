/**
 * Unit tests for reachability-checks.ts (L7).
 *
 * Imports directly from the TypeScript source for v8 coverage.
 * Uses structural mocks for AST types and vi.mock for access-graph so the
 * three thin-wrapper validators can be exercised without a Langium runtime.
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { ValidationAcceptor } from 'langium';
import type { Induction, Hangar, HangarBay, HangarDoor, AircraftType, ClearanceEnvelope } from '../../src/generated/ast.js';
import type { AccessGraph, ReachabilityResult } from '../../src/access-graph.js';
import {
    checkBayReachability,
    checkDynamicBayBlockingReachability,
    checkCorridorFitReachability,
} from '../../src/validators/reachability-checks.js';

// ---------------------------------------------------------------------------
// Mock access-graph module — all functions replaced with vi.fn()
// ---------------------------------------------------------------------------
vi.mock('../../src/access-graph.js', () => ({
    buildAccessGraph:             vi.fn(),
    reachableNodes:               vi.fn(),
    checkDynamicBayReachability:  vi.fn(),
    checkCorridorFit:             vi.fn(),
}));

// Import mocked functions *after* vi.mock so they are the mock instances
import {
    buildAccessGraph,
    reachableNodes,
    checkDynamicBayReachability,
    checkCorridorFit,
} from '../../src/access-graph.js';

const mockBuildAccessGraph      = buildAccessGraph             as ReturnType<typeof vi.fn>;
const mockReachableNodes        = reachableNodes               as ReturnType<typeof vi.fn>;
const mockCheckDynamicReach     = checkDynamicBayReachability  as ReturnType<typeof vi.fn>;
const mockCheckCorridorFit      = checkCorridorFit             as ReturnType<typeof vi.fn>;

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

function mkDoor(name: string, accessNodeName?: string): HangarDoor {
    return {
        name,
        accessNode: accessNodeName ? { ref: { name: accessNodeName } } : undefined,
    } as unknown as HangarDoor;
}

function mkBay(name: string, accessNodeName?: string): HangarBay {
    return {
        name,
        accessNode: accessNodeName ? { ref: { name: accessNodeName } } : undefined,
    } as unknown as HangarBay;
}

function mkHangar(name: string): Hangar {
    return { name, grid: { bays: [], rows: undefined, cols: undefined }, doors: [] } as unknown as Hangar;
}

function mkAircraft(name: string, wingspan: number): AircraftType {
    return { name, wingspan } as unknown as AircraftType;
}

/** Build an Induction with a proper $container → Model chain so AstUtils works. */
function mkInduction(opts: {
    door?: HangarDoor;
    hangar?: Hangar;
    bays?: HangarBay[];
    aircraft?: AircraftType;
    clearance?: ClearanceEnvelope;
}): Induction {
    const ind = {
        $type: 'Induction',
        door:      opts.door     ? { ref: opts.door }     : undefined,
        hangar:    opts.hangar   ? { ref: opts.hangar }   : undefined,
        bays:      (opts.bays ?? []).map(b => ({ ref: b })),
        aircraft:  opts.aircraft ? { ref: opts.aircraft } : undefined,
        clearance: opts.clearance ? { ref: opts.clearance } : undefined,
    } as unknown as Induction;

    const model = {
        $type: 'Model',
        inductions:    [ind],
        autoInductions: [],
        aircraftTypes:  [],
        accessPaths:    [],
    };
    (ind as any).$container = model;
    return ind;
}

/** A minimal AccessGraph with a single named node, for use in test mocks. */
function mkGraph(nodeNames: string[]): AccessGraph {
    const nodes = new Map<string, { id: string }>();
    for (const n of nodeNames) nodes.set(n, { id: n });
    return { nodes, edges: [] } as unknown as AccessGraph;
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// checkBayReachability — SFR19_REACHABILITY
// ---------------------------------------------------------------------------
describe('checkBayReachability', () => {
    test('no door ref → silent return', () => {
        const accept = mockAccept();
        const ind = mkInduction({ hangar: mkHangar('H'), bays: [mkBay('Bay1', 'N1')] });
        checkBayReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
        expect(mockBuildAccessGraph).not.toHaveBeenCalled();
    });

    test('door has no accessNode → silent return', () => {
        const accept = mockAccept();
        const door = mkDoor('D1');   // no accessNodeName
        const ind = mkInduction({ door, hangar: mkHangar('H'), bays: [mkBay('Bay1', 'N1')] });
        checkBayReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('buildAccessGraph returns null → silent return (not modelled)', () => {
        const accept = mockAccept();
        mockBuildAccessGraph.mockReturnValue(null);
        const door = mkDoor('D1', 'DN1');
        const ind = mkInduction({ door, hangar: mkHangar('H'), bays: [mkBay('Bay1', 'N1')] });
        checkBayReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('door node not in graph → silent return', () => {
        const accept = mockAccept();
        // Graph has 'OTHER', not 'DN1'
        mockBuildAccessGraph.mockReturnValue(mkGraph(['OTHER']));
        const door = mkDoor('D1', 'DN1');
        const ind = mkInduction({ door, hangar: mkHangar('H'), bays: [mkBay('Bay1', 'N1')] });
        checkBayReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('bay reachable → no error', () => {
        const accept = mockAccept();
        mockBuildAccessGraph.mockReturnValue(mkGraph(['DN1', 'N1']));
        mockReachableNodes.mockReturnValue(new Set(['DN1', 'N1']));
        const door = mkDoor('D1', 'DN1');
        const bay  = mkBay('Bay1', 'N1');
        const ind  = mkInduction({ door, hangar: mkHangar('H'), bays: [bay] });
        checkBayReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('bay not reachable → SFR19_REACHABILITY error', () => {
        const accept = mockAccept();
        mockBuildAccessGraph.mockReturnValue(mkGraph(['DN1', 'N1']));
        mockReachableNodes.mockReturnValue(new Set(['DN1']));  // N1 absent
        const door = mkDoor('D1', 'DN1');
        const bay  = mkBay('Bay1', 'N1');
        const ind  = mkInduction({ door, hangar: mkHangar('H'), bays: [bay] });
        checkBayReachability(ind, accept);
        expect(calledWithCode(accept, 'SFR19_REACHABILITY')).toBe(true);
    });

    test('bay has no accessNode → skipped for that bay (no false positive)', () => {
        const accept = mockAccept();
        mockBuildAccessGraph.mockReturnValue(mkGraph(['DN1']));
        mockReachableNodes.mockReturnValue(new Set(['DN1']));
        const door = mkDoor('D1', 'DN1');
        const bay  = mkBay('Bay1');  // no accessNode
        const ind  = mkInduction({ door, hangar: mkHangar('H'), bays: [bay] });
        checkBayReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// checkDynamicBayBlockingReachability — SFR21_DYNAMIC_REACHABILITY
// ---------------------------------------------------------------------------
describe('checkDynamicBayBlockingReachability', () => {
    function okResult(): ReachabilityResult {
        return { ok: true, skipped: false, ruleId: 'SFR21_DYNAMIC_REACHABILITY', message: '', evidence: { hangarName: 'H', unreachableBays: [], blockingBays: [], checkedFromDoors: [] } };
    }

    test('no hangar ref → silent return', () => {
        const accept = mockAccept();
        const ind = mkInduction({});
        checkDynamicBayBlockingReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
        expect(mockCheckDynamicReach).not.toHaveBeenCalled();
    });

    test('result.skipped=true → no error even if ok=false', () => {
        const accept = mockAccept();
        mockCheckDynamicReach.mockReturnValue({ ...okResult(), skipped: true, ok: false });
        const ind = mkInduction({ hangar: mkHangar('H') });
        checkDynamicBayBlockingReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('result.ok=true → no error', () => {
        const accept = mockAccept();
        mockCheckDynamicReach.mockReturnValue(okResult());
        const ind = mkInduction({ hangar: mkHangar('H') });
        checkDynamicBayBlockingReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('result.skipped=false and ok=false → error with result.message', () => {
        const accept = mockAccept();
        const msg = '[SFR21_DYNAMIC_REACHABILITY] Bay Bay2 blocked';
        mockCheckDynamicReach.mockReturnValue({ ...okResult(), ok: false, skipped: false, message: msg });
        const ind = mkInduction({ hangar: mkHangar('H') });
        checkDynamicBayBlockingReachability(ind, accept);
        expect(calledWithCode(accept, 'SFR21_DYNAMIC_REACHABILITY')).toBe(true);
        const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
        expect(calls[0][0]).toBe('error');
        expect(calls[0][1]).toBe(msg);
    });
});

// ---------------------------------------------------------------------------
// checkCorridorFitReachability — SFR22_CORRIDOR_FIT
// ---------------------------------------------------------------------------
describe('checkCorridorFitReachability', () => {
    function noViolations() {
        return { violations: [], skipped: false };
    }

    test('no hangar ref → silent return', () => {
        const accept = mockAccept();
        const ind = mkInduction({ aircraft: mkAircraft('Hawk', 10) });
        checkCorridorFitReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
        expect(mockCheckCorridorFit).not.toHaveBeenCalled();
    });

    test('no aircraft ref → silent return', () => {
        const accept = mockAccept();
        const ind = mkInduction({ hangar: mkHangar('H') });
        checkCorridorFitReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
        expect(mockCheckCorridorFit).not.toHaveBeenCalled();
    });

    test('no violations → no warning', () => {
        const accept = mockAccept();
        mockCheckCorridorFit.mockReturnValue(noViolations());
        const ind = mkInduction({ hangar: mkHangar('H'), aircraft: mkAircraft('Hawk', 10) });
        checkCorridorFitReachability(ind, accept);
        expect(wasCalled(accept)).toBe(false);
    });

    test('one corridor violation → SFR22_CORRIDOR_FIT warning', () => {
        const accept = mockAccept();
        mockCheckCorridorFit.mockReturnValue({
            violations: [{ nodeName: 'Corridor1', nodeWidth: 8, wingspanEff: 11, bayName: 'Bay2' }],
            skipped: false,
        });
        const ind = mkInduction({ hangar: mkHangar('H'), aircraft: mkAircraft('Hawk', 10) });
        checkCorridorFitReachability(ind, accept);
        expect(calledWithCode(accept, 'SFR22_CORRIDOR_FIT')).toBe(true);
        const calls = (accept as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
        expect(calls[0][0]).toBe('warning');
    });

    test('two violations → two warnings', () => {
        const accept = mockAccept();
        mockCheckCorridorFit.mockReturnValue({
            violations: [
                { nodeName: 'C1', nodeWidth: 8, wingspanEff: 11, bayName: 'Bay2' },
                { nodeName: 'C2', nodeWidth: 7, wingspanEff: 11, bayName: 'Bay3' },
            ],
            skipped: false,
        });
        const ind = mkInduction({ hangar: mkHangar('H'), aircraft: mkAircraft('Hawk', 10) });
        checkCorridorFitReachability(ind, accept);
        expect((accept as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
    });

    test('clearance adds lateral margin to wingspan → passed to checkCorridorFit', () => {
        const accept = mockAccept();
        mockCheckCorridorFit.mockReturnValue(noViolations());
        const clearance = { lateralMargin: 2 } as unknown as ClearanceEnvelope;
        const ind = mkInduction({
            hangar: mkHangar('H'),
            aircraft: mkAircraft('Hawk', 10),
            clearance,
        });
        checkCorridorFitReachability(ind, accept);
        // Fourth arg to checkCorridorFit should be wingspanEff = 10 + 2 = 12
        const [, , , wingspanEff] = mockCheckCorridorFit.mock.calls[0] as unknown[];
        expect(wingspanEff).toBe(12);
    });
});
