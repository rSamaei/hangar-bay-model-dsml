/**
 * Unit tests for the pure-algorithm helpers in AirfieldCodeActionProvider (L11).
 *
 * The two methods under test — findBridgingBays and findAdjacentCandidateBays —
 * are private, so they are accessed via `(provider as any)`. No Langium runtime
 * is needed; the only inputs are plain strings and a Map<string, Set<string>>.
 */
import { describe, expect, test, beforeEach, vi } from 'vitest';
import { AirfieldCodeActionProvider } from '../src/airfield-code-actions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an adjacency map from an edge list (bidirectional). */
function mkAdj(edges: [string, string][]): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    const ensure = (n: string) => { if (!adj.has(n)) adj.set(n, new Set()); return adj.get(n)!; };
    for (const [a, b] of edges) {
        ensure(a).add(b);
        ensure(b).add(a);
    }
    return adj;
}

let provider: AirfieldCodeActionProvider;

beforeEach(() => {
    provider = new AirfieldCodeActionProvider();
});

// Shorthand to call private methods
function bridging(assigned: string[], adj: Map<string, Set<string>>): string[] {
    return (provider as any).findBridgingBays(assigned, adj);
}

function candidates(
    assigned: string[],
    adj: Map<string, Set<string>>,
    all: string[],
    count: number
): string[] {
    return (provider as any).findAdjacentCandidateBays(assigned, adj, all, count);
}

// ---------------------------------------------------------------------------
// findBridgingBays
// ---------------------------------------------------------------------------

describe('findBridgingBays', () => {
    test('single assigned bay → guard returns empty', () => {
        const adj = mkAdj([['A', 'B']]);
        expect(bridging(['A'], adj)).toEqual([]);
    });

    test('two directly adjacent bays → already contiguous, returns empty', () => {
        // A—B, assigned = [A, B]: componentB is empty → no bridge needed
        const adj = mkAdj([['A', 'B']]);
        expect(bridging(['A', 'B'], adj)).toEqual([]);
    });

    test('linear chain A—B—C, assigned=[A,C], B is bridge', () => {
        // A and C are not directly connected; B bridges them
        const adj = mkAdj([['A', 'B'], ['B', 'C']]);
        expect(bridging(['A', 'C'], adj)).toEqual(['B']);
    });

    test('longer chain A—B—C—D, assigned=[A,D], returns intermediates [B,C]', () => {
        const adj = mkAdj([['A', 'B'], ['B', 'C'], ['C', 'D']]);
        const result = bridging(['A', 'D'], adj);
        // Path goes A → B → C → D; unassigned intermediates are B, C
        expect(result).toEqual(['B', 'C']);
    });

    test('two components with no path between them → returns empty', () => {
        // A—B  C—D (no link between groups)
        const adj = mkAdj([['A', 'B'], ['C', 'D']]);
        expect(bridging(['A', 'C'], adj)).toEqual([]);
    });

    test('three assigned bays in a row: A—B—C all assigned → already contiguous', () => {
        const adj = mkAdj([['A', 'B'], ['B', 'C']]);
        // All three are assigned and form a single component
        expect(bridging(['A', 'B', 'C'], adj)).toEqual([]);
    });

    test('two assigned components, bridge found through unassigned intermediates', () => {
        // Grid: A—X—Y—B, assigned=[A,B]; X and Y are unassigned bridges
        const adj = mkAdj([['A', 'X'], ['X', 'Y'], ['Y', 'B']]);
        expect(bridging(['A', 'B'], adj)).toEqual(['X', 'Y']);
    });

    test('assigned bays already in the same component even with extra nodes', () => {
        // Star topology: A—center, B—center, C—center; assigned=[A,B] → both reach center
        // But A and B are not directly adjacent; however they share center as intermediate
        // Since center is unassigned, it should bridge them
        const adj = mkAdj([['A', 'center'], ['B', 'center'], ['C', 'center']]);
        const result = bridging(['A', 'B'], adj);
        expect(result).toEqual(['center']);
    });
});

// ---------------------------------------------------------------------------
// findAdjacentCandidateBays
// ---------------------------------------------------------------------------

describe('findAdjacentCandidateBays', () => {
    test('count=0 → returns empty immediately', () => {
        const adj = mkAdj([['A', 'B']]);
        expect(candidates(['A'], adj, ['A', 'B'], 0)).toEqual([]);
    });

    test('no unassigned adjacent bays → returns empty', () => {
        // A is assigned, B is also assigned, no others
        const adj = mkAdj([['A', 'B']]);
        expect(candidates(['A', 'B'], adj, ['A', 'B'], 1)).toEqual([]);
    });

    test('one adjacent unassigned bay, count=1 → returns that bay', () => {
        // A(assigned)—B(unassigned)
        const adj = mkAdj([['A', 'B']]);
        expect(candidates(['A'], adj, ['A', 'B'], 1)).toEqual(['B']);
    });

    test('count=2, two direct neighbours available → returns both', () => {
        // center(assigned)—B, center—C
        const adj = mkAdj([['center', 'B'], ['center', 'C']]);
        const result = candidates(['center'], adj, ['center', 'B', 'C'], 2);
        expect(result).toHaveLength(2);
        expect(result).toContain('B');
        expect(result).toContain('C');
    });

    test('count=1, two direct neighbours available → returns only 1', () => {
        const adj = mkAdj([['A', 'B'], ['A', 'C']]);
        const result = candidates(['A'], adj, ['A', 'B', 'C'], 1);
        expect(result).toHaveLength(1);
    });

    test('BFS outward: count=2, only 1 direct neighbour → expands to second layer', () => {
        // A(assigned)—B—C; B is layer 1, C is layer 2
        const adj = mkAdj([['A', 'B'], ['B', 'C']]);
        const result = candidates(['A'], adj, ['A', 'B', 'C'], 2);
        expect(result).toEqual(['B', 'C']);
    });

    test('already assigned bays not returned as candidates', () => {
        // A(assigned)—B(assigned)—C(unassigned)
        const adj = mkAdj([['A', 'B'], ['B', 'C']]);
        const result = candidates(['A', 'B'], adj, ['A', 'B', 'C'], 2);
        expect(result).toEqual(['C']);
    });

    test('isolated assigned bay with no adjacency → returns empty', () => {
        const adj = new Map<string, Set<string>>();  // no edges at all
        expect(candidates(['A'], adj, ['A', 'B'], 1)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Structural mock helpers for dispatch + fix-builder tests
// ---------------------------------------------------------------------------

/** Minimal null-CST document — findInductionAtDiagnostic returns undefined */
const NULL_CST_DOC = {
    parseResult: { value: { $cstNode: null } },
    textDocument: { uri: 'test://doc.air', offsetAt: () => 0 },
} as any;

const DIAG_RANGE = {
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
    severity: 1 as const,
};

function mkBayStub(name: string): any {
    return { $type: 'HangarBay', name, width: 12, depth: 15, height: 6, adjacent: [], row: undefined, col: undefined };
}

function mkHangarStub(bays: any[]): any {
    return { grid: { bays, rows: undefined, cols: undefined, adjacency: undefined } };
}

/** Build an induction stub with bays that each have a $refNode insert position. */
function mkInductionStub(hangar: any, bays: any[]): any {
    return {
        hangar: hangar ? { ref: hangar } : undefined,
        bays: bays.map((b, i) => ({
            ref: b,
            $refNode: { range: { end: { line: 5, character: 20 + i * 5 } } },
        })),
    };
}

/** Build an induction stub where the last bay has NO $refNode (→ no insert pos). */
function mkInductionNoRefNode(hangar: any, bays: any[]): any {
    return {
        hangar: hangar ? { ref: hangar } : undefined,
        bays: bays.map((b) => ({ ref: b, $refNode: undefined })),
    };
}

// ---------------------------------------------------------------------------
// getCodeActions + createActionsForDiagnostic dispatch (null-CST → early returns)
// ---------------------------------------------------------------------------

describe('getCodeActions dispatch (null-CST document)', () => {
    test('ruleId SFR13_CONTIGUITY → createContiguityFix, no induction → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR13_CONTIGUITY', data: { ruleId: 'SFR13_CONTIGUITY' } }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('ruleId SFR12_BAY_FIT with widthFits=true evidence → empty immediately', () => {
        const p = new AirfieldCodeActionProvider();
        const evidence = { effectiveWingspan: 11, bayWidth: 12, widthFits: true };
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR12_BAY_FIT', data: { ruleId: 'SFR12_BAY_FIT', evidence } }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('ruleId SFR12_BAY_FIT with widthFits=false evidence, null CST → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const evidence = { effectiveWingspan: 25, bayWidth: 12, widthFits: false };
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR12_BAY_FIT', data: { ruleId: 'SFR12_BAY_FIT', evidence } }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('ruleId SFR25_BAY_COUNT with evidence, null CST → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const evidence = { effectiveMin: 3, assignedCount: 1 };
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR25_BAY_COUNT', data: { ruleId: 'SFR25_BAY_COUNT', evidence } }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('legacy message SFR13_CONTIGUITY (no ruleId), null CST → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR13_CONTIGUITY: bays not connected', data: undefined }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('legacy message SFR25_BAY_COUNT (no ruleId, no count match), null CST → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR25_BAY_COUNT: bad', data: undefined }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('legacy SFR25_BAY_COUNT with count match in message, null CST → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR25_BAY_COUNT requires at least 3 bays but only 1', data: undefined }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('legacy SFR12_BAY_FIT without wingspan regex in message → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR12_BAY_FIT: depth exceeds bay depth', data: undefined }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('legacy SFR12_BAY_FIT with wingspan regex, null CST → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'SFR12_BAY_FIT: wingspan: 25m > 12m', data: undefined }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });

    test('unknown rule and message → getCodeActions returns undefined', () => {
        const p = new AirfieldCodeActionProvider();
        const result = p.getCodeActions(NULL_CST_DOC, {
            textDocument: { uri: NULL_CST_DOC.textDocument.uri },
            range: DIAG_RANGE.range,
            context: { diagnostics: [{ ...DIAG_RANGE, message: 'COMPLETELY_UNKNOWN: whatever', data: undefined }] },
        } as any);
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Fix builder methods — spy on findInductionAtDiagnostic to inject mock induction
// ---------------------------------------------------------------------------

describe('fix builder: createContiguityFix', () => {
    test('< 2 bays assigned → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const hangar = mkHangarStub([mkBayStub('B1')]);
        const induction = mkInductionStub(hangar, [mkBayStub('B1')]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const diag = { ...DIAG_RANGE, message: 'SFR13_CONTIGUITY', data: { ruleId: 'SFR13_CONTIGUITY' } };
        const result = (p as any).createContiguityFix(diag, NULL_CST_DOC);
        expect(result).toEqual([]);
    });

    test('2 disconnected bays with bridge available → returns action', () => {
        const p = new AirfieldCodeActionProvider();
        const bayA = mkBayStub('BayA');
        const bridge = mkBayStub('Bridge');
        const bayB = mkBayStub('BayB');
        bayA.adjacent = [{ ref: bridge }];
        bridge.adjacent = [{ ref: bayA }, { ref: bayB }];
        bayB.adjacent = [{ ref: bridge }];
        const hangar = mkHangarStub([bayA, bridge, bayB]);
        const induction = mkInductionStub(hangar, [bayA, bayB]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const diag = { ...DIAG_RANGE, message: 'SFR13_CONTIGUITY', data: { ruleId: 'SFR13_CONTIGUITY' } };
        const actions = (p as any).createContiguityFix(diag, NULL_CST_DOC);
        expect(actions).toHaveLength(1);
        expect(actions[0].kind).toBe('quickfix');
        expect(actions[0].title.toLowerCase()).toContain('contiguity');
    });

    test('no hangar on induction → empty (createBayExpansionFix early return)', () => {
        const p = new AirfieldCodeActionProvider();
        // 2 bays, no hangar → createBayExpansionFix returns [] at !hangar check
        const induction = {
            hangar: undefined,
            bays: [
                { ref: mkBayStub('B1'), $refNode: { range: { end: { line: 1, character: 10 } } } },
                { ref: mkBayStub('B2'), $refNode: { range: { end: { line: 1, character: 15 } } } },
            ],
        };
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const diag = { ...DIAG_RANGE, message: 'SFR13_CONTIGUITY', data: { ruleId: 'SFR13_CONTIGUITY' } };
        const result = (p as any).createContiguityFix(diag, NULL_CST_DOC);
        expect(result).toEqual([]);
    });

    test('last bay has no $refNode → empty (no insert position)', () => {
        const p = new AirfieldCodeActionProvider();
        const bayA = mkBayStub('BayA');
        const bridge = mkBayStub('Bridge');
        const bayB = mkBayStub('BayB');
        bayA.adjacent = [{ ref: bridge }];
        bridge.adjacent = [{ ref: bayA }, { ref: bayB }];
        bayB.adjacent = [{ ref: bridge }];
        const hangar = mkHangarStub([bayA, bridge, bayB]);
        const induction = mkInductionNoRefNode(hangar, [bayA, bayB]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const diag = { ...DIAG_RANGE, message: 'SFR13_CONTIGUITY', data: { ruleId: 'SFR13_CONTIGUITY' } };
        const result = (p as any).createContiguityFix(diag, NULL_CST_DOC);
        expect(result).toEqual([]);
    });

    test('no bridging bays available → empty (no path between components)', () => {
        const p = new AirfieldCodeActionProvider();
        // A and B are isolated (no adjacency → no bridge possible)
        const bayA = mkBayStub('BayA');
        const bayB = mkBayStub('BayB');
        const hangar = mkHangarStub([bayA, bayB]);
        const induction = mkInductionStub(hangar, [bayA, bayB]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const diag = { ...DIAG_RANGE, message: 'SFR13_CONTIGUITY', data: { ruleId: 'SFR13_CONTIGUITY' } };
        const result = (p as any).createContiguityFix(diag, NULL_CST_DOC);
        expect(result).toEqual([]);
    });
});

describe('fix builder: createBayFitWidthFix', () => {
    test('structured evidence (widthFits=false) → add bays action', () => {
        const p = new AirfieldCodeActionProvider();
        const bayA = mkBayStub('BayA');
        const bayB = mkBayStub('BayB');
        bayA.adjacent = [{ ref: bayB }];
        bayB.adjacent = [{ ref: bayA }];
        const hangar = mkHangarStub([bayA, bayB]);
        const induction = mkInductionStub(hangar, [bayA]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const evidence = { effectiveWingspan: 25, bayWidth: 12, widthFits: false };
        const diag = { ...DIAG_RANGE, message: 'SFR12_BAY_FIT', data: { ruleId: 'SFR12_BAY_FIT', evidence } };
        const actions = (p as any).createBayFitWidthFix(diag, NULL_CST_DOC, evidence);
        expect(actions).toHaveLength(1);
        expect(actions[0].kind).toBe('quickfix');
    });

    test('regexp evidence from message (wingspan: 25m > 12m) → add bays action', () => {
        const p = new AirfieldCodeActionProvider();
        const bayA = mkBayStub('BayA');
        const bayB = mkBayStub('BayB');
        bayA.adjacent = [{ ref: bayB }];
        bayB.adjacent = [{ ref: bayA }];
        const hangar = mkHangarStub([bayA, bayB]);
        const induction = mkInductionStub(hangar, [bayA]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const diag = { ...DIAG_RANGE, message: 'SFR12_BAY_FIT: wingspan: 25m > 12m', data: undefined };
        const actions = (p as any).createBayFitWidthFix(diag, NULL_CST_DOC, undefined);
        expect(actions).toHaveLength(1);
    });

    test('needed <= 0 (already enough bays) → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const bayA = mkBayStub('BayA');
        const hangar = mkHangarStub([bayA]);
        // wingspan 10m in a 12m bay → already fits, widthFits=false but needed=0
        const induction = mkInductionStub(hangar, [bayA]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const evidence = { effectiveWingspan: 10, bayWidth: 12, widthFits: false };
        const diag = { ...DIAG_RANGE, message: 'SFR12_BAY_FIT', data: { ruleId: 'SFR12_BAY_FIT', evidence } };
        const result = (p as any).createBayFitWidthFix(diag, NULL_CST_DOC, evidence);
        // Math.ceil(10/12)=1 bays needed total, 1 already assigned → needed=0 → []
        expect(result).toEqual([]);
    });
});

describe('fix builder: createBayCountFix', () => {
    test('structured evidence → add bays action', () => {
        const p = new AirfieldCodeActionProvider();
        const bayA = mkBayStub('BayA');
        const bayB = mkBayStub('BayB');
        const bayC = mkBayStub('BayC');
        bayA.adjacent = [{ ref: bayB }];
        bayB.adjacent = [{ ref: bayA }, { ref: bayC }];
        bayC.adjacent = [{ ref: bayB }];
        const hangar = mkHangarStub([bayA, bayB, bayC]);
        const induction = mkInductionStub(hangar, [bayA]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const evidence = { effectiveMin: 3, assignedCount: 1 };
        const diag = { ...DIAG_RANGE, message: 'SFR25_BAY_COUNT', data: { ruleId: 'SFR25_BAY_COUNT', evidence } };
        const actions = (p as any).createBayCountFix(diag, NULL_CST_DOC, evidence);
        expect(actions).toHaveLength(1);
        expect(actions[0].kind).toBe('quickfix');
    });

    test('regexp evidence from message → add bays action', () => {
        const p = new AirfieldCodeActionProvider();
        const bayA = mkBayStub('BayA');
        const bayB = mkBayStub('BayB');
        bayA.adjacent = [{ ref: bayB }];
        bayB.adjacent = [{ ref: bayA }];
        const hangar = mkHangarStub([bayA, bayB]);
        const induction = mkInductionStub(hangar, [bayA]);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const diag = { ...DIAG_RANGE, message: 'SFR25_BAY_COUNT requires at least 2 bays but only 1', data: undefined };
        const actions = (p as any).createBayCountFix(diag, NULL_CST_DOC, undefined);
        expect(actions).toHaveLength(1);
    });

    test('needed <= 0 (already enough bays in evidence) → empty', () => {
        const p = new AirfieldCodeActionProvider();
        const induction = mkInductionStub(mkHangarStub([]), []);
        vi.spyOn(p as any, 'findInductionAtDiagnostic').mockReturnValue(induction);
        const evidence = { effectiveMin: 2, assignedCount: 3 }; // already more than enough
        const diag = { ...DIAG_RANGE, message: 'SFR25_BAY_COUNT', data: { ruleId: 'SFR25_BAY_COUNT', evidence } };
        const result = (p as any).createBayCountFix(diag, NULL_CST_DOC, evidence);
        expect(result).toEqual([]);
    });
});
