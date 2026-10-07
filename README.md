# BOTM Notification Center

Backend for a member notification center: admins define notifications (event-triggered, filter-targeted, or CSV-targeted), members see a feed of what was sent to them, newest first, with an unread state.

**Stack:** Node.js 20 · TypeScript · Koa · MySQL (Aurora MySQL 3 compatible) · Kysely · Zod · Vitest

- [Running it](#running-it)
- [API](#api)
- [Workflow](#workflow)
- [Architecture decisions & tradeoffs](#architecture-decisions--tradeoffs)
- [Concerns](#concerns)
- [Assumptions](#assumptions)
- [What's missing for production](#whats-missing-for-production)

---

## Running it

Requires Node 20.12+ and Docker.

```sh
npm install
cp .env.example .env
npm run db:up          # MySQL on localhost:3307; loads db/schema.sql + db/seed.sql on first start
npm run dev            # API on localhost:3000
```

| Script                            | What it does                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start` | Watch mode / compile to `dist/` / run compiled                                                                                                       |
| `npm run typecheck` / `lint`      | `tsc --noEmit` / ESLint (`no-explicit-any` is an error)                                                                                              |
| `npm test`                        | Unit tests (pure domain logic, validation, SQL compilation). No DB needed                                                                            |
| `npm run test:integration`        | Integration tests against Docker MySQL. Each run creates and drops its own `notifications_test` DB from `db/schema.sql`; the dev DB is never touched |
| `npm run db:reset`                | Drop the Docker volume and reload schema + seed (needed after any `schema.sql` change)                                                               |

Seed data: 12 accounts covering each country (US, CA) / policy (Monthly, Annual) / status (New Member, Friend, BFF) and credits 0 to 5, plus notifications `1` (ENROLLED event, active), `2` (audiobook pre-order event, active), `3` (FILTER: US with ≥1 credit, active), `4` (CSV, `send_at` 2026-10-15).

## API

Auth is mocked. Admin and internal routes need `X-Admin-Key` (from `ADMIN_API_KEY`), member routes need `X-Account-Id`. Error messaging follows this format `{"error": {"code", "message"}}`.

| Method & path                              | Purpose                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `GET /health`                              | Liveness + DB ping (503 if the DB is unreachable)                                               |
| `POST /admin/notifications`                | Create (`type`: `EVENT` / `FILTER` / `CSV`). Always created inactive                            |
| `GET /admin/notifications?limit&offset`    | List, newest first                                                                              |
| `GET /admin/notifications/:id`             | Get one                                                                                         |
| `PATCH /admin/notifications/:id`           | Edit content; `delayDays` (EVENT) or filters (FILTER). `type`, `eventType`, `sendAt` are locked |
| `POST /admin/notifications/:id/activate`   | EVENT/FILTER only. FILTER sends to everyone eligible immediately                                |
| `POST /admin/notifications/:id/deactivate` | EVENT/FILTER only. Stops new sends, cancels pending (delayed) ones                              |
| `POST /admin/notifications/:id/remove`     | Remove from app for everyone. Permanent                                                         |
| `POST /admin/notifications/:id/recipients` | CSV notifications: raw `text/csv` body of account IDs                                           |
| `POST /admin/maintenance/run`              | Runs the filter sweep + 2-month cleanup (stand-in for cron jobs)                                |
| `POST /events`                             | Internal: a member did something (`SHIPPED`, `ENROLLED`, `AUDIOBOOK_PREORDER`)                  |
| `GET /me/notifications?limit&cursor`       | Member feed, newest first, cursor-paginated                                                     |
| `POST /me/notifications/:id/click`         | Mark clicked (clears the blue bubble). 204                                                      |

Examples (start from `npm run db:reset && npm run dev`):

```sh
# Event → member feed. Re-sending the same eventId returns deliveriesCreated: 0.
curl -s -X POST localhost:3000/events -H 'X-Admin-Key: local-admin-key' -H 'Content-Type: application/json' \
  -d '{"eventId":"enroll-1","accountId":1,"eventType":"ENROLLED","occurredAt":"2026-10-07T12:00:00Z"}'
curl -s localhost:3000/me/notifications -H 'X-Account-Id: 1'
# {"items":[{"id":1,"notificationId":1,"iconUrl":"…","headline":"Welcome to Book of the Month!",
#   "subheadline":"…","linkPath":"/my-box","sentAt":"2026-10-07T12:00:00.000Z","isClicked":false}],"nextCursor":null}

# Event notification with a 5-day delay
curl -s -X POST localhost:3000/admin/notifications -H 'X-Admin-Key: local-admin-key' -H 'Content-Type: application/json' \
  -d '{"type":"EVENT","iconUrl":"https://cdn.example.com/s.png","headline":"Your box shipped","subheadline":"Track it","linkPath":"/orders","eventType":"SHIPPED","delayDays":5}'

# Filter notification: members with exactly 3 credits on an annual plan
curl -s -X POST localhost:3000/admin/notifications -H 'X-Admin-Key: local-admin-key' -H 'Content-Type: application/json' \
  -d '{"type":"FILTER","iconUrl":"https://cdn.example.com/c.png","headline":"Use your credits","subheadline":"New picks are here","linkPath":"/this-month","policies":["ANNUAL"],"minCredits":3,"maxCredits":3}'

# CSV recipients
printf 'account_id\n1\n2\n2\n999\nabc\n' | curl -s -X POST localhost:3000/admin/notifications/4/recipients \
  -H 'X-Admin-Key: local-admin-key' -H 'Content-Type: text/csv' --data-binary @-
# {"submitted":3,"inserted":2,"skipped":1,"duplicateCount":1,"invalidLines":[{"line":6,"value":"abc"}]}

# Run the "cron jobs"
curl -s -X POST localhost:3000/admin/maintenance/run -H 'X-Admin-Key: local-admin-key'
```

`scripts/smoke.sh` runs a 24-request manual pass over all of the above (events, replay, sweep, clicks, delay + deactivate, CSV, remove, error cases). I was testing locally and figured I'd add them to a script so these tests are reusable. Also I included the output from my run after a clean reset, in docs/smoke-results-2026-10-07.txt

---

## Workflow

**Approach.** I set up the project before any code by creating rules, specs, etc. In `CLAUDE.md` I specificied stack, architecture, and working rules (plan first, one task at a time, typecheck/test, check in with me before commits, no features beyond the task list without approval). Plus, a requirements file made from the Product team's spec in the project directions. I had Claude Code read both files and produce `docs/tasks.md`, then worked through it phase by phase, reviewing and testing each phase before it was committed. That setup and scoping took 1-1.5 hours. The subsequent implementation of each Phase, review/adjustments by hand, and documentation took 4 hours. So total time was 5-5.5 hours.

**What I delegated to AI.** Drafting the task breakdown and data model, and implementing each phase of which you can see in the tasks file. My thinking was use tightly directed spec-driven development with AI to cover the project scope, from tooling, schema, domain functions and their unit tests, services, and an initial readme draft which I'm updating to my own words. Sometimes, I made code changes directly when it was something important that I could quickly address. For example, I realized any member could mark a delivery as clicked, so I added account_id in markDeliveryClicked. And where needed, I gave Claude direction where the spec was ambiguous and it had open questions for me.

**Where I pushed back.**

- **Scope.** The first plan had about 50 tasks plus a bunch of other nice-to-have things like a worker process, migration runner, multipart uploads, supertest, etc. I cut it the sweep and cleanup as plain functions behind one admin endpoint (documented as cron), a single `schema.sql`, one `dedupe_key` column instead of an events table, raw `text/csv` instead of multipart, UTC months, and essential tests only (pure logic, integration).
- **Correctness requirements I added to the plan:** deactivate deletes pending deliveries, all queries use an injected `now` (never SQL `NOW()`), mysql2 pool in UTC, the sweep skips removed notifications, the integration test advances a fake clock across a delay, deactivate runs in one transaction (which led to the row-lock design for the event-trigger race), activate rejects CSV and removed notifications.
- **A security bug.** In Phase 3 I noticed `markDeliveryClicked` filtered only on the delivery id, so any member could mark anyone's delivery clicked by guessing ids. I fixed it to scope by account, then the AI follow-up review made repeat clicks idempotent (`COALESCE`) and blocked clicks on not-yet-live deliveries.
- **Scope creep.** When Claude added cursor pagination without asking, I kept it as it was minor/good design choice. But I added a rule to `CLAUDE.md` that extras must be proposed first. In Phase 5 it flagged its small extras (shared key for `/events`, limit/offset on the admin list, error-format fixes) for approval instead of commiting it automatically, which was good. I'd add that rule upfront next time.
- **Verifying AI fixes.** After Phase 1 I reviewed Claude's fix for a schema bug it found (a `CHECK` that let `NULL` filter arrays through, because `JSON_TYPE(NULL)` is `NULL` and MySQL only rejects `FALSE`) before approving it.

**What I did by hand.** Wrote `CLAUDE.md` and the scoping decisions, reviewed every phase's diff, made the `markDeliveryClicked` fix, ran typecheck/lint/tests myself at each checkpoint, and ran curl tests manually first but then figured I'd make it a resuable 24-request curl script, which I ran against the dev server before signing off on the HTTP layer. The running log is in [`docs/AI_LOG.md`](docs/AI_LOG.md); the task list and every decision are in [`docs/tasks.md`](docs/tasks.md). Also, a lot of this README.

---

## Architecture decisions & tradeoffs

```
src/
  routes/        URL → middleware + controller wiring
  controllers/   validate input (zod), call one service, shape the response
  services/      one use case per file; read `now` from the injected Clock once
  data/          Kysely repositories, one per table; SQL lives only here
  domain/        pure logic: time windows, filter rules, CSV parsing, validation schemas
  middleware/    error handler, stub auth
db/schema.sql    the whole schema (CHECK constraints keep per-type columns consistent)
```

**Materialized deliveries, with `visible_at` instead of a scheduler.** Every notification a member receives is a row in `account_notifications` with the time it goes live. Event delays, audiobook publication dates, and CSV send dates are all just a future `visible_at`, and the feed filters `visible_at <= now`. So nothing needs to wake up at the right moment- only the filter sweep and cleanup run periodically. The alternative, computing each member's feed on read by evaluating every notification's rules, would make reads expensive and make "sent once per month" and "clicked" state hard to track. The cost is the write, because a filter notification for 1M members is 1M rows.

**Idempotency through one `dedupe_key` column.** `UNIQUE (notification_id, account_id, dedupe_key)` with `INSERT IGNORE` handles all three types. The caller's event id (a replayed event is a no-op, while two different referrals produce two notifications), the UTC month `'YYYY-MM'` for filters (once per static month), and `'once'` for CSV (re-uploads are safe). This replaced an events table, its repository, and a transaction.

**Set-based fan-out.** The filter sweep and CSV upload are each a single `INSERT IGNORE … SELECT FROM accounts WHERE …` rather than reading accounts into Node and inserting them in batches. The CSV form also drops unknown account ids for free (`WHERE id IN (…)`). The SQL filter is checked against the pure `matchesFilter` across 48 accounts covering every combination of attributes in the integration test. That way, the two can't silently diverge.

**Row locks for the deactivate race.** Deactivate sets the notification inactive and deletes its pending deliveries in one transaction. That alone doesn't stop an event trigger from reading "active", losing the race, and inserting afterwards. So the event trigger and the filter sweep read notifications `FOR SHARE` in the same transaction as their insert, and admin changes take `FOR UPDATE`. Whichever goes first, the other waits, and both orderings are covered by tests. The tradeoff is that deactivate briefly waits on in-flight triggers.

**The feed enforces the 2-month window itself.** The query has `visible_at >= start of previous UTC month`, so correctness doesn't depend on cleanup having run.

**Injected clock, UTC everywhere.** Services take `now` from a `Clock`, repositories take it as a parameter, SQL never calls `NOW()`, and the pool runs with `timezone: 'Z'`. This makes month boundaries, delays, and the visibility window testable by moving a fake clock, and removes any dependence on server/DB time zones.

**One wide `notifications` table with `CHECK` constraints.** Per-type columns are nullable, and `CHECK`s enforce which ones each type must or must not have. Filters are stored as JSON arrays and turned into SQL `IN` lists by the app. I chose this over a table per type or a join table per filter dimension. It's simpler to query, and the database still rejects bad rows. The tradeoff is that the JSON values aren't checked against the enums at the DB level (the app validates them).

**Smaller choices.** Kysely over an ORM, for typed queries with visible SQL, which matters for the `INSERT … SELECT` fan-out. A single `schema.sql` instead of migrations, which I figured is enough for the take-home. Foreign keys on deliveries, so integrity at a small bulk-insert cost. Keyset (cursor) pagination on `(visible_at, id)`, so pages stay stable as new notifications arrive. And any delivery a member can't see (someone else's, pending, removed, unknown) is a 404, so ids can't be probed.

**Deprioritized.** A real scheduler, migrations, route-level HTTP tests, an unread-count endpoint, image upload, and real auth. I aimed for functionality within the time frame and scope.

---

## Concerns

What I'd flag in a real code review, revisit with more time, or check with Product team about:

- **Filter freshness depends on the sweep cadence.** An account that becomes eligible mid-month only gets the notification at the next sweep, or when the notification is activated.
- **Large fan-outs are single statements.** The filter sweep is one `INSERT … SELECT` over all accounts per notification, and cleanup is one unbatched `DELETE`. At millions of rows, these become long statements that hold locks and cause replication lag. They should be chunked by an id range.
- **CSV uploads build one `IN (…)` list,** capped at 50,000 ids. Bigger lists would need chunking, or maybe load into a staging table first.
- **Hand-written Kysely types can drift from `schema.sql`.** Generating them (e.g. `kysely-codegen`) or adding a schema-vs-types check in CI would close that gap.
- **No route-level tests.** Services, repositories, and pure logic are tested, while controllers and middleware were verified with a manual curl pass (`scripts/smoke.sh`).
- **Content edits change already-delivered notifications** because deliveries reference the template. That's by design, but an admin fixing a typo and an admin changing the meaning look the same. Snapshotting content at send time would be a good alternative.
- **Audiobook publication date changes don't propagate.** A pending delivery keeps the date it was created with.
- **Deactivate then reactivate** doesn't restore cancelled pending deliveries. Replaying the original event ids would recreate them.
- **Events older than the window** are accepted but never visible. Rejecting or logging them would be clearer.
- **UTC months** mean the month boundary falls on the evening of the last day for US and Canadian members.
- **Lock contention:** event triggers take shared locks on hot notification rows. That's fine at this scale, but I'd watch it under heavy event volume.

## Assumptions

Basically what I'd follow up with Product team about their provided spec and the functionality they intended:

- **2-month window:** the current plus the previous calendar month (I assumed this was what was meant by static, not rolling). E.g sent Aug 15 → visible through Sep 30, gone Oct 1.
- **Filter re-sends:** once per calendar month while active. If a member is still eligible next month, they get it again.
- **Months are UTC.** This is simpler and consistent, at the cost of the boundary falling in the evening for North America.
- **Deactivate cancels pending deliveries** (e.g. an event that fired with a 5-day delay); already-visible ones stay.
- **Remove from app is permanent** and also deactivates. A removed notification can't be activated, edited, or receive recipients.
- **Edits:** content edits show everywhere, including on delivered copies. Filter and delay edits affect only future sends. `type`, `eventType`, and `sendAt` can't change after creation.
- **CSV notifications** are never active/inactive. Recipients can be uploaded repeatedly, but each account gets it at most once. If uploaded after `send_at`, members see it from the upload time, so it doesn't read as sent in the past. Unknown account ids are skipped and reported.
- **Audiobook pre-orders** go live at the publication date and ignore delay. If that date has already passed, it goes live immediately.
- **Events are posted by other services** to `POST /events` with their own unique `eventId`. Two referrals are two events, so two notifications.
- **"Sent 5 minutes ago"** is formatted by the client from the ISO `sentAt`. The blue bubble is `isClicked: false`.
- **Icon/image** is a URL for now (https only). **Link** is a path on our site (`/…`, not an external URL).
- **Accounts** live in an `accounts` table this service can read. Credits are whole numbers. The filter examples `<1`, `>=1`, `=3` map to `max 0`, `min 1`, `min 3 & max 3`.
- **Auth** is mocked, so would need to know existing auth flow, auth headers, etc.

## What's missing for production

- **Real auth:** member identity from the session/JWT, an admin identity with an audit trail, and a separate credential for internal callers of `/events`.
- **Scheduling:** run the sweep and cleanup on a cron (EventBridge → ECS task or Lambda), with a lock so only one instance runs at a time.
- **Fan-out at scale:** chunked or queued sends (SQS) for large filters and CSVs, with progress and status for admins.
- **Migrations:** this is a big one. A migration tool and generated DB types, instead of a single `schema.sql` reloaded by hand.
- **Observability:** structured logs with request ids, metrics (deliveries created, sweep duration, feed latency), tracing, and alerts on sweep failures.
- **Protection:** rate limiting on member endpoints and `/events`, request size limits tuned per route.
- **Database:** route feed reads to Aurora read replicas. Partition `account_notifications` by month, so cleanup is a partition drop instead of a big `DELETE`.
- **Product gaps:** an unread-count endpoint for the badge, image upload/CDN, an admin preview of who a filter would reach, and notification analytics (click-through).
- **Tests:** route-level tests, a schema-vs-types check, and load tests for the sweep and feed queries.
