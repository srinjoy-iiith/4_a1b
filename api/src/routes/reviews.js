// Workflow 4: review analytics with $facet, plus the flexible Portfolios catalog.
import { Router } from 'express';
import { pool, mongo } from '../db.js';
import { paging, pageResult } from '../paging.js';
import { ApiError } from '../errors.js';

const r = Router();

// GET /api/reviews/summary?freelancer_id=   (optional filter)
// One aggregation, several independent result sets ($facet) computed in a single pass.
r.get('/summary', async (req, res) => {
  const match = req.query.freelancer_id ? [{ $match: { freelancer_id: req.query.freelancer_id } }] : [];
  const db = await mongo();
  const [f] = await db.collection('GigReviews').aggregate([
    ...match,
    { $facet: {
        rating_distribution: [
          { $group: { _id: '$rating', review_count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        top_skill_tags: [
          { $unwind: '$skill_tags' },
          { $group: { _id: '$skill_tags', usage_count: { $sum: 1 }, avg_rating: { $avg: '$rating' } } },
          { $sort: { usage_count: -1, avg_rating: -1 } },
          { $limit: 10 },
        ],
        overall: [
          { $group: { _id: null, average_rating: { $avg: '$rating' }, review_count: { $sum: 1 } } },
        ],
        overall_worker_ratings: [
          { $group: { _id: '$freelancer_id', review_count: { $sum: 1 }, average_rating: { $avg: '$rating' } } },
          { $match: { review_count: { $gte: 5 } } },          // ignore workers with very few reviews
          { $sort: { average_rating: -1, review_count: -1 } },
          { $limit: 10 },
        ],
    } },
  ]).toArray();

  const ids = f.overall_worker_ratings.map(w => w._id);
  const { rows } = ids.length ? await pool.query('SELECT id, name FROM freelancers WHERE id = ANY($1::uuid[])', [ids]) : { rows: [] };
  const names = Object.fromEntries(rows.map(x => [x.id, x.name]));

  // Fill in ratings with zero reviews so the chart always shows 1..5
  const dist = [1, 2, 3, 4, 5].map(n => ({ rating: n, review_count: f.rating_distribution.find(x => x._id === n)?.review_count ?? 0 }));
  res.json({
    overall: f.overall[0] ? { average_rating: f.overall[0].average_rating, review_count: f.overall[0].review_count } : { average_rating: null, review_count: 0 },
    rating_distribution: dist,
    top_skill_tags: f.top_skill_tags.map(t => ({ tag: t._id, usage_count: t.usage_count, avg_rating: t.avg_rating })),
    top_workers: f.overall_worker_ratings.map(w => ({ freelancer_id: w._id, name: names[w._id] ?? 'Unknown', review_count: w.review_count, average_rating: w.average_rating })),
  });
});

// GET /api/reviews?freelancer_id=&page=&limit=   (latest reviews)
r.get('/', async (req, res) => {
  const p = paging(req.query, 10);
  const q = req.query.freelancer_id ? { freelancer_id: req.query.freelancer_id } : {};
  const db = await mongo();
  const col = db.collection('GigReviews');
  const [total, data] = await Promise.all([
    req.query.freelancer_id ? col.countDocuments(q) : col.estimatedDocumentCount(),
    col.find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).skip(p.offset).limit(p.limit).toArray(),
  ]);
  res.json(pageResult(data, total, p));
});

// GET /api/portfolios/:freelancerId  (mounted separately in app.js)
export const portfolios = Router();
portfolios.get('/:freelancerId', async (req, res) => {
  const db = await mongo();
  const doc = await db.collection('Portfolios').findOne({ freelancer_id: req.params.freelancerId }, { projection: { _id: 0 } });
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'This freelancer has no portfolio yet.');
  res.json(doc);
});

export default r;
