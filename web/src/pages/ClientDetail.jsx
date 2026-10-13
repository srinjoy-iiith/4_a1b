// One client: balances, contract counts and their contracts.
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, money, dateTime } from '../api.js';
import { useApi } from '../useApi.js';
import { useActor } from '../context/ActorContext.jsx';
import { PageHeader, Card, Stat, StatusBadge, Button } from '../components/ui.jsx';
import { DataTable, Pagination } from '../components/DataTable.jsx';
import { AsyncView, Empty } from '../components/states.jsx';

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setActor } = useActor();
  const [page, setPage] = useState(1);
  const client = useApi(() => api(`/clients/${id}`), [id]);
  const contracts = useApi(() => api('/contracts', { query: { client_id: id, page, limit: 10 } }), [id, page]);

  return (
    <AsyncView state={client}>
      {c => (
        <div className="stack">
          <PageHeader title={c.name} subtitle="Client"
            actions={<>
              <Button variant="secondary" onClick={() => { setActor(c); navigate('/fund'); }}>Act as this client</Button>
              <Link to={`/audit?client=${c.id}`}><Button variant="secondary">Escrow audit trail</Button></Link>
            </>} />
          <div className="grid grid-4">
            <Stat label="Escrow balance" value={money(c.escrow_balance)} />
            <Stat label="Contracts" value={c.contract_count} />
            <Stat label="In progress" value={c.active_count} />
            <Stat label="Total committed" value={money(c.total_spent)} />
          </div>
          <Card title="Contracts">
            <AsyncView state={contracts} isEmpty={d => d.data.length === 0} empty={<Empty title="No contracts yet" />}>
              {d => (
                <>
                  <DataTable rows={d.data} onRowClick={r => navigate(`/contracts/${r.id}`)} columns={[
                    { key: 'created_at', label: 'Created', render: r => dateTime(r.created_at) },
                    { key: 'freelancer_name', label: 'Freelancer' },
                    { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} /> },
                    { key: 'budget', label: 'Budget', className: 'num', render: r => money(r.budget) },
                  ]} />
                  <Pagination result={d} onPage={setPage} loading={contracts.loading} />
                </>
              )}
            </AsyncView>
          </Card>
        </div>
      )}
    </AsyncView>
  );
}
