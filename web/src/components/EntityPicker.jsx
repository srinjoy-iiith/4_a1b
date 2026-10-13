// A search box that lets you pick a client or freelancer by name.
//   <EntityPicker kind="clients" value={client} onChange={setClient} />
// `value` is the whole selected object ({ id, name, ... }) or null.
import { useState } from 'react';
import { api, money } from '../api.js';
import { useApi, useDebounced } from '../useApi.js';
import { Badge } from './ui.jsx';

export function EntityPicker({ kind, value, onChange, placeholder, extraQuery = {}, ariaLabel }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const search = useDebounced(text);
  const list = useApi(
    () => (open ? api(`/${kind}`, { query: { search, limit: 15, ...extraQuery } }) : Promise.resolve(null)),
    [open, search, kind, JSON.stringify(extraQuery)]);

  const pick = item => { onChange(item); setOpen(false); setText(''); };

  return (
    <div className="picker">
      <input className="input" style={{ width: '100%' }} aria-label={ariaLabel || `Search ${kind}`}
        placeholder={value ? value.name : (placeholder || `Search ${kind} by name…`)}
        value={text} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => { setText(e.target.value); setOpen(true); }} />
      {open && (
        <div className="picker-list">
          {list.loading && <div className="picker-item muted">Searching…</div>}
          {list.error && <div className="picker-item" style={{ color: 'var(--danger)' }}>{list.error.message}</div>}
          {list.data && list.data.data.length === 0 && <div className="picker-item muted">No matches</div>}
          {list.data?.data.map(item => (
            <div key={item.id} className="picker-item" onMouseDown={() => pick(item)}>
              <span>{item.name}</span>
              {kind === 'clients' && <span className="muted">{money(item.escrow_balance)}</span>}
              {kind === 'freelancers' && (item.has_active_gig ? <Badge tone="red">busy</Badge> : <Badge tone="completed">free</Badge>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
