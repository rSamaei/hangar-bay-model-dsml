import express from 'express';
import cors from 'cors';
import { parseRouter } from './routes/parse.js';
import { simulateRouter } from './routes/simulate.js';
import exampleModelRouter from './routes/example-model.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api', parseRouter);
app.use('/api', simulateRouter);
app.use('/api', exampleModelRouter);

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});