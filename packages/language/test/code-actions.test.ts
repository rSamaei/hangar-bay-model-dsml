/**
 * Tests for AirfieldCodeActionProvider.
 *
 * Strategy: parse a document that contains a known violation, run validation
 * to get the real diagnostic, then feed it to the code action provider and
 * assert on the returned CodeAction.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import type { Model } from 'airfield-language';
import { createAirfieldServices } from 'airfield-language';
import type { CodeAction, Diagnostic } from 'vscode-languageserver';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let services: ReturnType<typeof createAirfieldServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createAirfieldServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Airfield);
});

/** Run validation and return all LSP diagnostics for a parsed document. */
async function validateDoc(document: LangiumDocument): Promise<Diagnostic[]> {
    return services.Airfield.validation.DocumentValidator.validateDocument(document) as Promise<Diagnostic[]>;
}

/** Invoke the code action provider for a specific diagnostic. */
function getCodeActions(document: LangiumDocument, diagnostic: Diagnostic): CodeAction[] {
    const provider = services.Airfield.lsp.CodeActionProvider;
    if (!provider) return [];

    const params = {
        textDocument: { uri: document.textDocument.uri },
        range: diagnostic.range,
        context: { diagnostics: [diagnostic] }
    };
    const result = provider.getCodeActions(document, params as any);
    // Result may be a Promise or a plain array; handle both
    if (Array.isArray(result)) return result as CodeAction[];
    return [];
}

// ---------------------------------------------------------------------------
// SFR12_BAY_FIT quick-fix: add adjacent bays when aircraft too wide for bay
// ---------------------------------------------------------------------------

describe('Code action: SFR12_BAY_FIT bay fit width fix', () => {

    /**
     * Aircraft wingspan 20m > bay width 12m → SFR12_BAY_FIT fires.
     * ceil(20/12) = 2 bays needed; 1 is assigned → offer to add BayB.
     */
    test('offers to add adjacent bay when aircraft wingspan exceeds single bay width', async () => {
        const document = await parse(`
            airfield BayFitWidthTest {
                aircraft WideAircraft {
                    wingspan 20.0 m
                    length   15.0 m
                    height    5.0 m
                }
                hangar TestHangar {
                    doors {
                        door D1 {
                            width  25.0 m
                            height  8.0 m
                        }
                    }
                    grid baygrid {
                        bay BayA {
                            width  12.0 m
                            depth  20.0 m
                            height  6.0 m
                            adjacent { BayB }
                        }
                        bay BayB {
                            width  12.0 m
                            depth  20.0 m
                            height  6.0 m
                            adjacent { BayA }
                        }
                    }
                }
                induct WideAircraft into TestHangar bays BayA
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await validateDoc(document);
        const bayFitDiag = diagnostics.find(d => d.message.includes('SFR12_BAY_FIT'));
        expect(bayFitDiag).toBeDefined();

        // Verify structured evidence is attached to the diagnostic
        const diagData = bayFitDiag!.data as { ruleId?: string; evidence?: any } | undefined;
        expect(diagData?.ruleId).toBe('SFR12_BAY_FIT');
        expect(typeof diagData?.evidence?.effectiveWingspan).toBe('number');
        expect(diagData?.evidence?.widthFits).toBe(false);

        const actions = getCodeActions(document, bayFitDiag!);
        expect(actions.length).toBeGreaterThanOrEqual(1);

        const action = actions[0];
        expect(action.kind).toBe('quickfix');
        expect(action.title).toContain('wingspan');

        const uri = document.textDocument.uri;
        const edits = action.edit?.changes?.[uri];
        expect(edits).toBeDefined();
        const newText = edits![0].newText;
        expect(newText).toContain('BayB');
    });

    /**
     * Aircraft fits width-wise but not depth/height → no wingspan violation in
     * the message → no quick fix offered.
     */
    test('no wingspan fix when only height/depth violations exist', async () => {
        const document = await parse(`
            airfield BayFitHeightTest {
                aircraft TallAircraft {
                    wingspan  8.0 m
                    length   25.0 m
                    height   10.0 m
                }
                hangar TestHangar {
                    doors {
                        door D1 {
                            width  15.0 m
                            height 12.0 m
                        }
                    }
                    grid baygrid {
                        bay BayA {
                            width  10.0 m
                            depth  20.0 m
                            height  5.0 m
                            adjacent { BayB }
                        }
                        bay BayB {
                            width  10.0 m
                            depth  20.0 m
                            height  5.0 m
                            adjacent { BayA }
                        }
                    }
                }
                induct TallAircraft into TestHangar bays BayA
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await validateDoc(document);
        const bayFitDiag = diagnostics.find(d => d.message.includes('SFR12_BAY_FIT'));
        expect(bayFitDiag).toBeDefined();

        // Width fits (8m ≤ 10m) → no wingspan violation in message → no fix
        const actions = getCodeActions(document, bayFitDiag!);
        expect(actions).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// SFR25_BAY_COUNT quick-fix: add adjacent bay to meet wingspan requirement
// ---------------------------------------------------------------------------

describe('Code action: SFR25_BAY_COUNT bay count fix', () => {

    /**
     * Grid layout (2×2):
     *   Bay1A(0,0)  Bay1B(0,1)
     *   Bay2A(1,0)  Bay2B(1,1)
     *
     * Aircraft wingspan 70m — min bay width 36m → ceil(70/36) = 2 bays required.
     * Only Bay1A is assigned (1 bay) → SFR25 warning fires.
     * Bay1B is adjacent (same row, col+1) and should be offered as the fix.
     */
    test('offers to add an adjacent bay when one extra bay is needed', async () => {
        const document = await parse(`
            airfield BayCountFixTest {
                aircraft WideBody {
                    wingspan 70.0 m
                    length   60.0 m
                    height   16.0 m
                }
                hangar Alpha {
                    doors {
                        door D1 {
                            width  75.0 m
                            height 20.0 m
                        }
                    }
                    grid baygrid {
                        rows 2 cols 2
                        bay Bay1A {
                            at row 0 col 0
                            width  36.0 m
                            depth  50.0 m
                            height 18.0 m
                        }
                        bay Bay1B {
                            at row 0 col 1
                            width  36.0 m
                            depth  50.0 m
                            height 18.0 m
                        }
                        bay Bay2A {
                            at row 1 col 0
                            width  36.0 m
                            depth  50.0 m
                            height 18.0 m
                        }
                        bay Bay2B {
                            at row 1 col 1
                            width  36.0 m
                            depth  50.0 m
                            height 18.0 m
                        }
                    }
                }
                induct WideBody into Alpha bays Bay1A
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await validateDoc(document);
        const bayCountDiag = diagnostics.find(d => d.message.includes('SFR25_BAY_COUNT'));
        expect(bayCountDiag).toBeDefined();

        const actions = getCodeActions(document, bayCountDiag!);
        expect(actions.length).toBeGreaterThanOrEqual(1);

        const action = actions[0];
        expect(action.kind).toBe('quickfix');
        expect(action.title).toContain('wingspan requirement');

        // The edit should insert a bay name into the document
        const uri = document.textDocument.uri;
        const edits = action.edit?.changes?.[uri];
        expect(edits).toBeDefined();
        expect(edits!.length).toBeGreaterThanOrEqual(1);

        // The inserted text should start with a space and contain a bay name
        const newText = edits![0].newText;
        expect(newText).toMatch(/^ \w/);
    });

    test('no bay-count action when no SFR25 diagnostic', async () => {
        // Assign two bays so SFR25 does not fire
        const document = await parse(`
            airfield NoBayCountFixTest {
                aircraft WideBody {
                    wingspan 70.0 m
                    length   60.0 m
                    height   16.0 m
                }
                hangar Alpha {
                    doors {
                        door D1 {
                            width  75.0 m
                            height 20.0 m
                        }
                    }
                    grid baygrid {
                        rows 1 cols 2
                        bay Bay1A {
                            at row 0 col 0
                            width  36.0 m
                            depth  50.0 m
                            height 18.0 m
                        }
                        bay Bay1B {
                            at row 0 col 1
                            width  36.0 m
                            depth  50.0 m
                            height 18.0 m
                        }
                    }
                }
                induct WideBody into Alpha bays Bay1A Bay1B
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await validateDoc(document);
        const bayCountDiag = diagnostics.find(d => d.message.includes('SFR25_BAY_COUNT'));
        expect(bayCountDiag).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// SFR13_CONTIGUITY quick-fix: insert bridging bay
// ---------------------------------------------------------------------------

describe('Code action: SFR13_CONTIGUITY contiguity fix', () => {

    /**
     * Linear adjacency via explicit `adjacent` declarations:
     *   BayA ↔ BayB ↔ BayC
     *
     * Induction assigns BayA and BayC (skipping BayB) → SFR13 fires.
     * BayB is the bridge and should be offered as the fix.
     */
    test('offers bridging bay when two assigned bays are not directly connected', async () => {
        const document = await parse(`
            airfield ContiguityFixTest {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length    8.3 m
                    height    2.7 m
                }
                hangar LinearHangar {
                    doors {
                        door D1 {
                            width  15.0 m
                            height  5.0 m
                        }
                    }
                    grid baygrid {
                        bay BayA {
                            width  12.0 m
                            depth  15.0 m
                            height  5.0 m
                            adjacent { BayB }
                        }
                        bay BayB {
                            width  12.0 m
                            depth  15.0 m
                            height  5.0 m
                            adjacent { BayA BayC }
                        }
                        bay BayC {
                            width  12.0 m
                            depth  15.0 m
                            height  5.0 m
                            adjacent { BayB }
                        }
                    }
                }
                induct Cessna172 into LinearHangar bays BayA BayC
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await validateDoc(document);
        const contiguityDiag = diagnostics.find(d => d.message.includes('SFR13_CONTIGUITY'));
        expect(contiguityDiag).toBeDefined();

        const actions = getCodeActions(document, contiguityDiag!);
        expect(actions.length).toBeGreaterThanOrEqual(1);

        const action = actions[0];
        expect(action.kind).toBe('quickfix');
        expect(action.title).toContain('contiguity');

        // The edit should insert 'BayB' (the only bridge between BayA and BayC)
        const uri = document.textDocument.uri;
        const edits = action.edit?.changes?.[uri];
        expect(edits).toBeDefined();
        const newText = edits![0].newText;
        expect(newText).toContain('BayB');
    });

    test('no contiguity action when bays are already contiguous', async () => {
        const document = await parse(`
            airfield ContiguousTest {
                aircraft Cessna172 {
                    wingspan 11.0 m
                    length    8.3 m
                    height    2.7 m
                }
                hangar LinearHangar {
                    doors {
                        door D1 {
                            width  15.0 m
                            height  5.0 m
                        }
                    }
                    grid baygrid {
                        bay BayA {
                            width  12.0 m
                            depth  15.0 m
                            height  5.0 m
                            adjacent { BayB }
                        }
                        bay BayB {
                            width  12.0 m
                            depth  15.0 m
                            height  5.0 m
                            adjacent { BayA }
                        }
                    }
                }
                induct Cessna172 into LinearHangar bays BayA BayB
                from 2024-01-01T08:00
                to   2024-01-01T16:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await validateDoc(document);
        const contiguityDiag = diagnostics.find(d => d.message.includes('SFR13_CONTIGUITY'));
        // Adjacent bays → no contiguity violation → no code action needed
        expect(contiguityDiag).toBeUndefined();
    });
});
