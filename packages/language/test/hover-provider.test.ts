/**
 * Tests for AirfieldHoverProvider.
 *
 * Parses a small .air document and invokes the hover provider at various
 * positions, asserting the markdown content contains expected derived data.
 */
import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import type { Model } from 'airfield-language';
import { createAirfieldServices } from 'airfield-language';
import type { Hover, HoverParams } from 'vscode-languageserver';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let services: ReturnType<typeof createAirfieldServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createAirfieldServices(EmptyFileSystem);
    parse = parseHelper<Model>(services.Airfield);
});

/** Get hover content at a given line/character offset in the document. */
async function hoverAt(doc: LangiumDocument, line: number, character: number): Promise<Hover | undefined> {
    const provider = services.Airfield.lsp.HoverProvider;
    if (!provider) return undefined;
    const params: HoverParams = {
        textDocument: { uri: doc.textDocument.uri },
        position: { line, character }
    };
    return provider.getHoverContent(doc, params);
}

/** Extract the markdown string from a Hover result. */
function md(hover: Hover | undefined): string {
    if (!hover) return '';
    const contents = hover.contents;
    if (typeof contents === 'string') return contents;
    if ('value' in contents) return contents.value;
    return '';
}

/** Find the 0-based line number containing the given substring. */
function lineOf(doc: LangiumDocument, substring: string): number {
    const lines = doc.textDocument.getText().split('\n');
    const idx = lines.findIndex(l => l.includes(substring));
    if (idx === -1) throw new Error(`Substring "${substring}" not found in document`);
    return idx;
}

/** Find the 0-based character offset of a substring within its line. */
function charOf(doc: LangiumDocument, substring: string): number {
    const lines = doc.textDocument.getText().split('\n');
    const line = lines.find(l => l.includes(substring));
    if (!line) throw new Error(`Substring "${substring}" not found in document`);
    return line.indexOf(substring);
}

// ---------------------------------------------------------------------------
// Fixture: a small airfield model with clearance, 2-bay hangar, induction
// ---------------------------------------------------------------------------

const DSL = `
    airfield TestAirfield

    clearance StdClearance {
        lateralMargin 1.0 m
        longitudinalMargin 0.5 m
        verticalMargin 0.3 m
    }

    aircraft Cessna {
        wingspan 11.0 m
        length   8.3 m
        height   2.7 m
        clearance StdClearance
    }

    hangar Alpha {
        doors { door D1 { width 15.0 m  height 5.0 m } }
        grid baygrid {
            bay B1 { width 12.0 m  depth 15.0 m  height 5.0 m
                adjacent { B2 }
            }
            bay B2 { width 12.0 m  depth 15.0 m  height 5.0 m
                adjacent { B1 }
            }
        }
    }

    induct id "IND001" Cessna into Alpha bays B1 B2
        clearance StdClearance
        from 2025-06-01T08:00 to 2025-06-14T08:00;
`;

// ---------------------------------------------------------------------------
// Induction hover
// ---------------------------------------------------------------------------
describe('Induction hover', () => {
    test('shows effective dimensions with clearance applied', async () => {
        const doc = await parse(DSL);
        const line = lineOf(doc, 'induct id "IND001"');
        const col = charOf(doc, 'induct id "IND001"');
        const hover = await hoverAt(doc, line, col + 1);
        const content = md(hover);

        // Effective wingspan = 11 + 1 = 12
        // Effective length   = 8.3 + 0.5 = 8.8
        // Effective height   = 2.7 + 0.3 = 3
        expect(content).toContain('12');
        expect(content).toContain('8.8');
        expect(content).toContain('Cessna');
    });

    test('shows bays required count', async () => {
        const doc = await parse(DSL);
        const line = lineOf(doc, 'induct id "IND001"');
        const col = charOf(doc, 'induct id "IND001"');
        const hover = await hoverAt(doc, line, col + 1);
        const content = md(hover);

        // effective wingspan 12m, bay widths are 12m each → 1 bay required
        expect(content).toContain('required');
    });

    test('shows connectivity status', async () => {
        const doc = await parse(DSL);
        const line = lineOf(doc, 'induct id "IND001"');
        const col = charOf(doc, 'induct id "IND001"');
        const hover = await hoverAt(doc, line, col + 1);
        const content = md(hover);

        // B1 and B2 are explicitly adjacent → connected
        expect(content).toContain('connected');
    });

    test('shows span direction', async () => {
        const doc = await parse(DSL);
        const line = lineOf(doc, 'induct id "IND001"');
        const col = charOf(doc, 'induct id "IND001"');
        const hover = await hoverAt(doc, line, col + 1);
        const content = md(hover);

        // No explicit span → defaults to lateral
        expect(content).toContain('lateral');
    });

    test('shows time window', async () => {
        const doc = await parse(DSL);
        const line = lineOf(doc, 'induct id "IND001"');
        const col = charOf(doc, 'induct id "IND001"');
        const hover = await hoverAt(doc, line, col + 1);
        const content = md(hover);

        expect(content).toContain('2025-06-01');
        expect(content).toContain('2025-06-14');
    });
});

// ---------------------------------------------------------------------------
// Aircraft hover
// ---------------------------------------------------------------------------
describe('Aircraft hover', () => {
    test('shows raw dimensions and default clearance', async () => {
        const doc = await parse(DSL);
        const line = lineOf(doc, 'aircraft Cessna');
        const col = charOf(doc, 'Cessna');
        const hover = await hoverAt(doc, line, col + 1);
        const content = md(hover);

        expect(content).toContain('Cessna');
        expect(content).toContain('11');
        expect(content).toContain('StdClearance');
    });
});

// ---------------------------------------------------------------------------
// Bay hover
// ---------------------------------------------------------------------------
describe('Bay hover', () => {
    test('shows bay dimensions', async () => {
        const doc = await parse(DSL);
        const line = lineOf(doc, 'bay B1');
        const col = charOf(doc, 'B1');
        const hover = await hoverAt(doc, line, col);
        const content = md(hover);

        expect(content).toContain('B1');
        expect(content).toContain('12');
        expect(content).toContain('15');
    });
});

// ---------------------------------------------------------------------------
// Clearance hover
// ---------------------------------------------------------------------------
describe('Clearance hover', () => {
    test('shows per-axis margins', async () => {
        const doc = await parse(DSL);
        const line = lineOf(doc, 'clearance StdClearance');
        const col = charOf(doc, 'StdClearance');
        const hover = await hoverAt(doc, line, col + 1);
        const content = md(hover);

        expect(content).toContain('Lateral');
        expect(content).toContain('Longitudinal');
        expect(content).toContain('Vertical');
    });
});
