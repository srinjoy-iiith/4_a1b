// Browse: clients, freelancers and contracts, one page of 20 at a time (never all 50,000 rows).
// The current tab, search, filters and page live in the URL (?tab=contracts&page=3),
// so the Back button and shared links work.
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api, money, dateTime } from '../api.js';
import { useApi, useDebounced } from '../useApi.js';
import { PageHeader, Card, Tabs, StatusBadge, Badge } from '../components/ui.jsx';
import { DataTable, Pagination } from '../components/DataTable.jsx';
import { AsyncView, Empty } from '../components/states.jsx';

const TABS = [
  { value: 'clients', label: 'Clients' },
  { value: 'freelancers', label: 'Freelancers' },
  { value: 'contracts', label: 'Contracts' },
];

const COLUMNS = {
  clients: [
    { key: 'name', label: 'Name' },
    { key: 'contract_count', label: 'Contracts', className: 'num' },
    { key: 'escrow_balance', label: 'Escrow balance', className: 'num', render: r => money(r.escrow_balance) },
  ],
  freelancers: [
    { key: 'name', label: 'Name' },
    { key: 'is_available', label: 'Available', render: r => (r.is_available ? <Badge tone="completed">yes</Badge> : <Badge>no</Badge>) },
    { key: 'has_active_gig', label: 'Current gig', render: r => (r.has_active_gig ? <Badge tone="progress">in progress</Badge> : <span className="muted">none</span>) },
    { key: 'completed_contracts', label: 'Completed', className: 'num' },
    { key: 'total_earnings', label: 'Lifetime earnings', className: 'num', render: r => money(r.total_earnings) },
  ],
  contracts: [
    { key: 'created_at', label: 'Created', render: r => dateTime(r.created_at) },
    { key: 'client_name', label: 'Client' },
    { key: 'freelancer_name', label: 'Freelancer' },
    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
    { key: 'budget', label: 'Budget', className: 'num', render: r => money(r.budget) },
  ],
};

export default function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get('tab') || 'clients';
  const page = Number(params.get('page')) || 1;
  const filter = params.get('filter') || '';
  const [text, setText] = useState(params.get('search') || '');
  const search = useDebounced(text);

  const update = changes => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  // New search text -> go back to page 1
  useEffect(() => { if ((params.get('search') || '') !== search) update({ search, page: '' }); }, [search]); // eslint-disable-line

  const query = { page, limit: 20 };
  if (tab !== 'contracts') query.search = search;
  if (tab === 'contracts') query.status = filter;
  if (tab === 'freelancers' && filter === 'available') query.available = 'true';
  if (tab === 'freelancers' && filter === 'busy') query.busy = 'true';
  if (tab === 'freelancers' && filter === 'free') query.busy = 'false';

  const list = useApi(() => api(`/${tab}`, { query }), [tab, page, search, filter]);

  return (
    <div className="stack">
      <PageHeader title="Browse" subtitle="Everything in the GigTask database, 20 rows at a time. Click a row for details." />
      <Card>
        <Tabs tabs={TABS} value={tab} onChange={t => { setText(''); setParams({ tab: t }); }} />
        <div className="row" style={{ marginBottom: 12 }}>
          {tab !== 'contracts' && (
            <input className="input" style={{ flex: '1 1 220px' }} placeholder={`Search ${tab} by name…`}
              value={text} onChange={e => setText(e.target.value)} aria-label="Search" />
          )}
          {tab === 'contracts' && (
            <select className="input" value={filter} onChange={e => update({ filter: e.target.value, page: '' })} aria-label="Status filter">
              <option value="">All statuses</option>
              <option value="FUNDED">Funded</option>
              <option value="IN PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
            </select>
          )}
          {tab === 'freelancers' && (
            <select className="input" value={filter} onChange={e => update({ filter: e.target.value, page: '' })} aria-label="Freelancer filter">
              <option value="">All freelancers</option>
              <option value="available">Marked available</option>
              <option value="free">No gig in progress</option>
              <option value="busy">Gig in progress</option>
            </select>
          )}
          {list.loading && list.data && <span className="muted">Loading…</span>}
        </div>
        <AsyncView state={list} isEmpty={d => d.data.length === 0}
          empty={<Empty title="No matching records" text="Try a different search or filter." />}>
          {data => (
            <>
              <DataTable columns={COLUMNS[tab]} rows={data.data}
                onRowClick={r => navigate(`/${tab}/${r.id}`)} />
              <Pagination result={data} loading={list.loading} onPage={p => update({ page: String(p) })} />
            </>
          )}
        </AsyncView>
      </Card>
    </div>
  );
}
