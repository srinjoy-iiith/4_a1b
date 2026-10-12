// The Express app: wires the routes together. server.js starts it; tests import it directly.
import express from 'express';
import cors from 'cors';
import { pool, mongo } from './db.js';
import { errorHandler } from './errors.js';
import clients from './routes/clients.js';
import freelancers from './routes/freelancers.js';
import contracts from './routes/contracts.js';
import analytics from './routes/analytics.js';
import map from './routes/map.js';
import reviews, { portfolios } from './routes/reviews.js';

export const app = express();
app.use(cors());              // allow the web app (another port) to call this API
app.use(express.json());      // parse JSON request bodies into req.body

app.get('/api/health', async (_req, res) => {
  const out = { postgres: false, mongo: false };
  try { await pool.query('SELECT 1'); out.postgres = true; } catch { /* reported below */ }
  try { await (await mongo()).command({ ping: 1 }); out.mongo = true; } catch { /* reported below */ }
  res.status(out.postgres && out.mongo ? 200 : 503).json(out);
});

app.use('/api/clients', clients);
app.use('/api/freelancers', freelancers);
app.use('/api/contracts', contracts);
app.use('/api/analytics', analytics);
app.use('/api/map', map);
app.use('/api/reviews', reviews);
app.use('/api/portfolios', portfolios);

app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such API endpoint.' } }));
app.use(errorHandler);
