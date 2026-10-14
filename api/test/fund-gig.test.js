// Integration tests for Workflow 1 (fund_gig) through the real API and a real, seeded Postgres.
// Run: cd api && npm test     (needs the database running and seeded)
// Each test picks fresh rows, and we clean up the contracts we create at the end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { pool, closeAll } from '../src/db.js';

let server, base;
const created = [];

before(async () => {
  server = app.listen(0);                                   // random free port
  base = `http://localhost:${server.address().port}/api`;
});

after(async () => {
  // Undo our test data: give the money back and delete the contracts we made.
  for (const { id, client, budget } of created) {
    await pool.query('DELETE FROM contracts WHERE id = $1', [id]);
    await pool.query('CALL deposit_escrow($1, $2)', [client, budget]);
  }
  server.close();
  await closeAll();
});

const post = (path, body) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then(async r => ({ status: r.status, body: await r.json() }));

async function richClient() {
  const { rows } = await pool.query('SELECT id, escrow_balance FROM clients WHERE escrow_balance > 1000 ORDER BY random() LIMIT 1');
  return rows[0];
}
async function freeFreelancer() {
  const { rows } = await pool.query(`SELECT id FROM freelancers f WHERE NOT EXISTS
    (SELECT 1 FROM contracts c WHERE c.freelancer_id = f.id AND c.status = 'IN PROGRESS') ORDER BY random() LIMIT 1`);
  return rows[0].id;
}

test('funding succeeds: balance goes down by the budget and the trigger writes an audit row', async () => {
  const client = await richClient();
  const freelancer = await freeFreelancer();
  const r = await post('/contracts/fund', { client_id: client.id, freelancer_id: freelancer, budget: 123.45 });
  assert.equal(r.status, 201);
  created.push({ id: r.body.contract.id, client: client.id, budget: 123.45 });

  assert.equal(r.body.contract.status, 'IN PROGRESS');
  assert.equal(r.body.balance_before, client.escrow_balance);
  assert.equal(Math.round((r.body.balance_before - r.body.balance_after) * 100), 12345);
  assert.equal(r.body.audit_entry.action_type, 'GIG_FUNDED');
  assert.equal(r.body.audit_entry.amount_changed, -123.45);
  assert.equal(r.body.audit_entry.balance_after, r.body.balance_after);
});

test('insufficient balance: friendly error and nothing changes', async () => {
  const client = await richClient();
  const freelancer = await freeFreelancer();
  const before = (await pool.query('SELECT COUNT(*) n FROM wallet_audit_logs WHERE client_id = $1', [client.id])).rows[0].n;

  const r = await post('/contracts/fund', { client_id: client.id, freelancer_id: freelancer, budget: client.escrow_balance + 1 });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, 'INSUFFICIENT_BALANCE');

  const { rows: [after] } = await pool.query('SELECT escrow_balance FROM clients WHERE id = $1', [client.id]);
  assert.equal(after.escrow_balance, client.escrow_balance);
  const afterLogs = (await pool.query('SELECT COUNT(*) n FROM wallet_audit_logs WHERE client_id = $1', [client.id])).rows[0].n;
  assert.equal(afterLogs, before, 'no audit row should be written');
});

test('second active gig for the same freelancer is blocked by the partial unique index, and the debit is rolled back', async () => {
  const client = await richClient();
  const freelancer = await freeFreelancer();
  const first = await post('/contracts/fund', { client_id: client.id, freelancer_id: freelancer, budget: 50 });
  assert.equal(first.status, 201);
  created.push({ id: first.body.contract.id, client: client.id, budget: 50 });

  const second = await post('/contracts/fund', { client_id: client.id, freelancer_id: freelancer, budget: 50 });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'FREELANCER_BUSY');

  const { rows: [now] } = await pool.query('SELECT escrow_balance FROM clients WHERE id = $1', [client.id]);
  assert.equal(now.escrow_balance, first.body.balance_after, 'the second debit must be undone');
});

test('completing the active gig frees the freelancer for a new one', async () => {
  const client = await richClient();
  const freelancer = await freeFreelancer();
  const first = await post('/contracts/fund', { client_id: client.id, freelancer_id: freelancer, budget: 40 });
  created.push({ id: first.body.contract.id, client: client.id, budget: 40 });

  const done = await fetch(`${base}/contracts/${first.body.contract.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }),
  });
  assert.equal(done.status, 200);

  const again = await post('/contracts/fund', { client_id: client.id, freelancer_id: freelancer, budget: 40 });
  assert.equal(again.status, 201);
  created.push({ id: again.body.contract.id, client: client.id, budget: 40 });
});

test('bad input is rejected before touching the database', async () => {
  const r = await post('/contracts/fund', { client_id: 'x', freelancer_id: 'y', budget: -5 });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'BAD_INPUT');
});

test('audit trail running balance matches the balance logged by the trigger', async () => {
  const client = await richClient();
  const res = await fetch(`${base}/clients/${client.id}/audit?limit=100`).then(r => r.json());
  assert.ok(res.data.length > 0);
  for (const row of res.data) assert.equal(Math.round(row.running_balance * 100), Math.round(row.balance_after * 100));
});
