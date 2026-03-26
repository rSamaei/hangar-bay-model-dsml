/**
 * Extended unit tests for backend/services/document-parser.ts
 *
 * Covers the lexer-error branch (lines 42–48): invalid characters in the DSL
 * that the Langium lexer cannot tokenise produce entries in `parseErrors`
 * with `line` and `column` fields populated.
 */
import { describe, expect, test } from 'vitest';
import { parseDocument } from '../../../backend/services/document-parser.js';

/** DSL containing characters that Langium's lexer cannot tokenise (@@@). */
const DSL_LEXER_ERROR = `airfield @@@InvalidChars { }`;

describe('parseDocument — lexer error', () => {
  test('hasParseErrors is true when the DSL contains illegal characters', async () => {
    const result = await parseDocument(DSL_LEXER_ERROR);
    expect(result.hasParseErrors).toBe(true);
  });

  test('parseErrors is non-empty for a DSL with lexer errors', async () => {
    const result = await parseDocument(DSL_LEXER_ERROR);
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  test('lexer error entry has a message string', async () => {
    const result = await parseDocument(DSL_LEXER_ERROR);
    const entry = result.parseErrors[0];
    expect(typeof entry.message).toBe('string');
    expect(entry.message.length).toBeGreaterThan(0);
  });

  test('lexer error entry has a line number', async () => {
    const result = await parseDocument(DSL_LEXER_ERROR);
    const lexerErrors = result.parseErrors.filter(e => e.line !== undefined);
    expect(lexerErrors.length).toBeGreaterThan(0);
    expect(typeof lexerErrors[0].line).toBe('number');
  });

  test('lexer error entry has a column number', async () => {
    const result = await parseDocument(DSL_LEXER_ERROR);
    const lexerErrors = result.parseErrors.filter(e => e.column !== undefined);
    expect(lexerErrors.length).toBeGreaterThan(0);
    expect(typeof lexerErrors[0].column).toBe('number');
  });
});
