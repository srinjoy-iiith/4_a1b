// All calls to the backend go through here.
// `api('/clients')` -> GET /api/clients. Errors from the server come back as
// { error: { code, message } } and are turned into a thrown ApiError with that message.

export class ApiError extends Error {
  constructor(message, code, status, detail) {
    super(message);
    this.code = code; this.status = status; this.detail = detail;
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
    : '';
  let res;
  try {
    res = await fetch(`/api${path}${qs}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running on port 4000?', 'NETWORK', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error || {};
    throw new ApiError(e.message || `Request failed (${res.status})`, e.code || 'HTTP_ERROR', res.status, e.detail);
  }
  return data;
}

// Formatting helpers used everywhere
export const money = n => (n === null || n === undefined ? '—'
  : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const dateTime = d => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const dateOnly = d => (d ? new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');
export const shortId = id => (id ? id.slice(0, 8) : '');
