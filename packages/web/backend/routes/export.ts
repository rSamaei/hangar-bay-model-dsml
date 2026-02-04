import { Router } from 'express';
import { parseDocument } from '../services/document-parser.js';
import { buildExportModel, AutoScheduler } from '@airfield/simulator';
import type { ScheduleResult } from '@airfield/simulator';

const router = Router();

/**
 * POST /export
 * 
 * Exports analysis-ready model with all derived properties
 * 
 * Request body: { dslCode: string, includeSchedule?: boolean }
 * Response: ExportModel
 */
router.post('/export', async (req, res) => {
    try {
        const { dslCode, includeSchedule = false } = req.body;
        
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
        
        // Optionally run scheduler
        let scheduleResult: ScheduleResult | undefined = undefined;
        if (includeSchedule && parseResult.model.autoInductions.length > 0) {
            const scheduler = new AutoScheduler();
            scheduleResult = scheduler.schedule(parseResult.model);
        }

        // Build export model
        const exportModel = buildExportModel(parseResult.model, scheduleResult);
        
        res.json(exportModel);
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ 
            error: 'Internal server error during export',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router;