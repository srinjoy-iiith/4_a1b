// One freelancer: Postgres data (lifetime stats from the materialized view, current gig)
// plus MongoDB data (portfolio document and average rating).
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, money, dateTime } from '../api.js';
import { useApi } from '../useApi.js';
import { PageHeader, Card, Stat, StatusBadge, Badge, Button } from '../components/ui.jsx';
import { DataTable, Pagination } from '../components/DataTable.jsx';
import { AsyncView, Empty } from '../components/states.jsx';
import { PortfolioView } from '../components/PortfolioView.jsx';

export default function FreelancerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const f = useApi(() => api(`/freelancers/${id}`), [id]);
  const contracts = useApi(() => api('/contracts', { query: { freelancer_id: id, page, limit: 10 } }), [id, page]);

  return (
    <AsyncView state={f}>
      {fr => (
        <div className="stack">
          <PageHeader title={fr.name}
            subtitle={<>Freelancer · {fr.is_available ? <Badge tone="completed">available</Badge> : <Badge>not available</Badge>}</>}
            actions={<Link to={`/fund?freelancer=${fr.id}`}><Button disabled={!!fr.active_contract}>Fund a gig with {fr.name.split(' ')[0]}</Button></Link>} />
          <div className="grid grid-4">
            <Stat label="Completed gigs" value={fr.completed_contracts} hint="from materialized view" />
            <Stat label="Lifetime earnings" value={money(fr.total_earnings)} hint="from materialized view" />
            <Stat label="Average rating" value={fr.rating ? `${fr.rating.average.toFixed(2)} ★` : '—'} hint={fr.rating ? `${fr.rating.count} reviews` : 'no reviews'} />
            <Stat label="Current gig" value={fr.active_contract ? 'Busy' : 'Free'}
              hint={fr.active_contract ? <Link to={`/contracts/${fr.active_contract.id}`}>view gig →</Link> : 'can be funded'} />
          </div>
          <div className="grid grid-2">
            <Card title="Portfolio (MongoDB)"><PortfolioView doc={fr.portfolio} /></Card>
            <Card title="Contracts">
              <AsyncView state={contracts} isEmpty={d => d.data.length === 0} empty={<Empty title="No contracts yet" />}>
                {d => (
                  <>
                    <DataTable rows={d.data} onRowClick={r => navigate(`/contracts/${r.id}`)} columns={[
                      { key: 'created_at', label: 'Created', render: r => dateTime(r.created_at) },
                      { key: 'client_name', label: 'Client' },
                      { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
                      { key: 'budget', label: 'Budget', className: 'num', render: r => money(r.budget) },
                    ]} />
                    <Pagination result={d} onPage={setPage} loading={contracts.loading} />
                  </>
                )}
              </AsyncView>
            </Card>
          </div>
        </div>
      )}
    </AsyncView>
  );
}
