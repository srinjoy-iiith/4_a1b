// Clients: browse, detail, deposit, and the escrow audit trail.
import { Router } from 'express';
import { pool } from '../db.js';
import { paging, pageResult } from '../paging.js';
import { ApiError } from '../errors.js';

const r = Router();

// GET /api/clients?search=&page=&limit=
r.get('/', async (req, res) => {
  const p = paging(req.query);
  const search = (req.query.search || '').trim();
  const where = search ? 'WHERE c.name ILIKE $1' : '';
  const args = search ? [`%${search}%`] : [];
  const { rows: [{ total }] } = await pool.query(`SELECT COUNT(*) AS total FROM clients c ${where}`, args);
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.escrow_balance,
            (SELECT COUNT(*) FROM contracts k WHERE k.client_id = c.id) AS contract_count
       FROM clients c ${where}
      ORDER BY c.name, c.id
      LIMIT ${p.limit} OFFSET ${p.offset}`, args);
  res.json(pageResult(rows, total, p));
});

// GET /api/clients/:id
r.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.escrow_balance,
            COUNT(k.id) AS contract_count,
            COUNT(k.id) FILTER (WHERE k.status = 'IN PROGRESS') AS active_count,
            COUNT(k.id) FILTER (WHERE k.status = 'COMPLETED') AS completed_count,
            COALESCE(SUM(k.budget), 0) AS total_spent
       FROM clients c LEFT JOIN contracts k ON k.client_id = c.id
      WHERE c.id = $1 GROUP BY c.id`, [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Client not found.');
  res.json(rows[0]);
});

// POST /api/clients/:id/deposit  { amount }
r.post('/:id/deposit', async (req, res) => {
  const amount = Number(req.body?.amount);
  if (!(amount > 0)) throw new ApiError(400, 'BAD_INPUT', 'Enter a deposit amount greater than zero.');
  await pool.query('CALL deposit_escrow($1, $2)', [req.params.id, amount]);
  const { rows } = await pool.query('SELECT id, name, escrow_balance FROM clients WHERE id = $1', [req.params.id]);
  res.json(rows[0]);
});

// GET /api/clients/:id/audit?from=YYYY-MM-DD&to=YYYY-MM-DD&page=&limit=
// Running balance = SUM(amount_changed) over the client's whole history, in time order.
// It is computed over ALL rows first and only then filtered by date, so it stays correct
// even when you look at a date range in the middle.
r.get('/:id/audit', async (req, res) => {
  const p = paging(req.query, 25);
  const { from, to } = req.query;
  const base = `
    WITH history AS (
      SELECT id, amount_changed, action_type, balance_after, created_at,
             SUM(amount_changed) OVER (ORDER BY created_at, id) AS running_balance
        FROM wallet_audit_logs WHERE client_id = $1
    )
    SELECT * FROM history
     WHERE ($2::date IS NULL OR created_at >= $2::date)
       AND ($3::date IS NULL OR created_at < $3::date + 1)`;
  const args = [req.params.id, from || null, to || null];
  const { rows: [summary] } = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(amount_changed) FILTER (WHERE amount_changed > 0), 0) AS money_in,
            COALESCE(-SUM(amount_changed) FILTER (WHERE amount_changed < 0), 0) AS money_out
       FROM (${base}) x`, args);
  const { rows } = await pool.query(`${base} ORDER BY created_at DESC, id DESC LIMIT ${p.limit} OFFSET ${p.offset}`, args);
  res.json({ ...pageResult(rows, summary.total, p), summary });
});

export default r;
