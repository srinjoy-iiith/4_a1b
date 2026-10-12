import 'dotenv/config';            // loads api/.env into process.env
import { app } from './app.js';
import { startSimulator } from './simulator.js';

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`GigTask API on http://localhost:${port}`));

if (process.env.SIMULATE_PINGS !== 'false') {
  startSimulator({ intervalMs: Number(process.env.PING_INTERVAL_MS) || 5000 })
    .catch(e => console.error('Ping simulator not started:', e.message));
}
