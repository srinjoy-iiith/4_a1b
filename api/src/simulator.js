// Ping simulator: pretends freelancers' phones are sending their location.
// Every few seconds it inserts a handful of fresh pings into WorkerLocations, near the
// freelancer's home location. Two reasons:
//  1. The TTL index deletes pings older than 2 hours, so without new pings the map would
//     go empty two hours after seeding.
//  2. The Map screen polls the API, so new pings visibly appear without a page reload.
// Turn it off with SIMULATE_PINGS=false.
import { pool, mongo } from './db.js';

const state = { enabled: false, intervalMs: 0, inserted: 0, lastRun: null };
let timer;

export const simulatorStatus = () => ({ ...state });

export async function startSimulator({ intervalMs = 5000, perTick = 25 } = {}) {
  const { rows: freelancers } = await pool.query('SELECT id, latitude, longitude, is_available FROM freelancers');
  if (!freelancers.length) return;
  const db = await mongo();
  Object.assign(state, { enabled: true, intervalMs });

  const tick = async () => {
    try {
      const docs = Array.from({ length: perTick }, () => {
        const f = freelancers[Math.floor(Math.random() * freelancers.length)];
        return {
          freelancer_id: f.id,
          is_available: f.is_available,
          location: { type: 'Point', coordinates: [
            +(Number(f.longitude) + (Math.random() - 0.5) * 0.02).toFixed(6),
            +(Number(f.latitude) + (Math.random() - 0.5) * 0.02).toFixed(6)] },
          created_at: new Date(),
        };
      });
      await db.collection('WorkerLocations').insertMany(docs, { ordered: false });
      state.inserted += docs.length; state.lastRun = new Date();
    } catch (e) {
      console.error('ping simulator:', e.message);
    }
  };
  timer = setInterval(tick, intervalMs);
  timer.unref();     // don't keep the process alive just for this
  console.log(`Ping simulator on: ${perTick} pings every ${intervalMs / 1000}s`);
}

export const stopSimulator = () => { clearInterval(timer); state.enabled = false; };
