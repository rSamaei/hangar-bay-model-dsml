import { Router } from 'express';
import { parseCode } from '../services/document-parser.js';
import { serializeModel } from '../serializers/model-serializer.js';

export const parseRouter = Router();

interface ParseRequestBody {
  code: string;
}

parseRouter.post('/parse', async (req: any, res: any) => {
  try {
    const { code } = req.body as ParseRequestBody;
    
    const { model, document } = await parseCode(code);
    
    const diagnostics = (document.diagnostics || []).map(d => ({
      severity: d.severity,
      message: d.message,
      line: d.range.start.line + 1
    }));
    
    res.json({
      success: true,
      model: serializeModel(model),
      diagnostics
    });
    
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});