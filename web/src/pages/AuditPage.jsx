// Escrow audit trail: read-only view of wallet_audit_logs for one client,
// with a date filter and a running balance (computed in SQL with a window function).
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, money, dateTime } from '../api.js';
import { useApi } from '../useApi.js';
import { useActor } from '../context/ActorContext.jsx';
import { PageHeader, Card, Stat, Field, Button } from '../components/ui.jsx';
import { EntityPicker } from '../components/EntityPicker.jsx';
import { DataTable, Pagination } from '../components/DataTable.jsx';
import { AsyncView, Empty } from '../components/states.jsx';

export default function AuditPage() {
  const { actor } = useActor();
  const [params] = useSearchParams();
  const [picked, setPicked] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const clientId = picked?.id || params.get('client') || actor?.id;
  const client = useApi(() => (clientId ? api(`/clients/${clientId}`) : Promise.resolve(null)), [clientId]);
  const logs = useApi(() => (clientId ? api(`/clients/${clientId}/audit`, { query: { from, to, page, limit: 25 } }) : Promise.resolve(null)),
    [clientId, from, to, page]);

  if (!clientId) return <Card><Empty title="Choose a client" text="Use “Acting as” in the top bar, or pick a client below." /></Card>;

  return (
    <div className="stack">
      <PageHeader title="Escrow audit trail" subtitle="Every change to a client's escrow balance, recorded by the trg_escrow_audit trigger. Read-only." />
      <Card>
        <div className="grid grid-4" style={{ alignItems: 'end' }}>
          <Field label="Client">
            <EntityPicker kind="clients" value={picked || client.data} onChange={c => { setPicked(c); setPage(1); }} ariaLabel="Audit client" />
          </Field>
          <Field label="From"><input className="input" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} aria-label="From date" /></Field>
          <Field label="To"><input className="input" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} aria-label="To date" /></Field>
          <div><Button variant="secondary" onClick={() => { setFrom(''); setTo(''); setPage(1); }} disabled={!from && !to}>Clear dates</Button></div>
        </div>
      </Card>

      <AsyncView state={logs}>
        {d => (
          <>
            <div className="grid grid-4">
              <Stat label="Current balance" value={money(client.data?.escrow_balance)} />
              <Stat label="Entries in range" value={d.summary.total.toLocaleString('en-IN')} />
              <Stat label="Money in" value={money(d.summary.money_in)} tone="in" />
              <Stat label="Money out" value={money(d.summary.money_out)} tone="out" />
            </div>
            <Card title={client.data ? `Entries for ${client.data.name}` : 'Entries'}>
              {d.data.length === 0
                ? <Empty title="No entries in this date range" text="Try widening or clearing the dates." />
                : <>
                    <DataTable rows={d.data} columns={[
                      { key: 'created_at', label: 'When', render: r => dateTime(r.created_at) },
                      { key: 'action_type', label: 'Action', render: r => <span className="badge badge-grey">{r.action_type}</span> },
                      { key: 'amount_changed', label: 'Amount', className: 'num',
                        render: r => <span className={r.amount_changed >= 0 ? 'money-in' : 'money-out'}>{r.amount_changed >= 0 ? '+' : ''}{money(r.amount_changed)}</span> },
                      { key: 'running_balance', label: 'Running balance', className: 'num', render: r => <strong>{money(r.running_balance)}</strong> },
                      { key: 'balance_after', label: 'Logged balance', className: 'num muted', render: r => money(r.balance_after) },
                    ]} />
                    <Pagination result={d} onPage={setPage} loading={logs.loading} />
                    <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                      Running balance = SUM(amount) over the client's history in time order (SQL window function). It matches the balance the trigger logged.
                    </p>
                  </>}
            </Card>
          </>
        )}
      </AsyncView>
    </div>
  );
}
