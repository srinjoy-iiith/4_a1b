// Freelancers: browse and detail (detail also pulls the Mongo portfolio and review summary).
import { Router } from 'express';
import { pool, mongo } from '../db.js';
import { paging, pageResult } from '../paging.js';
import { ApiError } from '../errors.js';

const r = Router();

// GET /api/freelancers?search=&available=true|false&busy=true|false&page=&limit=
r.get('/', async (req, res) => {
  const p = paging(req.query);
  const cond = [], args = [];
  if (req.query.search) { args.push(`%${req.query.search.trim()}%`); cond.push(`f.name ILIKE $${args.length}`); }
  if (req.query.available === 'true' || req.query.available === 'false') {
    args.push(req.query.available === 'true'); cond.push(`f.is_available = $${args.length}`);
  }
  const busy = `EXISTS (SELECT 1 FROM contracts k WHERE k.freelancer_id = f.id AND k.status = 'IN PROGRESS')`;
  if (req.query.busy === 'true') cond.push(busy);
  if (req.query.busy === 'false') cond.push(`NOT ${busy}`);
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

  const { rows: [{ total }] } = await pool.query(`SELECT COUNT(*) AS total FROM freelancers f ${where}`, args);
  const { rows } = await pool.query(
    `SELECT f.id, f.name, f.is_available, f.latitude, f.longitude,
            ${busy} AS has_active_gig,
            COALESCE(s.completed_contracts, 0) AS completed_contracts,
            COALESCE(s.total_earnings, 0) AS total_earnings
       FROM freelancers f LEFT JOIN freelancer_lifetime_stats s ON s.freelancer_id = f.id
       ${where}
      ORDER BY f.name, f.id
      LIMIT ${p.limit} OFFSET ${p.offset}`, args);
  res.json(pageResult(rows, total, p));
});

// GET /api/freelancers/:id
r.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT f.id, f.name, f.is_available, f.latitude, f.longitude,
            COALESCE(s.completed_contracts, 0) AS completed_contracts,
            COALESCE(s.total_earnings, 0) AS total_earnings
       FROM freelancers f LEFT JOIN freelancer_lifetime_stats s ON s.freelancer_id = f.id
      WHERE f.id = $1`, [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Freelancer not found.');
  const { rows: active } = await pool.query(
    `SELECT id, budget, created_at FROM contracts WHERE freelancer_id = $1 AND status = 'IN PROGRESS'`, [req.params.id]);

  const db = await mongo();
  const [portfolio, ratings] = await Promise.all([
    db.collection('Portfolios').findOne({ freelancer_id: req.params.id }, { projection: { _id: 0 } }),
    db.collection('GigReviews').aggregate([
      { $match: { freelancer_id: req.params.id } },
      { $group: { _id: null, average_rating: { $avg: '$rating' }, review_count: { $sum: 1 } } },
    ]).toArray(),
  ]);
  res.json({ ...rows[0], active_contract: active[0] || null, portfolio,
             rating: ratings[0] ? { average: ratings[0].average_rating, count: ratings[0].review_count } : null });
});

export default r;
