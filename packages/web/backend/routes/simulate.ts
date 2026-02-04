import { Router } from 'express';
import { parseDocument } from '../services/document-parser.js';
import { AutoScheduler } from '@airfield/simulator';
import type { ScheduleResult } from '@airfield/simulator';
import { serializeSimulationResult } from '../serializers/simulation-serializer.js';

const router = Router();

router.post('/simulate', async (req, res) => {
  try {
    const { dslCode } = req.body;
    
    if (!dslCode) {
      return res.status(400).json({ error: 'Missing dslCode' });
    }

    const parseResult = await parseDocument(dslCode);
    
    if (!parseResult.model || parseResult.hasParseErrors) {
      return res.status(400).json({
        error: 'Failed to parse DSL',
        parseErrors: parseResult.parseErrors
      });
    }

    const model = parseResult.model;
    let scheduleResult: ScheduleResult | undefined = undefined;
    
    if (model.autoInductions?.length > 0) {
      console.log(`Running auto-scheduler for ${model.autoInductions.length} aircraft...`);
      const scheduler = new AutoScheduler();
      scheduleResult = scheduler.schedule(model);
    }

    // Note: You need to implement simulation logic or remove this endpoint
    // For now, returning a placeholder
    res.json({
      message: 'Simulation endpoint - needs implementation',
      scheduledInductions: scheduleResult?.scheduled.length || 0
    });
    
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;