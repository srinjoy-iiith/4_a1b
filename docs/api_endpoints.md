# API endpoints

Base URL: `http://localhost:4000/api`. All responses are JSON.

**Errors** always look like this: `{ "error": { "code", "message", "detail?" } }`.

**Paged lists** take `?page=&limit=` (`limit` is 100 at most) and return `{ data, page, limit, total, totalPages }`.

| Method | Path | Input | Output | Backed by |
|---|---|---|---|---|
| GET | `/health` | – | `{ postgres, mongo }` | `SELECT 1`, Mongo ping |
| GET | `/clients` | `search, page, limit` | paged clients with `escrow_balance`, `contract_count` | SQL |
| GET | `/clients/:id` | – | client and contract counts | SQL |
| POST | `/clients/:id/deposit` | `{ amount }` | updated client | `CALL deposit_escrow` → trigger |
| GET | `/clients/:id/audit` | `from, to (YYYY-MM-DD), page, limit` | paged audit rows with `running_balance`, plus `summary { total, money_in, money_out }` | `wallet_audit_logs` + `SUM() OVER` |
| GET | `/freelancers` | `search, available, busy, page, limit` | paged freelancers with `has_active_gig` and lifetime stats | SQL + materialized view |
| GET | `/freelancers/:id` | – | freelancer, `active_contract`, `portfolio`, `rating` | SQL + MV + Mongo |
| GET | `/contracts` | `status, client_id, freelancer_id, page, limit` | paged contracts with names | SQL |
| GET | `/contracts/:id` | – | contract | SQL |
| **POST** | **`/contracts/fund`** | `{ client_id, freelancer_id, budget }` | `{ contract, balance_before, balance_after, audit_entry }` | **Workflow 1:** `CALL fund_gig` |
| PATCH | `/contracts/:id/status` | `{ status }` | updated contract | `CALL update_contract_status` |
| GET | `/analytics/ranking` | `page, limit` | paged `{ freelancer_rank, name, moving_average_7d, revenue_day }` | **Workflow 2:** CTE + window + `DENSE_RANK` |
| GET | `/analytics/moving-average` | `freelancer_ids` (comma-separated, up to 5; default: top 3) | `{ series: [{ freelancer_id, name, points: [{ revenue_day, daily_revenue, moving_average_7d }] }] }` | **Workflow 2** |
| GET | `/analytics/summary` | – | totals, `top_earners`, `last_refreshed` | materialized view + `mv_refresh_log` |
| POST | `/analytics/refresh` | – | `{ last_refreshed, took_ms }` | `CALL refresh_freelancer_lifetime_stats` |
| GET | `/map/origins` | – | preset job sites | constant |
| GET | `/map/nearby` | `lng, lat, radius (default 5000 m), limit` | `{ workers: [{ name, distance_m, lng, lat, pinged_at }], stats, simulator }` | **Workflow 3:** `$geoNear` |
| GET | `/reviews/summary` | `freelancer_id?` | `{ overall, rating_distribution, top_skill_tags, top_workers }` | **Workflow 4:** `$facet` + `$unwind` |
| GET | `/reviews` | `freelancer_id?, page, limit` | paged latest reviews | Mongo `find` |
| GET | `/portfolios/:freelancerId` | – | the Portfolios document | Mongo `findOne` |

## Error codes the UI explains

| HTTP | Code | When |
|---|---|---|
| 422 | `INSUFFICIENT_BALANCE` | `fund_gig` raised *Insufficient escrow balance* |
| 409 | `FREELANCER_BUSY` | unique violation on `idx_active_gig` (Postgres code 23505) |
| 422 | `INVALID_STATUS_CHANGE` | e.g. FUNDED → COMPLETED (steps must go in order) |
| 400 | `BAD_INPUT` | missing or invalid field, or a malformed UUID (22P02) |
| 404 | `NOT_FOUND` | unknown client, freelancer, contract or route |
| 503 | `MONGO_DOWN` | MongoDB not reachable (fails after 3 seconds instead of hanging) |
