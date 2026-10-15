// Workflow 2 (7-day moving average + DENSE_RANK) and the materialized view summary.
// The CTEs below are the same ones as sql/06_window_analytics.sql.
import { Router } from 'express';
import { pool } from '../db.js';
import { paging, pageResult } from '../paging.js';

const r = Router();

const MOVING_CTE = `
  daily_revenue AS (
    SELECT freelancer_id, completed_at::date AS revenue_day, SUM(budget) AS daily_revenue
      FROM contracts WHERE status = 'COMPLETED' AND completed_at IS NOT NULL
     GROUP BY freelancer_id, completed_at::date
  ), moving AS (
    SELECT freelancer_id, revenue_day, daily_revenue,
           -- total revenue in the 7-day window / 7 (days without revenue count as zero)
           SUM(daily_revenue) OVER (PARTITION BY freelancer_id ORDER BY revenue_day
                                    RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW) / 7.0 AS moving_avg_7d
      FROM daily_revenue
  )`;

const RANKING_SQL = `
  WITH ${MOVING_CTE}, latest AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY freelancer_id ORDER BY revenue_day DESC) rn FROM moving
  ), ranked AS (
    SELECT freelancer_id, revenue_day, ROUND(moving_avg_7d, 2) AS moving_average_7d,
           DENSE_RANK() OVER (ORDER BY ROUND(moving_avg_7d, 2) DESC) AS freelancer_rank
      FROM latest WHERE rn = 1
  )`;

// GET /api/analytics/ranking?page=&limit=
r.get('/ranking', async (req, res) => {
  const p = paging(req.query);
  const { rows } = await pool.query(
    `${RANKING_SQL}
     SELECT r.*, f.name, COUNT(*) OVER () AS total
       FROM ranked r JOIN freelancers f ON f.id = r.freelancer_id
      ORDER BY r.freelancer_rank, f.name
      LIMIT ${p.limit} OFFSET ${p.offset}`);
  const total = rows[0]?.total ?? 0;
  res.json(pageResult(rows.map(({ total, ...x }) => x), total, p));
});

// GET /api/analytics/moving-average?freelancer_ids=a,b,c
// No ids given -> the top 3 freelancers from the ranking.
r.get('/moving-average', async (req, res) => {
  let ids = (req.query.freelancer_ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
  if (!ids.length) {
    const { rows } = await pool.query(`${RANKING_SQL} SELECT freelancer_id FROM ranked ORDER BY freelancer_rank, freelancer_id LIMIT 3`);
    ids = rows.map(x => x.freelancer_id);
  }
  const { rows } = await pool.query(
    `WITH ${MOVING_CTE}
     SELECT m.freelancer_id, f.name, m.revenue_day, m.daily_revenue, ROUND(m.moving_avg_7d, 2) AS moving_average_7d
       FROM moving m JOIN freelancers f ON f.id = m.freelancer_id
      WHERE m.freelancer_id = ANY($1::uuid[])
      ORDER BY m.revenue_day`, [ids]);
  const series = ids.map(id => {
    const points = rows.filter(x => x.freelancer_id === id);
    return { freelancer_id: id, name: points[0]?.name ?? null,
             points: points.map(({ revenue_day, daily_revenue, moving_average_7d }) => ({ revenue_day, daily_revenue, moving_average_7d })) };
  });
  res.json({ series });
});

// GET /api/analytics/summary   (reads the materialized view)
r.get('/summary', async (_req, res) => {
  const [totals, top, refreshed] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS freelancers,
                       COUNT(*) FILTER (WHERE completed_contracts > 0) AS freelancers_with_work,
                       COALESCE(SUM(completed_contracts), 0) AS completed_contracts,
                       COALESCE(SUM(total_earnings), 0) AS total_earnings,
                       ROUND(COALESCE(AVG(total_earnings), 0), 2) AS avg_earnings
                  FROM freelancer_lifetime_stats`),
    pool.query(`SELECT freelancer_id, name, completed_contracts, total_earnings
                  FROM freelancer_lifetime_stats ORDER BY total_earnings DESC LIMIT 10`),
    pool.query(`SELECT MAX(refreshed_at) AS last_refreshed FROM mv_refresh_log WHERE view_name = 'freelancer_lifetime_stats'`),
  ]);
  res.json({ ...totals.rows[0], top_earners: top.rows, last_refreshed: refreshed.rows[0].last_refreshed });
});

// POST /api/analytics/refresh
r.post('/refresh', async (_req, res) => {
  const t0 = Date.now();
  await pool.query('CALL refresh_freelancer_lifetime_stats()');
  const { rows } = await pool.query(`SELECT MAX(refreshed_at) AS last_refreshed FROM mv_refresh_log`);
  res.json({ last_refreshed: rows[0].last_refreshed, took_ms: Date.now() - t0 });
});

export default r;
