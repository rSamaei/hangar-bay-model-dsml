import express from 'express';
import cors from 'cors';
import { createAirfieldServices } from '../language/out/airfield-module.js';
import { simulate } from '../simulator/out/engine.js';
import { AutoScheduler } from '../simulator/out/scheduler.js';
import { NodeFileSystem } from 'langium/node';
import { URI } from 'langium';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const services = createAirfieldServices(NodeFileSystem).Airfield;

// Parse and validate airfield model
app.post('/api/parse', async (req, res) => {
  try {
    const { code } = req.body;
    
    console.log('Received code:', code);
    
    // Create in-memory document with proper URI including .air extension
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
      code,
      URI.parse('file:///temp.air')
    );
    
    console.log('Document created');
    
    // Build the document
    await services.shared.workspace.DocumentBuilder.build([document]);
    
    console.log('Document built');
    
    const model = document.parseResult?.value;
    
    console.log('Model:', model);
    
    if (!model) {
      return res.status(400).json({ 
        success: false,
        error: 'Failed to parse document',
        diagnostics: []
      });
    }
    
    const diagnostics = document.diagnostics || [];
    
    const response = {
      success: true,
      model: {
        name: model.name || 'Unknown',
        aircraftTypes: (model.aircraftTypes || []).map(ac => ({
          name: ac.name,
          wingspan: ac.wingspan,
          length: ac.length,
          height: ac.height
        })),
        hangars: (model.hangars || []).map(h => ({
          name: h.name,
          bays: h.bays,
          bayWidth: h.bayWidth,
          bayDepth: h.bayDepth,
          height: h.height
        })),
        inductions: (model.inductions || []).map(ind => ({
          aircraft: ind.aircraft?.ref?.name || 'unknown',
          hangar: ind.hangar?.ref?.name || 'unknown',
          fromBay: ind.fromBay,
          toBay: ind.toBay,
          start: ind.start,
          duration: ind.duration
        })),
        autoInductions: (model.autoInductions || []).map(auto => ({
          aircraft: auto.aircraft?.ref?.name || 'unknown',
          duration: auto.duration,
          preferredHangar: auto.preferredHangar?.ref?.name || null
        }))
      },
      diagnostics: diagnostics.map(d => ({
        severity: d.severity,
        message: d.message,
        line: d.range.start.line + 1
      }))
    };
    
    console.log('Sending response');
    res.json(response);
    
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Run simulation
app.post('/api/simulate', async (req, res) => {
  try {
    const { code } = req.body;
    
    console.log('Simulating code');
    
    // Create in-memory document with proper URI including .air extension
    const document = services.shared.workspace.LangiumDocumentFactory.fromString(
      code,
      URI.parse('file:///temp.air')
    );
    
    // Build the document
    await services.shared.workspace.DocumentBuilder.build([document]);
    
    const model = document.parseResult?.value;
    
    if (!model) {
      return res.status(400).json({ 
        success: false,
        error: 'Failed to parse document'
      });
    }
    
    // Run scheduler if needed
    let scheduleResult = null;
    if (model.autoInductions && model.autoInductions.length > 0) {
      console.log('Running scheduler...');
      const scheduler = new AutoScheduler();
      scheduleResult = scheduler.schedule(model);
    }
    
    // Run simulation
    console.log('Running simulation...');
    const simResult = simulate(model);
    
    const response = {
      success: true,
      simulation: {
        conflicts: (simResult.conflicts || []).map(c => ({
          time: c.time,
          hangarName: c.hangarName,
          fromBay: c.fromBay,
          toBay: c.toBay,
          aircraft: c.induction?.aircraft?.ref?.name || 'unknown'
        })),
        maxOccupancy: Object.fromEntries(simResult.maxOccupancyPerHangar || new Map()),
        timeline: (simResult.timeline || []).map(t => ({
          time: t.time,
          occupied: Object.fromEntries(
            Object.entries(t.occupied || {}).map(([hangar, bays]) => [
              hangar,
              bays.map((occupied, idx) => ({ bay: idx + 1, occupied }))
            ])
          )
        }))
      },
      scheduling: scheduleResult ? {
        scheduled: (scheduleResult.scheduled || []).map(s => ({
          aircraft: s.aircraft?.name || 'unknown',
          hangar: s.hangar?.name || 'unknown',
          fromBay: s.fromBay,
          toBay: s.toBay,
          start: s.start,
          duration: s.duration
        })),
        unscheduled: (scheduleResult.unscheduled || []).map(u => ({
          aircraft: u.aircraft?.ref?.name || 'unknown',
          duration: u.duration,
          wingspan: u.aircraft?.ref?.wingspan
        }))
      } : null
    };
    
    console.log('Sending simulation response');
    res.json(response);
    
  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});