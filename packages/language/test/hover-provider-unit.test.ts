/**
 * Unit tests for AirfieldHoverProvider.
 *
 * Imports directly from TypeScript source for v8 coverage.
 * Uses structural mocks — no Langium runtime needed; the tested methods
 * (getAstNodeHoverContent and all private hover builders) operate purely on
 * AST node shapes and the feasibility-engine helpers.
 */
import { describe, expect, test, beforeAll } from 'vitest';
import { AirfieldHoverProvider } from '../src/hover-provider.js';
import type { HangarBay } from '../src/generated/ast.js';

// ---------------------------------------------------------------------------
// Minimal mock services (AstNodeHoverProvider constructor stores nameProvider)
// ---------------------------------------------------------------------------

const mockServices = {
    references: {
        NameProvider: {
            getNameNode: () => undefined,
            getName: () => undefined,
        },
        References: {
            findDeclarations: () => [],
        },
    },
    parser: {
        GrammarConfig: {
            nameRegexp: /[a-zA-Z_][\w_]*/,
        },
    },
} as any;

// ---------------------------------------------------------------------------
// AST structural mock helpers
// ---------------------------------------------------------------------------

function mkClearance(overrides: Partial<any> = {}): any {
    return {
        $type: 'ClearanceEnvelope',
        name: 'TestClearance',
        lateralMargin: 1.0,
        longitudinalMargin: 0.5,
        verticalMargin: 0.3,
        ...overrides,
    };
}

function mkAircraft(overrides: Partial<any> = {}): any {
    return {
        $type: 'AircraftType',
        name: 'TestAircraft',
        wingspan: 11.0,
        length: 8.3,
        height: 2.7,
        tailHeight: undefined,
        clearance: undefined,
        ...overrides,
    };
}

function mkBay(name: string, overrides: Partial<any> = {}): HangarBay {
    return {
        $type: 'HangarBay',
        name,
        width: 12.0,
        depth: 15.0,
        height: 5.0,
        row: undefined,
        col: undefined,
        traversable: false,
        adjacent: [],
        accessNode: undefined,
        ...overrides,
    } as unknown as HangarBay;
}

function mkGrid(bays: HangarBay[], opts: { rows?: number; cols?: number } = {}): any {
    return {
        $type: 'BayGrid',
        bays,
        rows: opts.rows,
        cols: opts.cols,
        adjacency: undefined,
    };
}

function mkHangar(bays: HangarBay[], opts: { rows?: number; cols?: number } = {}): any {
    return {
        $type: 'Hangar',
        name: 'TestHangar',
        grid: mkGrid(bays, opts),
        doors: [],
    };
}

function mkInduction(overrides: Partial<any> = {}): any {
    return {
        $type: 'Induction',
        id: 'IND001',
        aircraft: { ref: mkAircraft() },
        hangar: undefined,
        clearance: undefined,
        span: undefined,
        bays: [],
        start: '2025-06-01T08:00',
        end: '2025-06-14T08:00',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let provider: AirfieldHoverProvider;

beforeAll(() => {
    provider = new AirfieldHoverProvider(mockServices);
});

async function dispatchHover(node: any): Promise<string | undefined> {
    return (provider as any).getAstNodeHoverContent(node);
}

async function inductionHover(ind: any): Promise<string | undefined> {
    return (provider as any).inductionHover(ind);
}

async function aircraftHover(ac: any): Promise<string | undefined> {
    return (provider as any).aircraftHover(ac);
}

async function bayHover(bay: any): Promise<string | undefined> {
    return (provider as any).bayHover(bay);
}

async function clearanceHover(env: any): Promise<string | undefined> {
    return (provider as any).clearanceHover(env);
}

// ---------------------------------------------------------------------------
// getAstNodeHoverContent — dispatch
// ---------------------------------------------------------------------------

describe('getAstNodeHoverContent dispatch', () => {
    test('Induction node → inductionHover result', async () => {
        const ind = mkInduction({ aircraft: { ref: mkAircraft() } });
        const result = await dispatchHover(ind);
        expect(result).toContain('Induction');
    });

    test('AircraftType node → aircraftHover result', async () => {
        const ac = mkAircraft();
        const result = await dispatchHover(ac);
        expect(result).toContain('Aircraft');
    });

    test('HangarBay node → bayHover result', async () => {
        const bay = mkBay('Bay1');
        const result = await dispatchHover(bay);
        expect(result).toContain('Bay1');
    });

    test('ClearanceEnvelope node → clearanceHover result', async () => {
        const env = mkClearance();
        const result = await dispatchHover(env);
        expect(result).toContain('Clearance');
    });

    test('Unknown node type → undefined', async () => {
        const node = { $type: 'Model', name: 'X' };
        const result = await dispatchHover(node);
        expect(result).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// inductionHover
// ---------------------------------------------------------------------------

describe('inductionHover', () => {
    test('returns undefined when aircraft ref is unresolved', async () => {
        const ind = mkInduction({ aircraft: { ref: undefined } });
        const result = await inductionHover(ind);
        expect(result).toBeUndefined();
    });

    test('baysRequired defaults to 1 when hangar is not assigned', async () => {
        const ind = mkInduction({ hangar: undefined });
        const result = await inductionHover(ind);
        expect(result).toBeDefined();
        expect(result).toContain('required');
    });

    test('baysRequired calculated from hangar grid when hangar is present', async () => {
        // wingspan 11m, each bay 6m wide → needs 2 bays
        const bays = [mkBay('B1', { width: 6 }), mkBay('B2', { width: 6 })];
        const hangar = mkHangar(bays);
        const aircraft = mkAircraft({ wingspan: 11 });
        const ind = mkInduction({ aircraft: { ref: aircraft }, hangar: { ref: hangar } });
        const result = await inductionHover(ind);
        expect(result).toContain('2 required');
    });

    test('single bay → connectivity is "single bay"', async () => {
        const bay = mkBay('B1');
        const ind = mkInduction({ bays: [{ ref: bay }] });
        const result = await inductionHover(ind);
        expect(result).toContain('single bay');
    });

    test('two adjacent bays → connectivity is "connected"', async () => {
        const B1 = mkBay('B1');
        const B2 = mkBay('B2');
        (B1 as any).adjacent = [{ ref: B2 }];
        const hangar = mkHangar([B1, B2]);
        const ind = mkInduction({
            hangar: { ref: hangar },
            bays: [{ ref: B1 }, { ref: B2 }],
        });
        const result = await inductionHover(ind);
        expect(result).toContain('connected');
    });

    test('two non-adjacent bays → shows fractional reachability', async () => {
        const B1 = mkBay('B1');
        const B2 = mkBay('B2');
        const hangar = mkHangar([B1, B2]);
        const ind = mkInduction({
            hangar: { ref: hangar },
            bays: [{ ref: B1 }, { ref: B2 }],
        });
        const result = await inductionHover(ind);
        expect(result).toContain('reachable');
    });

    test('induction id shown in label when present', async () => {
        const ind = mkInduction({ id: 'IND999' });
        const result = await inductionHover(ind);
        expect(result).toContain('IND999');
    });

    test('generic label when id is absent', async () => {
        const ind = mkInduction({ id: undefined });
        const result = await inductionHover(ind);
        expect(result).toContain('**Induction**');
        expect(result).not.toContain('undefined');
    });

    test('clearance name appears when clearance is applied', async () => {
        const clr = mkClearance({ name: 'SpecialClearance' });
        const ind = mkInduction({ clearance: { ref: clr } });
        const result = await inductionHover(ind);
        expect(result).toContain('SpecialClearance');
    });

    test('longitudinal span shown in output', async () => {
        const ind = mkInduction({ span: 'longitudinal' });
        const result = await inductionHover(ind);
        expect(result).toContain('longitudinal');
    });
});

// ---------------------------------------------------------------------------
// aircraftHover
// ---------------------------------------------------------------------------

describe('aircraftHover', () => {
    test('shows raw dimensions without clearance', async () => {
        const ac = mkAircraft();
        const result = await aircraftHover(ac);
        expect(result).toContain('11');
        expect(result).toContain('8.3');
        expect(result).not.toContain('Clearance');
        expect(result).not.toContain('Effective');
    });

    test('shows clearance name and effective dimensions when clearance is set', async () => {
        const clr = mkClearance();
        const ac = mkAircraft({ clearance: { ref: clr } });
        const result = await aircraftHover(ac);
        expect(result).toContain('Clearance');
        expect(result).toContain('Effective');
        // effective wingspan = 11 + 1 = 12
        expect(result).toContain('12');
    });

    test('shows tail height notation when tailHeight is set', async () => {
        const ac = mkAircraft({ tailHeight: 3.5 });
        const result = await aircraftHover(ac);
        expect(result).toContain('tail');
        expect(result).toContain('3.5');
    });
});

// ---------------------------------------------------------------------------
// bayHover
// ---------------------------------------------------------------------------

describe('bayHover', () => {
    test('shows bay name and dimensions', async () => {
        const bay = mkBay('Bay1');
        const result = await bayHover(bay);
        expect(result).toContain('Bay1');
        expect(result).toContain('12');
        expect(result).toContain('15');
    });

    test('shows grid row/col when set', async () => {
        const bay = mkBay('Bay1', { row: 2, col: 3 });
        const result = await bayHover(bay);
        expect(result).toContain('row 2');
        expect(result).toContain('col 3');
    });

    test('shows traversable annotation when set', async () => {
        const bay = mkBay('Bay1', { traversable: true });
        const result = await bayHover(bay);
        expect(result).toContain('Traversable');
    });

    test('omits grid and traversable lines when not set', async () => {
        const bay = mkBay('Bay1');
        const result = await bayHover(bay);
        expect(result).not.toContain('Grid');
        expect(result).not.toContain('Traversable');
    });
});

// ---------------------------------------------------------------------------
// clearanceHover
// ---------------------------------------------------------------------------

describe('clearanceHover', () => {
    test('shows clearance name and all three axis margins', async () => {
        const env = mkClearance();
        const result = await clearanceHover(env);
        expect(result).toContain('TestClearance');
        expect(result).toContain('Lateral');
        expect(result).toContain('Longitudinal');
        expect(result).toContain('Vertical');
    });
});

// ---------------------------------------------------------------------------
// fmt helper (exercised via aircraftHover with integer vs decimal values)
// ---------------------------------------------------------------------------

describe('fmt number formatting', () => {
    test('integer value formatted without decimal suffix', async () => {
        // wingspan=10.0 should render as "10" not "10.00"
        const ac = mkAircraft({ wingspan: 10.0, length: 8.0, height: 3.0 });
        const result = await aircraftHover(ac);
        expect(result).toContain('10m');
        expect(result).not.toContain('10.00');
    });

    test('non-integer value formatted to two decimal places', async () => {
        const ac = mkAircraft({ wingspan: 11.37 });
        const result = await aircraftHover(ac);
        expect(result).toContain('11.37');
    });
});
