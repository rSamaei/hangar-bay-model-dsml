import { Router } from 'express';
import { parseDocument } from '../services/document-parser.js';
import { transformToDomainModel } from '../services/model-transformer.js';

const router = Router();

router.post('/parse', async (req, res) => {
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

    res.json({
      model: transformToDomainModel(parseResult.model),
      errors: parseResult.parseErrors,
      validationDiagnostics: parseResult.validationDiagnostics
    });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;