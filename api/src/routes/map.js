// Workflow 3: nearest available workers to a job site, using MongoDB $geoNear.
import { Router } from 'express';
import { pool, mongo } from '../db.js';
import { ApiError } from '../errors.js';
import { simulatorStatus } from '../simulator.js';

const r = Router();

// A few job sites in Hyderabad to pick from. The UI can also use any point clicked on the map.
export const ORIGINS = [
  { id: 'hitec', name: 'HITEC City', lng: 78.3772, lat: 17.4435 },
  { id: 'charminar', name: 'Charminar', lng: 78.4747, lat: 17.3616 },
  { id: 'secunderabad', name: 'Secunderabad Station', lng: 78.5016, lat: 17.4337 },
  { id: 'gachibowli', name: 'Gachibowli', lng: 78.3489, lat: 17.4401 },
  { id: 'banjara', name: 'Banjara Hills', lng: 78.4482, lat: 17.4156 },
];

r.get('/origins', (_req, res) => res.json(ORIGINS));

// GET /api/map/nearby?lng=&lat=&radius=5000&limit=25
r.get('/nearby', async (req, res) => {
  const lng = Number(req.query.lng), lat = Number(req.query.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new ApiError(400, 'BAD_INPUT', 'Pick a job site on the map.');
  const radius = Math.min(Number(req.query.radius) || 5000, 20000);
  const limit = Math.min(Number(req.query.limit) || 25, 100);

  const db = await mongo();
  const [result] = await db.collection('WorkerLocations').aggregate([
    { $geoNear: {                       // must be the first stage; uses the 2dsphere index
        near: { type: 'Point', coordinates: [lng, lat] },
        key: 'location',
        distanceField: 'distanceMeters',
        maxDistance: radius,             // 5 km by default
        spherical: true,
        query: { is_available: true },
    } },
    // A freelancer can have many pings in the last 2 hours. Their current position is their
    // LATEST ping, so sort newest first and keep that one ping's location, distance and time.
    { $sort: { created_at: -1 } },
    { $group: { _id: '$freelancer_id', distanceMeters: { $first: '$distanceMeters' },
                location: { $first: '$location' }, pinged_at: { $first: '$created_at' }, pings: { $sum: 1 } } },
    { $sort: { distanceMeters: 1 } },
    { $facet: {
        workers: [{ $limit: limit }],
        stats: [{ $group: { _id: null, workers_in_radius: { $sum: 1 }, pings_in_radius: { $sum: '$pings' },
                            latest_ping: { $max: '$pinged_at' } } }],
    } },
  ]).toArray();

  // Add names from Postgres (Mongo only stores the freelancer UUID), and whether the worker
  // already has a gig IN PROGRESS (then they can't be funded until it is completed).
  const ids = result.workers.map(w => w._id);
  const { rows } = ids.length
    ? await pool.query(`SELECT f.id, f.name,
                               EXISTS (SELECT 1 FROM contracts k WHERE k.freelancer_id = f.id AND k.status = 'IN PROGRESS') AS has_active_gig
                          FROM freelancers f WHERE f.id = ANY($1::uuid[])`, [ids])
    : { rows: [] };
  const byId = Object.fromEntries(rows.map(x => [x.id, x]));

  res.json({
    origin: { lng, lat }, radius_m: radius,
    stats: result.stats[0] ? { ...result.stats[0], _id: undefined } : { workers_in_radius: 0, pings_in_radius: 0, latest_ping: null },
    workers: result.workers.map(w => ({
      freelancer_id: w._id, name: byId[w._id]?.name ?? 'Unknown freelancer', has_active_gig: !!byId[w._id]?.has_active_gig,
      distance_m: Math.round(w.distanceMeters), lng: w.location.coordinates[0], lat: w.location.coordinates[1],
      pinged_at: w.pinged_at, pings: w.pings,
    })),
    simulator: simulatorStatus(),
  });
});

export default r;
