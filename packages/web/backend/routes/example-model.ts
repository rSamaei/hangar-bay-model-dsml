import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/example', (req, res) => {
    try {
        const examplesPath = path.join(__dirname, '../data/examples.json');
        const examplesData = fs.readFileSync(examplesPath, 'utf-8');
        const examples = JSON.parse(examplesData);
        
        if (examples.examples && examples.examples.length > 0) {
            res.json(examples.examples[0]);
        } else {
            res.status(404).json({ error: 'No examples found' });
        }
    } catch (error) {
        console.error('Error loading example:', error);
        res.status(500).json({ error: 'Failed to load example model' });
    }
});

export default router;