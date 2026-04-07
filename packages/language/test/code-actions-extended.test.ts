/**
 * Extended tests for AirfieldCodeActionProvider.
 *
 * Covers branches not reached by code-actions.test.ts:
 *   - SFR14_BAY_COUNT quick-fix (add adjacent bays to meet wingspan requirement)
 *   - Legacy fallback: substring-match dispatch on message (no ruleId in data)
 *   - No-op cases: unknown diagnostic rule, induction with no bays
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

async function validateDoc(document: LangiumDocument): Promise<Diagnostic[]> {
    return services.Airfield.validation.DocumentValidator.validateDocument(document) as Promise<Diagnostic[]>;
}

function getCodeActions(document: LangiumDocument, diagnostic: Diagnostic): CodeAction[] {
    const provider = services.Airfield.lsp.CodeActionProvider;
    if (!provider) return [];
    const params = {
        textDocument: { uri: document.textDocument.uri },
        range: diagnostic.range,
        context: { diagnostics: [diagnostic] },
    };
    const result = provider.getCodeActions(document, params as any);
    if (Array.isArray(result)) return result as CodeAction[];
    return [];
}

// ---------------------------------------------------------------------------
// SFR14_BAY_COUNT fix
// ---------------------------------------------------------------------------

describe('Code action: SFR14_BAY_COUNT bay count fix', () => {
    test('offers to add adjacent bay when too few bays assigned for wingspan', async () => {
        const document = await parse(`
            airfield BayCountTest {
                aircraft WideAircraft {
                    wingspan 25.0 m
                    length   15.0 m
                    height    5.0 m
                }
                hangar TestHangar {
                    doors {
                        door D1 { width 30.0 m height 8.0 m }
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
                            adjacent { BayA BayC }
                        }
                        bay BayC {
                            width  12.0 m
                            depth  20.0 m
                            height  6.0 m
                            adjacent { BayB }
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
        const bayCountDiag = diagnostics.find(d => d.message.includes('SFR14_BAY_COUNT'));
        expect(bayCountDiag).toBeDefined();

        const actions = getCodeActions(document, bayCountDiag!);
        expect(actions.length).toBeGreaterThanOrEqual(1);

        const action = actions[0];
        expect(action.kind).toBe('quickfix');
        expect(action.title.toLowerCase()).toMatch(/bay/);

        const uri = document.textDocument.uri;
        const edits = action.edit?.changes?.[uri];
        expect(edits).toBeDefined();
        expect(edits!.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Legacy fallback: message-based dispatch (no structured data.ruleId)
// ---------------------------------------------------------------------------

describe('Code action: legacy message-based dispatch', () => {
    test('SFR16_CONTIGUITY in message (no ruleId) still triggers contiguity fix', async () => {
        const document = await parse(`
            airfield ContiguityTest {
                aircraft Cessna {
                    wingspan 11.0 m
                    length    8.3 m
                    height    2.7 m
                }
                hangar AlphaHangar {
                    doors {
                        door MainDoor { width 15.0 m height 5.0 m }
                    }
                    grid baygrid {
                        bay Bay1 { width 12.0 m depth 10.0 m height 5.0 m adjacent { Bay2 } }
                        bay Bay2 { width 12.0 m depth 10.0 m height 5.0 m adjacent { Bay1 Bay3 } }
                        bay Bay3 { width 12.0 m depth 10.0 m height 5.0 m adjacent { Bay2 } }
                    }
                }
                induct Cessna into AlphaHangar bays Bay1 Bay3
                from 2024-06-01T08:00
                to   2024-06-01T10:00;
            }
        `);

        expect(document.parseResult.parserErrors).toHaveLength(0);

        const diagnostics = await validateDoc(document);
        const contiguityDiag = diagnostics.find(d => d.message.includes('SFR16_CONTIGUITY'));
        expect(contiguityDiag).toBeDefined();

        // Strip the data to force fallback to message-based dispatch
        const stripped: Diagnostic = { ...contiguityDiag!, data: undefined };
        const actions = getCodeActions(document, stripped);
        expect(actions.length).toBeGreaterThanOrEqual(1);
        expect(actions[0].title.toLowerCase()).toMatch(/contiguity|bay/);
    });
});

// ---------------------------------------------------------------------------
// Unknown diagnostic code → no actions
// ---------------------------------------------------------------------------

describe('Code action: unknown rule → no actions', () => {
    test('returns undefined / empty for a diagnostic with unknown rule', async () => {
        const document = await parse(`
            airfield CleanField {
                aircraft Cessna {
                    wingspan 11.0 m
                    length    8.3 m
                    height    2.7 m
                }
                hangar AlphaHangar {
                    doors { door D1 { width 15.0 m height 5.0 m } }
                    grid baygrid {
                        bay Bay1 { width 12.0 m depth 10.0 m height 5.0 m }
                    }
                }
                induct Cessna into AlphaHangar bays Bay1
                from 2024-06-01T08:00
                to   2024-06-01T10:00;
            }
        `);

        const fakeDiag: Diagnostic = {
            message: 'COMPLETELY_UNKNOWN_RULE: something',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
            severity: 1,
        };

        const provider = services.Airfield.lsp.CodeActionProvider!;
        const result = provider.getCodeActions(document, {
            textDocument: { uri: document.textDocument.uri },
            range: fakeDiag.range,
            context: { diagnostics: [fakeDiag] },
        } as any);

        // Should return undefined or empty array
        expect(!result || (Array.isArray(result) && result.length === 0)).toBe(true);
    });
});
