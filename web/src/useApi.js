// useApi: a small React hook that loads data and tracks loading / error state.
//   const { data, loading, error, reload } = useApi(() => api('/clients', { query }), [query]);
// It re-runs whenever something in `deps` changes, and ignores stale responses.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useApi(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const callId = useRef(0);

  const run = useCallback(async ({ quiet = false } = {}) => {
    const id = ++callId.current;
    if (!quiet) setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === callId.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (id === callId.current) setState(s => ({ data: quiet ? s.data : null, loading: false, error }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

// Delays a value (used for search boxes so we don't call the API on every key press)
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
