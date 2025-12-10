import { Router } from 'express';
import { parseCode } from '../services/document-parser.js';
import { simulate } from '../../../simulator/out/engine.js';
import { AutoScheduler } from '../../../simulator/out/scheduler.js';
import { serializeSimulation, serializeScheduling } from '../serializers/simulation-serializer.js';

export const simulateRouter = Router();

interface SimulateRequestBody {
  code: string;
}

simulateRouter.post('/simulate', async (req: any, res: any) => {
  try {
    const { code } = req.body as SimulateRequestBody;
    
    const { model } = await parseCode(code);
    
    // Run auto-scheduler if needed
    let scheduleResult = null;
    if (model.autoInductions?.length > 0) {
      const scheduler = new AutoScheduler();
      scheduleResult = scheduler.schedule(model);
    }
    
    // Run simulation
    const simResult = simulate(model);
    
    res.json({
      success: true,
      simulation: serializeSimulation(simResult),
      scheduling: scheduleResult ? serializeScheduling(scheduleResult) : null
    });
    
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});