/**
 * Unit tests for backend/services/document-parser.ts
 *
 * parseDocument(code) parses a DSL string using Langium's NodeFileSystem
 * services and returns a ParsedDocument with separate parse errors (fatal)
 * and validation diagnostics (non-fatal).
 *
 * Covers:
 *   - Valid DSL → hasParseErrors=false, model is not null
 *   - Valid DSL → model.name matches airfield name
 *   - DSL with syntax error → hasParseErrors=true, parseErrors is non-empty
 *   - Empty string → hasParseErrors=true (no parse result)
 *   - Valid DSL with validation diagnostic → hasParseErrors=false,
 *     validationDiagnostics contains the rule-code string
 */
import { describe, expect, test } from 'vitest';
import { parseDocument } from '../../../backend/services/document-parser.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A minimal, diagnostics-free airfield model.
 * Cessna (11 m) fits door (15 m), fits Bay1 (12 m), 1 bay assigned = 1 required.
 */
const VALID_DSL = `
airfield CleanField {
    aircraft Cessna {
        wingspan 11.0 m
        length    8.3 m
        height    2.7 m
    }
    hangar AlphaHangar {
        doors {
            door MainDoor {
                width  15.0 m
                height  5.0 m
            }
        }
        grid baygrid {
            bay Bay1 {
                width  12.0 m
                depth  10.0 m
                height  5.0 m
            }
        }
    }
    induct Cessna into AlphaHangar bays Bay1
        from 2024-06-01T08:00
        to   2024-06-01T10:00;
}
`;

/**
 * DSL with a zero wingspan → fires SFR25_DIMENSIONS (severity=1).
 * This is a validation diagnostic, NOT a parse error — the DSL is syntactically valid.
 */
const DSL_WITH_VALIDATION_DIAG = `
airfield ValidationErrorField {
    aircraft BadPlane {
        wingspan 0.0 m
        length   8.3 m
        height   2.7 m
    }
}
`;

/** Syntactically invalid: missing airfield name before '{'. */
const DSL_SYNTAX_ERROR = `airfield {
    aircraft Cessna { wingspan 11.0 m length 8.3 m height 2.7 m }
}`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseDocument — valid DSL', () => {
    test('hasParseErrors is false for a clean model', async () => {
        const result = await parseDocument(VALID_DSL);
        expect(result.hasParseErrors).toBe(false);
    });

    test('model is not null for a clean model', async () => {
        const result = await parseDocument(VALID_DSL);
        expect(result.model).not.toBeNull();
    });

    test('model name matches the airfield name in the DSL', async () => {
        const result = await parseDocument(VALID_DSL);
        expect(result.model?.name).toBe('CleanField');
    });

    test('parseErrors array is empty for a clean model', async () => {
        const result = await parseDocument(VALID_DSL);
        expect(result.parseErrors).toHaveLength(0);
    });
});

describe('parseDocument — syntax error', () => {
    test('hasParseErrors is true when the DSL has a syntax error', async () => {
        const result = await parseDocument(DSL_SYNTAX_ERROR);
        expect(result.hasParseErrors).toBe(true);
    });

    test('parseErrors is non-empty when the DSL has a syntax error', async () => {
        const result = await parseDocument(DSL_SYNTAX_ERROR);
        expect(result.parseErrors.length).toBeGreaterThan(0);
    });
});

describe('parseDocument — empty string', () => {
    test('hasParseErrors is true for empty input', async () => {
        const result = await parseDocument('');
        expect(result.hasParseErrors).toBe(true);
    });
});

describe('parseDocument — validation diagnostic', () => {
    test('hasParseErrors is false for a model with only validation errors', async () => {
        const result = await parseDocument(DSL_WITH_VALIDATION_DIAG);
        // The DSL is syntactically valid — no parse error
        expect(result.hasParseErrors).toBe(false);
    });

    test('validationDiagnostics contains the SFR20 rule code', async () => {
        const result = await parseDocument(DSL_WITH_VALIDATION_DIAG);
        const hasSfr20 = result.validationDiagnostics.some(
            d => typeof d.message === 'string' && d.message.includes('SFR25_DIMENSIONS')
        );
        expect(hasSfr20).toBe(true);
    });
});
