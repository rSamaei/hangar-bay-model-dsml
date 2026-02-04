import { Router } from 'express';
import { parseDocument } from '../services/document-parser.js';
import { buildValidationReport } from '@airfield/simulator';

const router = Router();

/**
 * POST /validate
 * 
 * Validates a DSL model and returns structured validation report
 * 
 * Request body: { dslCode: string }
 * Response: ValidationReport
 */
router.post('/validate', async (req, res) => {
    try {
        const { dslCode } = req.body;
        
        if (!dslCode) {
            return res.status(400).json({ 
                error: 'Missing dslCode in request body' 
            });
        }
        
        // Parse the document
        const parseResult = await parseDocument(dslCode);
        
        if (!parseResult.model || parseResult.hasParseErrors) {
            return res.status(400).json({
                error: 'Failed to parse DSL',
                parseErrors: parseResult.parseErrors
            });
        }
        
        // Build validation report
        const report = buildValidationReport(parseResult.model);
        
        res.json(report);
        
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({ 
            error: 'Internal server error during validation',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router;