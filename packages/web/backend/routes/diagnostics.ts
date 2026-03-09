import { Router } from 'express';
import { parseDocument } from '../services/document-parser.js';

const router = Router();

/**
 * POST /api/diagnostics
 *
 * Lightweight endpoint for the Monaco editor's live validation.
 * Always returns HTTP 200 — the diagnostics array IS the payload.
 *
 * Combines Langium parse errors (lexer/parser) and Langium validator
 * diagnostics (SFR rules) into one list, each with Monaco-friendly
 * position info.
 *
 * Column convention in the response:
 *   • `startColumn` and `endColumn` are **0-based** so the frontend
 *     can apply a uniform `+ 1` to get Monaco's 1-based columns.
 */
router.post('/diagnostics', async (req, res) => {
  const { dslCode } = req.body ?? {};

  if (!dslCode || typeof dslCode !== 'string') {
    return res.json({ diagnostics: [] });
  }

  try {
    const result = await parseDocument(dslCode);

    // --- Parse errors (chevrotain) ------------------------------------------
    // Chevrotain reports columns as 1-based, so normalise to 0-based here so
    // the frontend can use a single `column + 1` mapping for Monaco.
    const parseItems = result.parseErrors.map(e => ({
      severity: e.severity ?? 1,
      message:  e.message,
      startLine:   e.line   ?? 1,
      startColumn: e.column !== undefined ? Math.max(0, e.column - 1) : 0,
      endLine:     e.line   ?? 1,
      endColumn:   e.column !== undefined ? Math.max(0, e.column)     : 1,
      source: 'parser' as const,
    }));

    // --- Langium validation diagnostics (SFR rules) --------------------------
    // document-parser.ts stores line as 1-based and column as 0-based (raw LSP
    // character value), so no adjustment is needed here.
    const validateItems = result.validationDiagnostics.map(e => ({
      severity:    e.severity ?? 1,
      message:     e.message,
      startLine:   e.line    ?? 1,
      startColumn: e.column  ?? 0,
      endLine:     e.endLine ?? e.line ?? 1,
      endColumn:   e.endColumn !== undefined ? e.endColumn : (e.column ?? 0) + 1,
      source: 'validator' as const,
    }));

    res.json({ diagnostics: [...parseItems, ...validateItems] });

  } catch (error) {
    console.error('[/api/diagnostics] error:', error);
    // Return empty diagnostics rather than a 500 — the editor should keep working.
    res.json({ diagnostics: [] });
  }
});

export default router;
