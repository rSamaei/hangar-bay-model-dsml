import { Router } from 'express';
import { parseDocument } from '../services/document-parser.js';
import { getLangiumServices } from '../services/langium-services.js';

const router = Router();

/**
 * POST /api/code-actions
 *
 * Given DSL source and a list of diagnostics (from the live validation pass),
 * returns quick-fix code actions that Monaco can apply as workspace edits.
 *
 * Request body:
 *   dslCode    — full DSL source string
 *   diagnostics — array of { message, startLine (1-based), startColumn (0-based) }
 *
 * Response:
 *   actions — array of { title, isPreferred, edits: [{ startLine, startColumn, endLine, endColumn, newText }] }
 *             Positions in edits are 1-based line, 0-based column (so Monaco needs +1 on columns).
 */
router.post('/code-actions', async (req, res) => {
  const { dslCode, diagnostics } = req.body ?? {};

  if (!dslCode || typeof dslCode !== 'string' || !Array.isArray(diagnostics)) {
    return res.json({ actions: [] });
  }

  try {
    const parsed = await parseDocument(dslCode);
    const services = getLangiumServices();
    const provider = services.lsp.CodeActionProvider;
    if (!provider) return res.json({ actions: [] });

    const docUri = parsed.document.textDocument.uri;
    const actions: object[] = [];

    for (const diag of diagnostics) {
      if (!diag.message) continue;

      // Convert from REST format (1-based lines, 0-based chars) to LSP (0-based lines)
      const lspRange = {
        start: { line: Math.max(0, (diag.startLine ?? 1) - 1), character: diag.startColumn ?? 0 },
        end:   { line: Math.max(0, (diag.startLine ?? 1) - 1), character: (diag.startColumn ?? 0) + 1 },
      };

      const params = {
        textDocument: { uri: docUri },
        range: lspRange,
        context: {
          diagnostics: [{ message: diag.message, severity: 1, range: lspRange, data: diag.data }],
          only: undefined,
        },
      };

      const result = await Promise.resolve(provider.getCodeActions(parsed.document, params as any));
      if (!result) continue;

      for (const action of result) {
        // Skip Command objects (they have no edit); only process CodeAction objects
        if (!('edit' in action)) continue;
        const textEdits = (action.edit?.changes ?? {})[docUri] ?? [];
        if (textEdits.length === 0) continue;

        actions.push({
          title: action.title,
          isPreferred: ('isPreferred' in action ? action.isPreferred : false) ?? false,
          edits: textEdits.map(e => ({
            startLine:   e.range.start.line + 1,       // back to 1-based
            startColumn: e.range.start.character,       // keep 0-based
            endLine:     e.range.end.line + 1,
            endColumn:   e.range.end.character,
            newText:     e.newText,
          })),
        });
      }
    }

    res.json({ actions });
  } catch (err) {
    console.error('[/api/code-actions] error:', err);
    res.json({ actions: [] });
  }
});

export default router;
