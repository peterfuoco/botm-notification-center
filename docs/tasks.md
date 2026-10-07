# Tasks — BOTM Notification Center

Scope source: `docs/REQUIREMENTS.txt`. Rules: `docs/CLAUDE.md` (plan first, one task at a time, typecheck + test after each, log to `docs/AI_LOG.md`, check in before committing).

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Phase 0 — Project setup

- [x] **0.1 Tooling init**: `package.json`, TypeScript (`strict: true`, `noUncheckedIndexedAccess`), ESLint with `@typescript-eslint/no-explicit-any` as error, Prettier, `.gitignore`, `.nvmrc`
- [x] **0.2 npm scripts**: `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `db:reset` (`docker compose down -v && docker compose up -d`)
- [x] **0.3 Docker Compose**: MySQL 8 (Aurora MySQL 3 compatible), healthcheck, mounts `db/schema.sql` + `db/seed.sql` into `/docker-entrypoint-initdb.d/` (dev DB only)
- [x] **0.4 Config module** (`src/config/`): typed env loading/validation, `.env.example`
- [x] **0.5 Folder skeleton**: `src/{routes,controllers,services,data,domain,lib,config,middleware}`, `test/{unit,integration}`
- [x] **0.6 Clock**: `Clock` interface (`now(): Date`) in `src/lib/clock.ts` — system clock for the app, fake/advanceable clock for tests. Injected into services; nothing calls `new Date()` or SQL `NOW()` directly
- [x] **0.7 Test harness**: Vitest config (unit + integration projects)
- [x] **0.8 Koa app bootstrap**: app factory taking deps (db, clock) so it's testable without listening; body parser (JSON + `text/csv` via `extendTypes`), JSON error handler, `GET /health`

## Phase 1 — Schema (`db/schema.sql`, single file, no migration runner)

- [x] **1.1 `accounts`**: `id`, `country` (US/CA), `policy` (MONTHLY/ANNUAL), `relationship_status` (NEW_MEMBER/FRIEND/BFF), `credits` (int), `created_at`, `updated_at`
- [x] **1.2 `notifications`** (admin-defined template): `id`, `type` (EVENT/FILTER/CSV), `icon_url`, `headline`, `subheadline`, `link_path`, `is_active`, `removed_at` (nullable), `created_at`, `updated_at`
  - EVENT: `event_type` (SHIPPED/ENROLLED/AUDIOBOOK_PREORDER), `delay_days` (nullable)
  - FILTER: `filter_policies`, `filter_relationship_statuses`, `filter_countries` (JSON arrays; empty = all), `min_credits`, `max_credits` (nullable)
  - CSV: `send_at`
- [x] **1.3 `account_notifications`** (one row per delivery): `id`, `notification_id`, `account_id`, `visible_at`, `clicked_at` (nullable), `dedupe_key VARCHAR(64)`, `created_at`
  - `UNIQUE (notification_id, account_id, dedupe_key)` — EVENT: caller's event id · FILTER: `'YYYY-MM'` (UTC) · CSV: `'once'`
  - Index `(account_id, visible_at)` for the feed
- [x] **1.4 No SQL time defaults**: no `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE`; all timestamps written from the injected clock. All `DATETIME` values are UTC
- [x] **1.5 `db/seed.sql`**: sample accounts covering each filter dimension + one notification of each type

## Phase 2 — Domain logic (`src/domain/`, pure, unit-tested)

- [x] **2.1 Shared types & enums**: notification types, event types, account attributes
- [x] **2.2 Visibility cutoff**: `visibilityCutoff(now)` = start of previous UTC calendar month (sent Aug 15 → visible through Sep 30, gone Oct 1)
- [x] **2.3 Month key**: `monthKey(now)` → `'YYYY-MM'` in UTC
- [x] **2.4 Filter matcher**: `matchesFilter(account, filter)` — empty multi-select = all; min/max credits inclusive & optional (min=max covers "=3")
- [x] **2.5 Event go-live**: `visible_at = occurredAt + delay_days` (none/0 → immediate); AUDIOBOOK_PREORDER → `publicationDate`, ignoring delay
- [x] **2.6 CSV parsing**: split on newlines, trim, drop blanks + non-numeric header row, dedupe with a `Set`
- [x] **2.7 Validation** for request bodies: lengths, `link_path` is an internal path, `icon_url` is a URL, `min <= max`, valid enums, `eventId` required
- [x] **2.8 Unit tests** for all of the above (month/year boundaries, leap year, delay crossing a month, empty filters, CSV junk lines)

## Phase 3 — Data access (`src/data/`, one repo per file)

- [x] **3.1 Kysely instance**: mysql2 dialect pool with `timezone: 'Z'`; hand-written `Database` interface matching `schema.sql`
- [x] **3.2 `accountsRepo`**: get by id
- [x] **3.3 `notificationsRepo`**: create, get, list, update, set active, set removed, list active by event type, list active non-removed FILTER notifications
- [x] **3.4 `accountNotificationsRepo`**:
  - `INSERT IGNORE` single/bulk delivery
  - `INSERT IGNORE ... SELECT` from `accounts` for filter fan-out and CSV (`WHERE id IN (...)` skips unknown ids)
  - feed query, mark clicked, delete pending (`visible_at > now`) for a notification, delete expired (`visible_at < cutoff`)
  - every time comparison takes `now`/`cutoff` as a parameter — never `NOW()`
  - feed uses keyset (cursor) paging on `(visible_at, id)` — kept after review
  - mark clicked: scoped to the owning account and live deliveries (`visible_at <= now`); `COALESCE` keeps the first click time so repeat clicks succeed
- [x] **3.5 Repository integration test** (`test/integration/repositories.test.ts`): 48 fixture accounts (every filter combination); SQL filter fan-out checked against `matchesFilter`; dedupe, feed window/order/paging, click ownership, pending/expired deletes

## Phase 4 — Services (`src/services/`, one job per file, all take `now` from the clock)

- [x] **4.1 Create / update notification** — CSV has no editable `is_active`. Content edits show on existing deliveries (they reference the template); filter/delay edits affect future sends only. Update rejects removed notifications, fields that don't apply to the stored type, and a min/max credit range that's invalid once merged with stored values
- [x] **4.2 Activate** (EVENT/FILTER) — sets active; for FILTER, runs the filter sweep for that notification immediately. Rejects CSV and removed notifications (409)
- [x] **4.3 Deactivate** (EVENT/FILTER) — in **one transaction**: set inactive (the `UPDATE` locks the notification row), then delete its deliveries with `visible_at > now` (cancels pending delays / audiobook dates). Already-visible deliveries stay. Rejects CSV and removed notifications (409)
- [x] **4.4 Remove from app** — permanent; sets `removed_at` and `is_active = false`. Feed hides it for everyone
- [x] **4.5 Trigger event** — `{ eventId, accountId, eventType, occurredAt, publicationDate? }`; for each active, non-removed EVENT notification of that type, `INSERT IGNORE` a delivery with `dedupe_key = eventId` and computed `visible_at`. Every distinct event = a new notification (2 RAF friends → 2). Runs in a transaction that reads active notifications `FOR SHARE`, so it serializes with deactivate: either it sees the notification inactive, or deactivate waits and then deletes what it inserted
- [x] **4.6 Filter sweep** — plain function; for each active, **non-removed** FILTER notification, `INSERT IGNORE ... SELECT` matching accounts with `dedupe_key = monthKey(now)`, `visible_at = now`
- [x] **4.7 CSV recipients** — CSV notifications only; no `is_active` check (CSV is always stored inactive) but rejects removed. Parse raw text (2.6), reject over `MAX_CSV_IDS`, single `INSERT IGNORE ... SELECT` with `visible_at = max(send_at, now)`, `dedupe_key = 'once'`; returns `{ submitted, inserted, invalidLines, duplicateCount }`
- [x] **4.8 Member feed** — `visible_at <= now`, `visible_at >= visibilityCutoff(now)` (correct even if cleanup never ran), notification not removed, **no `is_active` check** (deactivated notifications stay visible to prior recipients), newest first, cursor-paginated; returns ISO `sentAt` + `isClicked`
- [x] **4.9 Mark clicked** — idempotent; only the caller's own, live delivery whose notification isn't removed; otherwise 404
- [x] **4.10 Cleanup** — plain function; hard-deletes deliveries older than `visibilityCutoff(now)`

## Phase 5 — HTTP layer (`src/routes/` + `src/controllers/`)

- [ ] **5.1 Auth stubs**: admin via `X-Admin-Key`, member via `X-Account-Id`; consistent error format

Admin:
- [ ] **5.2** `POST /admin/notifications`, `GET /admin/notifications`, `GET /admin/notifications/:id`, `PATCH /admin/notifications/:id`
- [ ] **5.3** `POST /admin/notifications/:id/activate`, `/deactivate`, `/remove`
- [ ] **5.4** `POST /admin/notifications/:id/recipients` — body is raw `text/csv`
- [ ] **5.5** `POST /admin/maintenance/run` — runs filter sweep + cleanup (stand-in for a cron job)

Events (internal):
- [ ] **5.6** `POST /events` — `{ eventId, accountId, eventType, occurredAt, publicationDate? }`

Member:
- [ ] **5.7** `GET /me/notifications?cursor=&limit=`
- [ ] **5.8** `POST /me/notifications/:id/click`

## Phase 6 — Integration tests

- [x] **6.1 Test DB lifecycle** (`test/helpers/testDb.ts`): `beforeAll` creates a fresh `notifications_test` database and loads `db/schema.sql` into it; `afterAll` drops it. Never touches the dev DB
- [x] **6.2 End-to-end through services with the fake clock** (`test/integration/services.test.ts`, built alongside Phase 4):
  1. Create + activate an EVENT notification with a 5-day delay; trigger an event → feed empty
  2. Re-send the same `eventId` → still one delivery (idempotent)
  3. Advance clock 5 days → notification visible with correct `sentAt`; click it → `isClicked`
  4. Trigger another event, deactivate before its delay elapses, advance clock → pending one never appears; the earlier one is still visible
  5. FILTER: sweep twice in the same month → one delivery; advance to next month and sweep → second delivery
  6. Remove from app → hidden from feed; sweep does not re-send it
  7. Advance past the 2-month window → hidden from feed; cleanup deletes the rows
  8. Deactivate vs. event trigger race, both orderings (row locks serialize them)

## Phase 7 — README & delivery

- [ ] **7.1 Setup**: Docker, `db:reset`, run, test; API reference with curl examples
- [ ] **7.2 Workflow**: approach, what was delegated to AI, pushback, by-hand work (from `docs/AI_LOG.md`)
- [ ] **7.3 Architecture & tradeoffs**: materialized deliveries + `visible_at` instead of a scheduler, `dedupe_key` + `INSERT IGNORE` for idempotency, injected clock, UTC everywhere, single schema file
- [ ] **7.4 Concerns**: filter freshness depends on how often the sweep runs; large CSV → one big `IN (...)`; hand-written Kysely types can drift from `schema.sql`; no route-level tests
- [ ] **7.5 Assumptions**: everything in Decisions below
- [ ] **7.6 Production gaps**: real auth, scheduled cron (EventBridge/ECS) for sweep + cleanup, queue for large fan-out, migrations tool, observability, rate limiting, read replicas, partitioning for retention
- [ ] **7.7 Final pass**: typecheck, lint, tests green; push to public GitHub repo

---

## Decisions

- **2-month window**: current + previous UTC calendar month. Sent Aug 15 → visible through Sep 30, gone Oct 1. Feed enforces it; cleanup just reclaims rows.
- **Filter re-send**: once per UTC calendar month (`dedupe_key = 'YYYY-MM'`).
- **Time**: UTC everywhere. mysql2 pool `timezone: 'Z'`. All time comparisons use the injected clock's `now`, never SQL `NOW()`.
- **Deactivate**: cancels pending deliveries (`visible_at > now`); visible ones stay. Runs in one transaction; event triggers read `FOR SHARE` so the two serialize.
- **Activate / deactivate**: EVENT and FILTER only; CSV and removed notifications are rejected (409).
- **CSV upload after `send_at`**: `visible_at = max(send_at, now)` so it doesn't read as sent in the past.
- **Clicks**: owner only, live only, first click time kept; repeat clicks succeed.
- **Remove from app**: permanent; also deactivates. Excluded from feed and from the filter sweep.
- **Edits after go-live**: content edits apply everywhere; filter/delay edits affect future sends only.
- **Idempotency**: single `dedupe_key` column — event id / month / `'once'`. No events table.
- **No scheduler**: filter sweep and cleanup are plain functions, called from tests and `POST /admin/maintenance/run`; documented as a cron job.
- **Schema**: one `db/schema.sql`, loaded by Docker init (dev) and by the integration test's `beforeAll` (test DB). No migration runner.
- **CSV**: raw `text/csv` body, no multipart.
- **DB layer**: Kysely + mysql2.
- **Auth**: stubbed — `X-Admin-Key` (admin), `X-Account-Id` (member).
- **Testing**: Vitest; unit tests for pure logic + one integration test. No supertest.
- **Timestamps**: API returns ISO `sentAt`; frontend formats "5 minutes ago".
- **Images**: URL string only.
