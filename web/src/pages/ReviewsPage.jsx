// Workflow 4: review analytics from one MongoDB $facet aggregation
// (rating distribution, top skill tags, overall average, best-rated workers),
// plus one flexible Portfolios document shown in a readable way.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import { PageHeader, Card, Stat, Button } from '../components/ui.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { EntityPicker } from '../components/EntityPicker.jsx';
import { AsyncView, Empty } from '../components/states.jsx';
import { PortfolioView } from '../components/PortfolioView.jsx';

const RATING_COLORS = ['#dc2626', '#f97316', '#eab308', '#14b8a6', '#0d9488'];

export default function ReviewsPage() {
  const [filter, setFilter] = useState(null);          // optional: one freelancer's reviews
  const [portfolioFor, setPortfolioFor] = useState(null);

  const summary = useApi(() => api('/reviews/summary', { query: { freelancer_id: filter?.id } }), [filter?.id]);
  const recent = useApi(() => api('/reviews', { query: { freelancer_id: filter?.id, limit: 5 } }), [filter?.id]);
  const portfolioId = portfolioFor?.id || filter?.id || summary.data?.top_workers[0]?.freelancer_id;
  const portfolio = useApi(() => (portfolioId ? api(`/portfolios/${portfolioId}`) : Promise.resolve(null)), [portfolioId]);

  return (
    <div className="stack">
      <PageHeader title="Reviews" subtitle="Client reviews of freelancers (MongoDB GigReviews, one $facet aggregation)."
        actions={<>
          <div style={{ width: 240 }}><EntityPicker kind="freelancers" value={filter} onChange={setFilter} placeholder="All freelancers (filter…)" /></div>
          {filter && <Button variant="secondary" onClick={() => setFilter(null)}>Show all</Button>}
        </>} />

      <AsyncView state={summary} isEmpty={s => s.overall.review_count === 0}
        empty={<Card><Empty title="No reviews yet" text={filter ? `${filter.name} has not been reviewed.` : 'Run the Mongo seeder to load reviews.'} /></Card>}>
        {s => (
          <>
            <div className="grid grid-3">
              <Stat label="Average rating" value={`${s.overall.average_rating.toFixed(2)} ★`} hint={filter ? filter.name : 'all freelancers'} />
              <Stat label="Reviews" value={s.overall.review_count.toLocaleString('en-IN')} />
              <Stat label="5-star share" value={`${Math.round(100 * s.rating_distribution[4].review_count / s.overall.review_count)}%`} />
            </div>
            <div className="grid grid-2">
              <Card title="Rating distribution">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={s.rating_distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="rating" tickFormatter={r => `${r} ★`} fontSize={12} />
                      <YAxis fontSize={12} width={50} />
                      <Tooltip formatter={v => [v.toLocaleString('en-IN'), 'reviews']} labelFormatter={r => `${r} star`} />
                      <Bar dataKey="review_count" radius={[4, 4, 0, 0]}>
                        {s.rating_distribution.map((d, i) => <Cell key={d.rating} fill={RATING_COLORS[i]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card title="Top skill tags">
                <div style={{ height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={s.top_skill_tags} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="#e5e7eb" horizontal={false} />
                      <XAxis type="number" fontSize={12} />
                      <YAxis type="category" dataKey="tag" width={90} fontSize={12} />
                      <Tooltip formatter={(v, _n, p) => [`${v.toLocaleString('en-IN')} uses · avg ${p.payload.avg_rating.toFixed(2)} ★`, p.payload.tag]} />
                      <Bar dataKey="usage_count" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
            {!filter && (
              <Card title="Best-rated freelancers (at least 5 reviews)">
                <DataTable rows={s.top_workers} rowKey={w => w.freelancer_id} columns={[
                  { key: 'name', label: 'Freelancer', render: w => <Link to={`/freelancers/${w.freelancer_id}`}>{w.name}</Link> },
                  { key: 'average_rating', label: 'Average', className: 'num', render: w => `${w.average_rating.toFixed(2)} ★` },
                  { key: 'review_count', label: 'Reviews', className: 'num' },
                  { key: 'p', label: '', render: w => <Button variant="secondary" size="sm" onClick={() => setPortfolioFor({ id: w.freelancer_id })}>Portfolio</Button> },
                ]} />
              </Card>
            )}
          </>
        )}
      </AsyncView>

      <div className="grid grid-2">
        <Card title="Latest reviews">
          <AsyncView state={recent} isEmpty={d => d.data.length === 0} empty={<Empty title="No reviews" />}>
            {d => (
              <div className="stack" style={{ gap: 10 }}>
                {d.data.map(r => (
                  <div key={r.contract_id || r.created_at} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <div className="row"><strong>{'★'.repeat(r.rating)}<span className="muted">{'★'.repeat(5 - r.rating)}</span></strong>
                      <span className="spacer" /><span className="muted">{new Date(r.created_at).toLocaleDateString('en-IN')}</span></div>
                    <div>{r.comment || <span className="muted">No comment</span>}</div>
                    <div className="chips" style={{ marginTop: 4 }}>{r.skill_tags.map(t => <span key={t} className="chip">{t}</span>)}</div>
                  </div>
                ))}
              </div>
            )}
          </AsyncView>
        </Card>
        <Card title="Freelancer portfolio (flexible MongoDB document)">
          <AsyncView state={portfolio} isEmpty={d => !d} empty={<Empty title="No portfolio selected" />}>
            {doc => <PortfolioView doc={doc} />}
          </AsyncView>
        </Card>
      </div>
    </div>
  );
}
