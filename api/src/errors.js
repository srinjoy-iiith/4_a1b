// Turns database errors into short, friendly messages for the UI.
// Every error response has the same shape: { error: { code, message, detail } }

export class ApiError extends Error {
  constructor(status, code, message, detail) {
    super(message);
    this.status = status; this.code = code; this.detail = detail;
  }
}

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
export function translatePgError(err) {
  // Raised by RAISE EXCEPTION in our stored procedures (code P0001)
  if (err.code === 'P0001') {
    const m = err.message;
    if (m.startsWith('Insufficient escrow balance'))
      return new ApiError(422, 'INSUFFICIENT_BALANCE',
        "The client doesn't have enough money in escrow to fund this gig. Lower the budget or deposit funds first.", err.detail);
    if (m.startsWith('Invalid status change'))
      return new ApiError(422, 'INVALID_STATUS_CHANGE', m + '. Contracts move FUNDED → IN PROGRESS → COMPLETED.');
    if (m.endsWith('does not exist')) return new ApiError(404, 'NOT_FOUND', m + '.');
    return new ApiError(422, 'RULE_VIOLATION', m + '.');
  }
  // unique_violation: the partial unique index idx_active_gig (one IN PROGRESS gig per freelancer)
  if (err.code === '23505' && err.constraint === 'idx_active_gig')
    return new ApiError(409, 'FREELANCER_BUSY',
      'This freelancer already has a gig in progress. A freelancer can work on only one gig at a time — complete the current gig first.',
      err.detail);
  if (err.code === '22P02') return new ApiError(400, 'BAD_INPUT', 'One of the values is in the wrong format (for example, an invalid id).');
  if (err.code === '23514') return new ApiError(422, 'CHECK_FAILED', 'A database rule rejected this value.', err.detail);
  return null;
}

// Express error handler (registered last in app.js)
export function errorHandler(err, req, res, _next) {
  if (err?.name === 'MongoServerSelectionError')
    err = new ApiError(503, 'MONGO_DOWN', 'MongoDB is not reachable. Start MongoDB and try again.');
  const e = err instanceof ApiError ? err : translatePgError(err);
  if (e) return res.status(e.status).json({ error: { code: e.code, message: e.message, detail: e.detail } });
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Is the database running?' } });
}
