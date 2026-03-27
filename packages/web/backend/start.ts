import { app, PORT } from './server.js';

app.listen(PORT, () => {
  console.log(`Airfield API server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
