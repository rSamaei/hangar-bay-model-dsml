import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

router.get('/example-model', (_req, res) => {
  try {
    const data = readFileSync(resolve(__dirname, '../data/examples.json'), 'utf-8');
    const parsed = JSON.parse(data);
    return res.json({ code: parsed.defaultModel ?? '' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load example model' });
  }
});

export default router;