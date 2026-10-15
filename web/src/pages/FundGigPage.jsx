// Workflow 1: fund a gig.
// The form calls POST /api/contracts/fund, which runs the fund_gig stored procedure.
// On success we show the balance before/after and the new wallet_audit_logs row written by the trigger.
// On failure (not enough escrow, or freelancer already busy) we explain what went wrong.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, dateTime } from '../api.js';
import { useApi } from '../useApi.js';
import { useActor } from '../context/ActorContext.jsx';
import { PageHeader, Card, Button, Alert, Field, Stat, Badge } from '../components/ui.jsx';
import { EntityPicker } from '../components/EntityPicker.jsx';
import { AsyncView, Empty } from '../components/states.jsx';

const ERROR_TITLES = {
  INSUFFICIENT_BALANCE: 'Not enough money in escrow',
  FREELANCER_BUSY: 'Freelancer already has a gig in progress',
  BAD_INPUT: 'Please check the form',
  NOT_FOUND: 'Not found',
};

export default function FundGigPage() {
  const { actor, setActor } = useActor();
  const [params] = useSearchParams();
  const [freelancer, setFreelancer] = useState(null);
  const [budget, setBudget] = useState('500');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [deposit, setDeposit] = useState('1000');

  // Always show the client's live balance (the top-bar copy can be out of date)
  const client = useApi(() => (actor ? api(`/clients/${actor.id}`) : Promise.resolve(null)), [actor?.id]);

  // A result or error describes one attempt; clear it when the client or freelancer changes
  useEffect(() => { setResult(null); setError(null); }, [actor?.id, freelancer?.id]);

  // Coming from a freelancer page with ?freelancer=<id>
  useEffect(() => {
    const fid = params.get('freelancer');
    if (fid) api(`/freelancers/${fid}`).then(f => setFreelancer({ ...f, has_active_gig: !!f.active_contract })).catch(() => {});
  }, [params]);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true); setResult(null); setError(null);
    try {
      const r = await api('/contracts/fund', { method: 'POST', body: { client_id: actor.id, freelancer_id: freelancer?.id, budget: Number(budget) } });
      setResult(r);
      setActor({ ...actor, escrow_balance: r.balance_after });
      setFreelancer(f => ({ ...f, has_active_gig: true }));
      client.reload({ quiet: true });
    } catch (err) {
      setError(err);
    } finally { setSubmitting(false); }
  }

  async function addFunds() {
    setError(null);
    try {
      const c = await api(`/clients/${actor.id}/deposit`, { method: 'POST', body: { amount: Number(deposit) } });
      setActor({ ...actor, escrow_balance: c.escrow_balance });
      client.reload({ quiet: true });
    } catch (err) { setError(err); }
  }

  if (!actor) return <Card><Empty title="Choose a client first" text="Use “Acting as” in the top bar to pick which client is funding the gig." /></Card>;

  return (
    <div className="stack">
      <PageHeader title="Fund a gig" subtitle="Move money from the client's escrow into a new contract. Runs the fund_gig stored procedure." />
      <div className="grid grid-2">
        <Card title="New gig">
          <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
            <Field label="Client (you)" hint="Change it with “Acting as” in the top bar.">
              <AsyncView state={client}>
                {c => <div className="row"><strong>{c.name}</strong><span className="spacer" /><span>Balance <strong>{money(c.escrow_balance)}</strong></span></div>}
              </AsyncView>
            </Field>
            <Field label="Freelancer" hint="Freelancers marked “busy” already have a gig in progress — funding them will fail.">
              <EntityPicker kind="freelancers" value={freelancer} onChange={setFreelancer} ariaLabel="Choose freelancer" />
              {freelancer && (
                <div className="row" style={{ marginTop: 4 }}>
                  Selected: <Link to={`/freelancers/${freelancer.id}`}>{freelancer.name}</Link>
                  {freelancer.has_active_gig ? <Badge tone="red">busy</Badge> : <Badge tone="completed">free</Badge>}
                </div>
              )}
            </Field>
            <Field label="Budget (₹)">
              <input className="input" type="number" min="1" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} aria-label="Budget" />
            </Field>
            <div className="row">
              <Button type="submit" disabled={submitting || !freelancer}>{submitting ? 'Funding…' : 'Fund gig'}</Button>
              {!freelancer && <span className="muted">Pick a freelancer first</span>}
            </div>
          </form>
        </Card>

        <div className="stack">
          {error && (
            <Alert type="error" title={ERROR_TITLES[error.code] || 'Funding failed'}>
              {error.message}
              {error.code === 'INSUFFICIENT_BALANCE' && error.detail && <div className="mono" style={{ marginTop: 4 }}>{error.detail}</div>}
              <div style={{ marginTop: 6, fontSize: 12 }}>Nothing was charged — the whole transaction was rolled back.</div>
            </Alert>
          )}
          {result && <FundResult r={result} />}
          {!error && !result && (
            <Card><Empty title="No gig funded yet" text="Fill in the form. The result, balance change and audit entry will show here." /></Card>
          )}
          <Card title="Top up escrow">
            <div className="row">
              <input className="input" type="number" min="1" value={deposit} onChange={e => setDeposit(e.target.value)} aria-label="Deposit amount" style={{ width: 140 }} />
              <Button variant="secondary" onClick={addFunds}>Deposit</Button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Calls the deposit_escrow procedure; the trigger logs a DEPOSIT entry.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FundResult({ r }) {
  const a = r.audit_entry;
  return (
    <>
      <Alert type="success" title="Gig funded">
        Contract <Link to={`/contracts/${r.contract.id}`} className="mono">{r.contract.id.slice(0, 8)}</Link> with {r.contract.freelancer_name} is now <strong>{r.contract.status}</strong>.
      </Alert>
      <div className="grid grid-2">
        <Stat label="Balance before" value={money(r.balance_before)} />
        <Stat label="Balance after" value={money(r.balance_after)} tone="out" hint={`−${money(r.balance_before - r.balance_after)}`} />
      </div>
      <Card title="New audit log entry (written by the trigger)">
        <dl className="kv">
          <dt>Log id</dt><dd className="mono">{a.id}</dd>
          <dt>Action</dt><dd>{a.action_type}</dd>
          <dt>Amount</dt><dd className="money-out">{money(a.amount_changed)}</dd>
          <dt>Balance after</dt><dd>{money(a.balance_after)}</dd>
          <dt>Time</dt><dd>{dateTime(a.created_at)}</dd>
        </dl>
        <div style={{ marginTop: 8 }}><Link to={`/audit?client=${a.client_id}`}>See full audit trail →</Link></div>
      </Card>
    </>
  );
}
