# GigTask — Front End (Assignment 2, Team 4)

A web front end for the **P5 GigTask** database inherited from Assignment 1. GigTask is a freelance marketplace: clients fund gigs from escrow, freelancers do them, and clients review them.

- **Repository:** https://github.com/srinjoy-iiith/4_a1b
- **Final commit hash:** `98ac430` (last code commit; this README update comes after it)
- **Demo video (≤ 5 min):** https://drive.google.com/drive/folders/1tawSqgp1Uu_Ju5w6kVWBXNK0E4PA-gpW
- **Inherited from:** <https://github.com/Akhileshsenapati1008/19_a1>. Its original README is kept at [`docs/A1_README.md`](docs/A1_README.md).

| Doc | Link |
|---|---|
| Handover note | [`docs/handover_note.md`](docs/handover_note.md) |
| API endpoints | [`docs/api_endpoints.md`](docs/api_endpoints.md) |
| Users | [`docs/design/users.md`](docs/design/users.md) |
| Design system | [`docs/design/design_system.md`](docs/design/design_system.md) |
| Wireframes | [`docs/design/wireframes/`](docs/design/wireframes) |

---

## 1. Run it

### Option A: Docker (one command)

```bash
git clone https://github.com/srinjoy-iiith/4_a1b && cd 4_a1b
docker compose up --build
```

Then open **http://localhost:8080**. The first start takes 1–2 minutes because the seeder loads 50,000 contracts, 101k audit rows, 500,000 pings, 43k reviews and 5,000 portfolios.

To start again from scratch, run `docker compose down -v`.

### Option B: by hand

You need PostgreSQL 14+, MongoDB 6+ with `mongosh`, Python 3.10+ and Node.js 18+.

```bash
# 1. Databases
createdb gigtask                                   # or: psql -c "CREATE DATABASE gigtask"
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gigtask
for f in sql/01_schema_ddl.sql sql/02_indexes.sql sql/03_triggers_and_audit.sql \
         sql/04_stored_procedures.sql sql/05_materialized_views.sql; do psql "$DATABASE_URL" -f $f; done
mongosh mongo/01_collections_and_indexes.js

# 2. Seed data (Postgres first: the Mongo seeder reads the freelancer ids from Postgres)
python3 -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python data_generation/postgres_seeder.py
python data_generation/mongo_seeder.py

# 3. API (terminal 1)
cd api && cp .env.example .env && npm install && npm start      # http://localhost:4000/api/health

# 4. Web (terminal 2)
cd web && npm install && npm run dev                           # http://localhost:5173
```

On Windows PowerShell, run the five `psql -f` lines one by one instead of the `for` loop.

### Tests

```bash
cd api && npm test     # 6 integration tests against the real, seeded Postgres
cd web && npm test     # 4 UI tests for the Fund a Gig screen (API mocked)
```

---

## 2. Screens

| Screen | What it shows | Database work behind it |
|---|---|---|
| **Browse** | Clients, freelancers and contracts. 20 rows per page, search by name, filter by status / availability / busy, and a detail page per record. | `LIMIT/OFFSET` queries; the materialized view for lifetime stats |
| **Fund a Gig** (Workflow 1) | Form showing the balance before and after, plus the new `wallet_audit_logs` row. Friendly errors for *insufficient balance* and *freelancer already busy*. Escrow top-up. | `CALL fund_gig`, the trigger `trg_escrow_audit`, the partial unique index `idx_active_gig`, `CALL deposit_escrow` |
| **Contract detail** | Moves a contract FUNDED → IN PROGRESS → COMPLETED, to demonstrate the partial unique index. | `CALL update_contract_status` |
| **Escrow Audit** | Read-only log for a chosen client, with a date filter, money in/out and a running balance. | `SUM(amount_changed) OVER (ORDER BY created_at, id)` |
| **Analytics** (Workflow 2 + MV) | 7-day moving-average line chart, `DENSE_RANK` ranking table, and summary tiles with *last refreshed* and a Refresh button. | Window-function CTEs (`sql/06`), `freelancer_lifetime_stats`, `mv_refresh_log` |
| **Nearby Workers** (Workflow 3) | Map with a selectable job site (presets or click anywhere), 5 km circle, and a list sorted by distance. Polls every 5 s and highlights new pings. | `$geoNear` (2dsphere index); a ping simulator in the API |
| **Reviews** (Workflow 4) | Rating distribution, top skill tags, overall average, best-rated workers, latest reviews, and one Portfolio document shown readably. | `$facet` + `$unwind` on `GigReviews`; `Portfolios` |

Every screen has loading, empty and error states. The **"Acting as"** box in the top bar switches the demo client (there is no real login).

Screenshots: see [`docs/screenshots/`](docs/screenshots).

---

## 3. Tech choices

| Layer | Choice | Why |
|---|---|---|
| Server/API | **Node.js + Express 5**, `pg`, `mongodb` driver | One language (JavaScript) across the whole project. Express is tiny, so the API stays a thin layer: each route is one procedure call, one SQL query or one pipeline, and the databases do the real work. Express 5 passes async errors to one error handler, which translates DB errors into friendly messages. |
| Front end | **React 18 + Vite** | Component reuse for the design system. Vite gives instant dev reloads and a built-in `/api` proxy. |
| Routing | React Router 6 | Tabs, filters and the page number live in the URL, so Back works. |
| Charts | Recharts | Declarative React charts; line and bar charts were all we needed. |
| Map | Leaflet + react-leaflet + OpenStreetMap tiles | Free, no API key. |
| Styling | Plain CSS with variables (`web/src/styles.css`) | Keeps the look consistent with no framework to learn; see the design system doc. |
| Tests | `node:test` (API), Vitest + Testing Library (UI) | Built-in or zero-config. |
| Deploy | Docker Compose (Postgres, Mongo, seeder, API, nginx serving the built web app) | One command for the evaluator. |

---

## 4. Assumptions

1. **Funding a gig starts it.** `fund_gig` creates the contract as `IN PROGRESS`, so the "one active gig per freelancer" rule applies at funding time. Seeded `FUNDED` contracts can still be moved to IN PROGRESS from the contract page.
2. Status changes only move forward (FUNDED → IN PROGRESS → COMPLETED). There is no cancel or refund flow; the assignment does not ask for one.
3. Revenue for the moving average is dated by `completed_at`, and only COMPLETED contracts count. The 7-day moving average for a day = total revenue in that day and the 6 days before it ÷ 7 (days without revenue count as zero).
4. The "running balance" is recomputed from `amount_changed` with a window function. It equals the trigger's `balance_after` (a test checks this).
5. A worker's position is their **latest** ping marked `is_available` inside the radius; distance, map dot and "last ping" all come from that one ping. Workers who already have a gig IN PROGRESS are shown with a "busy" badge.
6. Location pings expire after 2 hours (A1's TTL index). The API's ping simulator inserts 25 fresh pings every 5 s so the map is never empty. Turn it off with `SIMULATE_PINGS=false`.
7. Job-site presets are 5 well-known Hyderabad locations; any point clicked on the map also works.
8. "Best-rated freelancers" requires at least 5 reviews, so one 5★ review does not top the list.
9. Money is shown in ₹ with Indian digit grouping.
10. No authentication. "Acting as" is a demo switch, as the assignment allows.
11. `freelancers.is_available` is the freelancer's own "open to work" flag (shown as **Open to work**). "Busy" means the freelancer has a contract IN PROGRESS. The inherited `fund_gig` enforces only the busy rule (via the partial unique index); we kept that behaviour.

---

## 5. Changes to inherited code

The details and reasons are in the [handover note](docs/handover_note.md).

| File | Change |
|---|---|
| `sql/01_schema_dll.sql` | Renamed to `01_schema_ddl.sql` (the A1 README already used that name) |
| `sql/03_triggers_and_audit.sql` | Optional action label via `app.audit_action` (`GIG_FUNDED`, `DEPOSIT`) |
| `sql/04_stored_procedures.sql` | **Removed the invalid `ROLLBACK` in the exception block**; new gigs start `IN PROGRESS`; `INOUT p_contract_id`; drops the old signature; new `update_contract_status`, `deposit_escrow` |
| `sql/05_materialized_views.sql` | New `mv_refresh_log` table, written by the refresh procedure |
| `sql/06_window_analytics.sql` | Uses `completed_at`; **7-day average = window total ÷ 7** (A1's `AVG()` ignored days without revenue and overstated it); rank on the rounded value |
| `mongo/01_collections_and_indexes.js` | Re-runnable; selects the `gigtask` DB |
| `mongo/02_workflow3_geonear.js` | Added the 5 km `maxDistance` |
| `data_generation/postgres_seeder.py` | Consistent escrow history (no random audit rows); no future `completed_at`; faster bulk inserts; refreshes the MV; skips if already seeded |
| `data_generation/mongo_seeder.py` | Real Postgres UUIDs; seeds `GigReviews` and `Portfolios` too; review tags come from the freelancer's own portfolio skills; reviews are never dated in the future; skips if already seeded |
| `Untitled.png` | Removed (stray file) |

---

## 6. Repository structure

```text
├── README.md
├── docker-compose.yml
├── requirements.txt              # Python seeder dependencies
├── docs/
│   ├── handover_note.md
│   ├── api_endpoints.md
│   ├── A1_README.md              # inherited README, unchanged
│   ├── design/                   # users.md, design_system.md, wireframes/*.svg
│   └── screenshots/
├── sql/ mongo/ data_generation/  # from A1 (+ our fixes)
├── performance/                  # A1 evidence, unchanged
├── api/                          # Express server
│   ├── src/app.js                # routes wired together
│   ├── src/routes/*.js           # clients, freelancers, contracts, analytics, map, reviews
│   ├── src/errors.js             # DB error → friendly message
│   ├── src/simulator.js          # live location pings
│   └── test/fund-gig.test.js
└── web/                          # React app
    └── src/
        ├── components/           # Button, Card, DataTable, EntityPicker, states, PortfolioView…
        ├── pages/                # one file per screen (+ FundGigPage.test.jsx)
        ├── context/ActorContext.jsx
        ├── api.js  useApi.js  styles.css
```

---

## 7. Contribution

| Member | Roll no. | Design | Code |
|---|---|---|---|
| Srinjoy Majumdar | 2026201054 | API design (`docs/api_endpoints.md`), handover note | DB fixes (`sql/`, `mongo/`), both seeders, the whole `api/` server, Docker setup, semantic fixes, screenshots, demo video, final README |
| Chokkam Samiksha | 2026202017 | Users, wireframes, design system | Front-end setup and shared components, Browse + detail pages, contract status changer, Fund a Gig, Escrow Audit |
| Arya Jain | 2026201051 | Analytics / Map / Reviews layout | Analytics, Nearby Workers, Reviews screens; API and UI tests |
