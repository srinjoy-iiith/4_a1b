# Handover note — GigTask (P5)

Inherited repository: <https://github.com/Akhileshsenapati1008/19_a1> (A1 final commit `0b8cdc2`).
The original A1 README is kept unchanged at [`docs/A1_README.md`](A1_README.md).

## What worked

- **Schema** (`sql/01`): clean, small and well-constrained. It has `CHECK (escrow_balance >= 0)`, a status `CHECK`, `ON DELETE RESTRICT` on contracts, and sensible foreign-key indexes.
- **Partial unique index** `idx_active_gig`: a neat way to enforce "one active gig per freelancer" inside the database.
- **Audit trigger**: logs every escrow change with `balance_after`, in the same transaction as the change.
- **Materialized view** with a unique index, so `REFRESH … CONCURRENTLY` works without blocking readers.
- **Window query**: a correct use of `RANGE BETWEEN INTERVAL '6 days' PRECEDING` for a calendar-based 7-day average.
- **Mongo**: a 2dsphere index, a TTL index on pings, and a `$jsonSchema` validator on reviews.
- `performance/` holds real `EXPLAIN ANALYZE` and `executionStats` evidence.

## What did not work

| # | Problem | Effect |
|---|---|---|
| 1 | `fund_gig` ended with `EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;` | A `ROLLBACK` is not allowed inside an exception block. Every failure became *"cannot roll back while a subtransaction is active"*, which hid the real reason (for example, insufficient balance). |
| 2 | `fund_gig` created contracts as `FUNDED`, but `idx_active_gig` only covers `IN PROGRESS` | The "second active gig" rule could never fire during funding. |
| 3 | README ran `sql/01_schema_ddl.sql`, but the file was named `01_schema_dll.sql` | The first setup command failed. |
| 4 | The Mongo seeder only filled `WorkerLocations` | `GigReviews` and `Portfolios` were empty, so Workflow 4 returned nothing. |
| 5 | Mongo `freelancer_id` was `"1"`…`"5000"`, while Postgres uses UUIDs | Map pins and reviews could not be linked to real freelancers. |
| 6 | Pings were seeded within the last 2 hours, with a 2-hour TTL | Every ping is deleted about 2 hours after seeding, so the map goes empty. |
| 7 | 100k random `wallet_audit_logs` rows with random `balance_after` | The audit trail contradicted the real balances, so a running balance was meaningless. |
| 8 | `completed_at` could be in the future; the moving average used `created_at` | Revenue appeared on days before the work was finished. |
| 9 | Re-running `04` on an existing DB (after our signature change) gave "procedure is not unique" | Two versions of `fund_gig` existed side by side. |
| 10 | The 7-day moving average used `AVG()` over the rows in the window, but rows exist only for days with revenue | One ₹5,000 day in a week showed as a ₹5,000 average instead of ₹714 (5,000 ÷ 7), so rankings favoured occasional earners. |

## What we changed and why

All changes are also listed in the README under *Changes to inherited code*.

- **`sql/03`**: the trigger reads an optional label from `SET LOCAL app.audit_action`, so log rows say `GIG_FUNDED` or `DEPOSIT` instead of a generic `ESCROW_BALANCE_UPDATE`. The default behaviour is unchanged.
- **`sql/04`**:
  - Removed the `EXCEPTION/ROLLBACK` block (fix 1). A failed `CALL` is already rolled back as a whole.
  - New gigs start as `IN PROGRESS`, so the partial unique index blocks a second active gig at funding time (fix 2).
  - Added `INOUT p_contract_id` so the caller gets the new id, and a `DROP PROCEDURE` of the old signature (fix 9).
  - Added `update_contract_status` (FUNDED → IN PROGRESS → COMPLETED) and `deposit_escrow`.
- **`sql/05`**: added the `mv_refresh_log` table. The refresh procedure writes to it so the UI can show "last refreshed" (Postgres does not track this itself).
- **`sql/06`**: revenue is dated by `completed_at` (fix 8). The moving average is now the window's total ÷ 7, so days without revenue count as zero (fix 10). `DENSE_RANK` uses the rounded value, so equal displayed values share a rank.
- **`sql/01`**: renamed to `01_schema_ddl.sql` (fix 3). Removed the stray `Untitled.png`.
- **Seeders**:
  - The Postgres seeder builds a real chronological escrow history per client (fix 7).
  - The Mongo seeder makes each review tag only skills from that freelancer's portfolio, and never dates a review in the future. It is checked by a test: the running balance equals the logged balance for all 101k rows.
  - The Mongo seeder uses Postgres UUIDs and seeds reviews and portfolios (fixes 4, 5).
  - The API runs a small ping simulator so the map stays populated within the TTL window (fix 6).
- **`mongo/01`**: re-runnable (skips existing collections) and selects the `gigtask` DB itself.

## Suggestions for the original authors

1. Test each procedure's failure path, not only the success path. Fix 1 only shows up when something fails.
2. When a uniqueness rule depends on a status, make sure the code that writes that status matches the index.
3. Generate dependent data from real data (Mongo IDs from Postgres) rather than independently.
4. Seed audit or ledger tables by replaying events, never with random rows.
5. Keep the README commands and file names in sync; a fresh-clone run would have caught fix 3.
