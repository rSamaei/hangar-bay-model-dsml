import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import parseRoute from './routes/parse.js';
import validateRoute from './routes/validate.js';
import analyseRoute from './routes/analyse.js';
import exportRoute from './routes/export.js';
import authRoute from './routes/auth.js';
import aircraftRoute from './routes/aircraft.js';
import hangarsRoute from './routes/hangars.js';
import schedulingRoute from './routes/scheduling.js';
import diagnosticsRoute from './routes/diagnostics.js';
import codeActionsRoute from './routes/code-actions.js';

// Initialise database
import { getDatabase } from './db/database.js';
getDatabase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api', parseRoute);
app.use('/api', validateRoute);
app.use('/api', analyseRoute);
app.use('/api', exportRoute);
app.use('/api', authRoute);
app.use('/api', aircraftRoute);
app.use('/api', hangarsRoute);
app.use('/api', schedulingRoute);
app.use('/api', diagnosticsRoute);
app.use('/api', codeActionsRoute);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Airfield API is running' });
});

// Serve static files (built frontend)
const clientPath = path.join(__dirname, 'client');
app.use(express.static(clientPath));

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientPath, 'index.html'));
  }
});

export { app, PORT };