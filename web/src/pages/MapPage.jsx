// Workflow 3: nearest available workers to a job site ($geoNear in MongoDB, 5 km radius).
// The page asks the API again every 5 seconds (polling), so new location pings appear
// without reloading the page. Workers whose ping arrived since the last poll are highlighted.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { api, dateTime } from '../api.js';
import { useApi } from '../useApi.js';
import { PageHeader, Card, Stat, Button, Field } from '../components/ui.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { AsyncView, Empty } from '../components/states.jsx';

const POLL_MS = 5000;
const RADIUS = 5000;

export default function MapPage() {
  const origins = useApi(() => api('/map/origins'), []);
  const [origin, setOrigin] = useState(null);
  const [live, setLive] = useState(true);
  const [lastPoll, setLastPoll] = useState(null);
  const prevPoll = useRef(null);      // time of the poll before the latest one
  const lastPollRef = useRef(null);   // time of the latest poll

  useEffect(() => { if (!origin && origins.data) setOrigin(origins.data[0]); }, [origins.data, origin]);

  const nearby = useApi(
    () => (origin ? api('/map/nearby', { query: { lng: origin.lng, lat: origin.lat, radius: RADIUS, limit: 25 } }) : Promise.resolve(null)),
    [origin?.lng, origin?.lat]);

  // Polling: re-run the query quietly (keep showing old data while loading)
  useEffect(() => {
    if (!live || !origin) return undefined;
    const t = setInterval(() => nearby.reload({ quiet: true }), POLL_MS);
    return () => clearInterval(t);
  }, [live, origin, nearby.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each new response: remember when the previous one came, so we can mark pings newer than it.
  useEffect(() => {
    if (!nearby.data) return;
    prevPoll.current = lastPollRef.current;
    lastPollRef.current = new Date();
    setLastPoll(lastPollRef.current);
  }, [nearby.data]);

  // New job site -> nothing counts as "new" until the next poll
  useEffect(() => { prevPoll.current = null; lastPollRef.current = null; }, [origin?.lat, origin?.lng]);

  const isNew = w => prevPoll.current && new Date(w.pinged_at) > prevPoll.current;

  return (
    <div className="stack">
      <PageHeader title="Nearby workers" subtitle="Available freelancers within 5 km of a job site, nearest first (MongoDB $geoNear)." />
      <Card>
        <div className="row" style={{ alignItems: 'end' }}>
          <Field label="Job site">
            <select className="input" value={origin?.id || 'custom'} aria-label="Job site"
              onChange={e => setOrigin(origins.data.find(o => o.id === e.target.value))}>
              {origins.data?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              {origin?.id === 'custom' && <option value="custom">Custom point</option>}
            </select>
          </Field>
          <span className="muted">…or click anywhere on the map.</span>
          <span className="spacer" />
          <span className="muted">{live && <span className="pulse" />}{lastPoll ? `Updated ${lastPoll.toLocaleTimeString()}` : ''}</span>
          <Button variant="secondary" size="sm" onClick={() => setLive(l => !l)}>{live ? 'Pause live updates' : 'Resume live updates'}</Button>
        </div>
      </Card>

      {nearby.data && (
        <div className="grid grid-3">
          <Stat label="Workers within 5 km" value={nearby.data.stats.workers_in_radius.toLocaleString('en-IN')} />
          <Stat label="Pings within 5 km" value={nearby.data.stats.pings_in_radius.toLocaleString('en-IN')} hint="pings older than 2 h expire (TTL index)" />
          <Stat label="Latest ping" value={nearby.data.stats.latest_ping ? new Date(nearby.data.stats.latest_ping).toLocaleTimeString() : '—'}
            hint={nearby.data.simulator?.enabled ? `simulator has added ${nearby.data.simulator.inserted} pings` : 'ping simulator off'} />
        </div>
      )}

      <div className="grid grid-2">
        <Card title="Map">
          {origin ? (
            <div className="map">
              <MapContainer center={[origin.lat, origin.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Recenter origin={origin} />
                <ClickToPick onPick={(lat, lng) => setOrigin({ id: 'custom', name: 'Custom point', lat, lng })} />
                <Circle center={[origin.lat, origin.lng]} radius={RADIUS} pathOptions={{ color: '#4f46e5', weight: 1, fillOpacity: 0.05 }} />
                <CircleMarker center={[origin.lat, origin.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#4f46e5', fillOpacity: 1 }}>
                  <Tooltip>Job site: {origin.name}</Tooltip>
                </CircleMarker>
                {nearby.data?.workers.map((w, i) => (
                  <CircleMarker key={w.freelancer_id} center={[w.lat, w.lng]} radius={isNew(w) ? 8 : 6}
                    pathOptions={{ color: isNew(w) ? '#0d9488' : '#fff', weight: 2, fillColor: i < 5 ? '#0d9488' : '#64748b', fillOpacity: 0.9 }}>
                    <Tooltip>#{i + 1} {w.name} · {(w.distance_m / 1000).toFixed(2)} km</Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          ) : <AsyncView state={origins}>{() => null}</AsyncView>}
        </Card>

        <Card title="Nearest available workers">
          <AsyncView state={nearby} isEmpty={d => d.workers.length === 0}
            empty={<Empty title="No available workers within 5 km" text="Pick another job site, or wait for new pings to arrive." />}>
            {d => (
              <DataTable rows={d.workers} rowKey={w => w.freelancer_id} rowClass={w => (isNew(w) ? 'highlight' : '')} columns={[
                { key: 'rank', label: '#', render: w => d.workers.indexOf(w) + 1 },
                { key: 'name', label: 'Freelancer', render: w => <Link to={`/freelancers/${w.freelancer_id}`}>{w.name}</Link> },
                { key: 'distance_m', label: 'Distance', className: 'num', render: w => `${(w.distance_m / 1000).toFixed(2)} km` },
                { key: 'pinged_at', label: 'Last ping', render: w => <span title={dateTime(w.pinged_at)}>{new Date(w.pinged_at).toLocaleTimeString()}{isNew(w) && <strong className="money-in"> new</strong>}</span> },
              ]} />
            )}
          </AsyncView>
        </Card>
      </div>
    </div>
  );
}

function Recenter({ origin }) {
  const map = useMap();
  useEffect(() => { map.setView([origin.lat, origin.lng], map.getZoom()); }, [origin.lat, origin.lng, map]);
  return null;
}

function ClickToPick({ onPick }) {
  useMapEvents({ click: e => onPick(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)) });
  return null;
}
