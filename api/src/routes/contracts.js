// Contracts: browse, detail, Workflow 1 (fund a gig) and status changes.
import { Router } from 'express';
import { pool } from '../db.js';
import { paging, pageResult } from '../paging.js';
import { ApiError } from '../errors.js';

const r = Router();
const STATUSES = ['FUNDED', 'IN PROGRESS', 'COMPLETED'];
const SELECT = `
  SELECT k.id, k.status, k.budget, k.created_at, k.completed_at,
         k.client_id, c.name AS client_name, k.freelancer_id, f.name AS freelancer_name
    FROM contracts k JOIN clients c ON c.id = k.client_id JOIN freelancers f ON f.id = k.freelancer_id`;

// GET /api/contracts?status=&client_id=&freelancer_id=&page=&limit=
r.get('/', async (req, res) => {
  const p = paging(req.query);
  const cond = [], args = [];
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw new ApiError(400, 'BAD_INPUT', 'Unknown status.');
    args.push(req.query.status); cond.push(`k.status = $${args.length}`);
  }
  if (req.query.client_id) { args.push(req.query.client_id); cond.push(`k.client_id = $${args.length}`); }
  if (req.query.freelancer_id) { args.push(req.query.freelancer_id); cond.push(`k.freelancer_id = $${args.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const { rows: [{ total }] } = await pool.query(`SELECT COUNT(*) AS total FROM contracts k ${where}`, args);
  const { rows } = await pool.query(`${SELECT} ${where} ORDER BY k.created_at DESC, k.id LIMIT ${p.limit} OFFSET ${p.offset}`, args);
  res.json(pageResult(rows, total, p));
});

// GET /api/contracts/:id
r.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${SELECT} WHERE k.id = $1`, [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Contract not found.');
  res.json(rows[0]);
});

// POST /api/contracts/fund  { client_id, freelancer_id, budget }
// Workflow 1. All the real work (balance check, debit, insert, audit trigger) happens inside
// the fund_gig stored procedure; the API only reads the "before" and "after" state around it.
r.post('/fund', async (req, res) => {
  const { client_id, freelancer_id } = req.body || {};
  const budget = Number(req.body?.budget);
  if (!client_id || !freelancer_id) throw new ApiError(400, 'BAD_INPUT', 'Choose both a client and a freelancer.');
  if (!(budget > 0)) throw new ApiError(400, 'BAD_INPUT', 'Enter a budget greater than zero.');

  const before = await pool.query('SELECT escrow_balance FROM clients WHERE id = $1', [client_id]);
  if (!before.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Client not found.');

  // CALL returns the INOUT parameter p_contract_id as a one-row result.
  const { rows: [{ p_contract_id: contractId }] } = await pool.query(
    'CALL fund_gig($1::uuid, $2::uuid, $3::numeric, NULL)', [client_id, freelancer_id, budget]);

  const [after, audit, contract] = await Promise.all([
    pool.query('SELECT escrow_balance FROM clients WHERE id = $1', [client_id]),
    pool.query(`SELECT * FROM wallet_audit_logs WHERE client_id = $1 ORDER BY id DESC LIMIT 1`, [client_id]),
    pool.query(`${SELECT} WHERE k.id = $1`, [contractId]),
  ]);
  res.status(201).json({
    contract: contract.rows[0],
    balance_before: before.rows[0].escrow_balance,
    balance_after: after.rows[0].escrow_balance,
    audit_entry: audit.rows[0],
  });
});

// PATCH /api/contracts/:id/status  { status }
r.patch('/:id/status', async (req, res) => {
  const status = req.body?.status;
  if (!STATUSES.includes(status)) throw new ApiError(400, 'BAD_INPUT', 'Unknown status.');
  await pool.query('CALL update_contract_status($1::uuid, $2)', [req.params.id, status]);
  const { rows } = await pool.query(`${SELECT} WHERE k.id = $1`, [req.params.id]);
  res.json(rows[0]);
});

export default r;
