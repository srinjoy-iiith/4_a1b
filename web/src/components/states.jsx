// Loading, empty and error views. No screen should ever be blank.
import { Button } from './ui.jsx';

export const Loading = ({ text = 'Loading…' }) => (
  <div className="state"><div className="spinner" />{text}</div>
);

export const Empty = ({ title = 'Nothing here yet', text }) => (
  <div className="state"><div className="state-title">{title}</div>{text}</div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="state">
    <div className="state-title" style={{ color: 'var(--danger)' }}>Couldn't load this</div>
    <div>{error?.message || 'Unknown error'}</div>
    {onRetry && <div style={{ marginTop: 10 }}><Button variant="secondary" size="sm" onClick={() => onRetry()}>Try again</Button></div>}
  </div>
);

// Picks the right view for a useApi() result:
//   <AsyncView state={result} isEmpty={d => d.data.length === 0}>{data => ...}</AsyncView>
export function AsyncView({ state, isEmpty, empty, children }) {
  if (state.loading && !state.data) return <Loading />;
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === null || state.data === undefined) return empty || <Empty />;
  if (isEmpty && isEmpty(state.data)) return empty || <Empty />;
  return children(state.data);
}
