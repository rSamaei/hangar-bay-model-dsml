import { Router } from 'express';
import type { ParsedDocument } from '../services/document-parser.js';
import { parseDocument } from '../services/document-parser.js';
import { analyzeAndSchedule } from '@airfield/simulator';

const router = Router();

/**
 * POST /analyze
 * 
 * Complete model analysis: validation + scheduling + export
 * This is the PRIMARY endpoint the webapp should use.
 * 
 * Request body: { dslCode: string }
 * Response: { report: ValidationReport, exportModel: ExportModel }
 */
router.post('/analyze', async (req, res) => {
    try {
        const { dslCode } = req.body;
        
        if (!dslCode) {
            return res.status(400).json({ 
                error: 'Missing dslCode in request body' 
            });
        }
        
        console.log('[POST /analyze] Parsing DSL...');
        const parseResult: ParsedDocument = await parseDocument(dslCode);

        // Only fail on parse errors (lexer/parser), not validation diagnostics
        if (!parseResult.model || parseResult.hasParseErrors) {
            console.log('[POST /analyze] Parse failed');
            return res.status(400).json({
                error: 'Failed to parse DSL',
                parseErrors: parseResult.parseErrors
            });
        }

        console.log('[POST /analyze] Running analysis...');
        const result = analyzeAndSchedule(parseResult.model);

        // Include Langium validation diagnostics in the response
        // These will be shown alongside simulator violations in the UI
        const response = {
            ...result,
            langiumDiagnostics: parseResult.validationDiagnostics
        };

        console.log('[POST /analyze] Analysis complete, sending response');
        res.json(response);
        
    } catch (error) {
        console.error('[POST /analyze] Error:', error);
        res.status(500).json({ 
            error: 'Internal server error during analysis',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router;