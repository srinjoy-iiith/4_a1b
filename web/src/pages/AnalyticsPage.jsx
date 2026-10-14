// Workflow 2 + materialized view.
//  * Line chart: 7-day moving average revenue per freelancer (window function query)
//  * Ranked table: DENSE_RANK() of each freelancer's latest moving average
//  * Summary tiles from the freelancer_lifetime_stats materialized view, with a refresh button
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { api, money, dateTime, dateOnly } from '../api.js';
import { useApi } from '../useApi.js';
import { PageHeader, Card, Stat, Button, Alert } from '../components/ui.jsx';
import { DataTable, Pagination } from '../components/DataTable.jsx';
import { EntityPicker } from '../components/EntityPicker.jsx';
import { AsyncView, Empty } from '../components/states.jsx';

const COLORS = ['#4f46e5', '#0d9488', '#d97706', '#db2777', '#2563eb'];

export default function AnalyticsPage() {
  const [ids, setIds] = useState([]);               // empty = API picks the top 3
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);

  const summary = useApi(() => api('/analytics/summary'), []);
  const series = useApi(() => api('/analytics/moving-average', { query: { freelancer_ids: ids.join(',') } }), [ids.join(',')]);
  const ranking = useApi(() => api('/analytics/ranking', { query: { page, limit: 10 } }), [page]);

  async function refresh() {
    setRefreshing(true); setRefreshMsg(null);
    try {
      const r = await api('/analytics/refresh', { method: 'POST' });
      setRefreshMsg({ type: 'success', text: `Refreshed in ${r.took_ms} ms.` });
      summary.reload({ quiet: true });
    } catch (e) { setRefreshMsg({ type: 'error', text: e.message }); }
    finally { setRefreshing(false); }
  }

  // Recharts wants one row per day: { day, <freelancerId>: value, ... }
  const chartData = useMemo(() => {
    const byDay = {};
    series.data?.series.forEach(s => s.points.forEach(p => {
      byDay[p.revenue_day] = { ...(byDay[p.revenue_day] || { day: p.revenue_day }), [s.freelancer_id]: p.moving_average_7d };
    }));
    return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
  }, [series.data]);

  const shown = series.data?.series || [];

  return (
    <div className="stack">
      <PageHeader title="Analytics" subtitle="Revenue per freelancer, from completed contracts." />

      <Card title="Lifetime summary (materialized view)" actions={
        <>
          <span className="muted">Last refreshed: {summary.data ? dateTime(summary.data.last_refreshed) : '…'}</span>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : '↻ Refresh view'}</Button>
        </>}>
        {refreshMsg && <div style={{ marginBottom: 12 }}><Alert type={refreshMsg.type}>{refreshMsg.text}</Alert></div>}
        <AsyncView state={summary}>
          {s => (
            <div className="grid grid-4">
              <Stat label="Freelancers" value={s.freelancers.toLocaleString('en-IN')} hint={`${s.freelancers_with_work.toLocaleString('en-IN')} with completed work`} />
              <Stat label="Completed gigs" value={s.completed_contracts.toLocaleString('en-IN')} />
              <Stat label="Total earnings" value={money(s.total_earnings)} tone="in" />
              <Stat label="Avg per freelancer" value={money(s.avg_earnings)} />
            </div>
          )}
        </AsyncView>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          A materialized view stores its results, so it is fast but can be stale. Fund or complete a gig, then press Refresh to see it change.
        </p>
      </Card>

      <Card title="7-day moving average revenue" actions={
        <div style={{ width: 240 }}>
          <EntityPicker kind="freelancers" value={null} placeholder="Add a freelancer to the chart…"
            onChange={f => setIds(prev => [...new Set([...(prev.length ? prev : shown.map(s => s.freelancer_id)), f.id])].slice(-5))} />
        </div>}>
        <AsyncView state={series} isEmpty={d => d.series.every(s => s.points.length === 0)}
          empty={<Empty title="No completed gigs yet" text="These freelancers have no completed contracts to chart." />}>
          {() => (
            <>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={d => d.slice(5)} fontSize={12} />
                    <YAxis tickFormatter={v => `₹${Math.round(v / 1000)}k`} fontSize={12} width={50} />
                    <Tooltip formatter={v => money(v)} labelFormatter={d => dateOnly(d)} />
                    <Legend />
                    {shown.map((s, i) => (
                      <Line key={s.freelancer_id} dataKey={s.freelancer_id} name={s.name || s.freelancer_id.slice(0, 8)}
                        stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls type="monotone" />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">{ids.length ? 'Your selection.' : 'Showing the top 3 ranked freelancers.'}</span>
                {ids.length > 0 && <Button variant="secondary" size="sm" onClick={() => setIds([])}>Reset to top 3</Button>}
              </div>
            </>
          )}
        </AsyncView>
      </Card>

      <Card title="Ranking by latest 7-day moving average (DENSE_RANK)">
        <AsyncView state={ranking} isEmpty={d => d.data.length === 0}>
          {d => (
            <>
              <DataTable rows={d.data} rowKey={r => r.freelancer_id} columns={[
                { key: 'freelancer_rank', label: 'Rank', className: 'num', render: r => <strong>#{r.freelancer_rank}</strong> },
                { key: 'name', label: 'Freelancer', render: r => <Link to={`/freelancers/${r.freelancer_id}`}>{r.name}</Link> },
                { key: 'revenue_day', label: 'Latest revenue day', render: r => dateOnly(r.revenue_day) },
                { key: 'moving_average_7d', label: '7-day avg', className: 'num', render: r => money(r.moving_average_7d) },
                { key: 'chart', label: '', render: r => (
                  <Button variant="secondary" size="sm" onClick={() => setIds(prev => [...new Set([...prev, r.freelancer_id])].slice(-5))}>Chart</Button>) },
              ]} />
              <Pagination result={d} onPage={setPage} loading={ranking.loading} />
            </>
          )}
        </AsyncView>
      </Card>
    </div>
  );
}
