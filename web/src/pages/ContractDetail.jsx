// One contract, and the buttons that move it through its statuses:
//   FUNDED -> IN PROGRESS -> COMPLETED
// Starting a second gig for a freelancer who already has one IN PROGRESS is blocked by the
// partial unique index idx_active_gig; the error is shown here in plain words.
import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { api, money, dateTime } from '../api.js';
import { useApi } from '../useApi.js';
import { PageHeader, Card, StatusBadge, Button, Alert } from '../components/ui.jsx';
import { AsyncView } from '../components/states.jsx';

const FLOW = ['FUNDED', 'IN PROGRESS', 'COMPLETED'];
const NEXT = { FUNDED: { to: 'IN PROGRESS', label: 'Start work' }, 'IN PROGRESS': { to: 'COMPLETED', label: 'Mark as completed' } };

export default function ContractDetail() {
  const { id } = useParams();
  const contract = useApi(() => api(`/contracts/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function move(to) {
    setBusy(true); setMsg(null);
    try {
      await api(`/contracts/${id}/status`, { method: 'PATCH', body: { status: to } });
      setMsg({ type: 'success', text: `Status changed to ${to}.` });
      await contract.reload({ quiet: true });
    } catch (e) {
      setMsg({ type: 'error', title: e.code === 'FREELANCER_BUSY' ? 'Freelancer is already busy' : 'Could not change status', text: e.message });
    } finally { setBusy(false); }
  }

  return (
    <AsyncView state={contract}>
      {c => {
        const idx = FLOW.indexOf(c.status);
        const next = NEXT[c.status];
        return (
          <div className="stack">
            <PageHeader title="Contract" subtitle={<span className="mono">{c.id}</span>} />
            <div className="grid grid-2">
              <Card title="Details">
                <dl className="kv">
                  <dt>Status</dt><dd><StatusBadge status={c.status} /></dd>
                  <dt>Budget</dt><dd>{money(c.budget)}</dd>
                  <dt>Client</dt><dd><Link to={`/clients/${c.client_id}`}>{c.client_name}</Link></dd>
                  <dt>Freelancer</dt><dd><Link to={`/freelancers/${c.freelancer_id}`}>{c.freelancer_name}</Link></dd>
                  <dt>Created</dt><dd>{dateTime(c.created_at)}</dd>
                  <dt>Completed</dt><dd>{dateTime(c.completed_at)}</dd>
                </dl>
              </Card>
              <Card title="Move through statuses">
                <div className="steps" style={{ marginBottom: 16 }}>
                  {FLOW.map((s, i) => <span key={s} className={`step ${i < idx ? 'done' : i === idx ? 'current' : ''}`}>{s}</span>)}
                </div>
                {next
                  ? <Button onClick={() => move(next.to)} disabled={busy}>{busy ? 'Saving…' : `${next.label} → ${next.to}`}</Button>
                  : <p className="muted">This contract is finished. Nothing more to do.</p>}
                <p className="muted" style={{ fontSize: 12 }}>
                  Rule: a freelancer can have only one gig IN PROGRESS at a time (partial unique index <span className="mono">idx_active_gig</span>).
                </p>
                {msg && <Alert type={msg.type} title={msg.title}>{msg.text}</Alert>}
              </Card>
            </div>
          </div>
        );
      }}
    </AsyncView>
  );
}
