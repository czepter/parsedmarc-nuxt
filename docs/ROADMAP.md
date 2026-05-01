# Product Roadmap — parsedmarc-nuxt

> **Scope of this document.** Milestone-based delivery sequence to v1.0 and beyond. Sequenced by dependency, not by date. The "what" lives in [`PRD.md`](PRD.md). The "why" lives in [`VISION.md`](VISION.md). Implementation conventions live in [`../AGENTS.md`](../AGENTS.md).
>
> **Why no calendar dates?** This is a pre-1.0 project with a small core team. Dates would go stale within weeks. Each milestone exits when its acceptance criteria are met — that is the schedule.
>
> **How to read.** Each milestone has: a goal sentence, an exit-criteria checklist, the PRD requirements it satisfies, and the dependencies it unlocks. Pick up work from the earliest open milestone; do not start later milestones until earlier ones are closed.

---

## Status Legend

- `[ ]` — not started
- `[~]` — in progress
- `[x]` — done
- `[-]` — explicitly skipped / superseded

---

## M0 — Foundation (Documentation & Decisions)

**Goal.** Establish project intent, decisions, and conventions so every subsequent milestone is implementation, not deliberation.

**Exit criteria**

- [x] `AGENTS.md` rewritten as the prescriptive contract (13 sections)
- [x] `docs/VISION.md` written
- [x] `docs/PRD.md` written
- [x] `docs/ROADMAP.md` written (this file)
- [x] `README.md` rewritten as a quickstart that points at the four docs above

**Satisfies.** Setup readability for every future contributor (PRD NFR-D1).

**Unlocks.** All later milestones — they assume these documents are stable.

---

## M1 — Build Surface Ready

**Goal.** A `pnpm install && pnpm dev` produces a working dev server with all chosen libraries available, Tailwind compiling, and migrations applying. No features yet — just a foundation that won't be re-litigated.

**Exit criteria**

- [x] Tailwind installed and configured (PRD section 3 / AGENTS.md 11.1)
- [x] `pnpm dlx shadcn-nuxt init` run; at least one shadcn primitive renders styled in `app.vue` as a smoke test
- [x] All locked-in deps installed (AGENTS.md 11.2): `imapflow`, `mailparser`, `fast-xml-parser`, `maxmind`, `nuxt-auth-utils`, `croner`, `uplot`, `better-sqlite3`, plus types (`@types/mailparser`)
- [x] `nuxt.config.ts` declares `runtimeConfig` with placeholders for `sessionPassword`, `maxmindLicenseKey`, `databaseUrl`
- [x] `.env.example` written with every recognized env var commented
- [x] `.gitignore` updated to include `data/`
- [x] Real Prisma schema written from AGENTS.md section 5 model inventory
- [x] `pnpm exec prisma migrate dev --name init` runs cleanly against `data/parsedmarc.db`
- [x] `pnpm test` and `pnpm test:e2e` both pass (with whatever placeholder tests exist)

**Satisfies.** PRD J1.R1 (one-shot install path), AGENTS.md section 11 known gaps 1–4, 7, 8.

**Unlocks.** M2, M3, M4 in parallel.

---

## M2 — Auth & Setup Flow

**Goal.** A fresh deployment routes a first visitor through operator account creation and gates everything else behind login.

**Exit criteria**

- [x] `nuxt-auth-utils` configured with session cookie + password hashing (argon2 or bcrypt)
- [x] `/setup` page renders only when no `User` rows exist
- [x] `/setup` POST creates the first operator and logs them in
- [x] `/login` page + POST handler
- [x] `/logout` POST handler
- [x] Auth middleware redirects unauthenticated requests to `/login` (except `/setup`, `/login`, `/api/health`)
- [x] Rate limiter on `/login` (5/IP/5min)
- [x] `/api/health` returns `{ status, db, mmdb }` JSON
- [x] Playwright e2e: setup → logout → login → see dashboard placeholder

**Satisfies.** PRD J1.R2, NFR-S1, NFR-S4, NFR-S5, NFR-O3.

**Unlocks.** M3 (any UI behind auth), M4 (any inbox admin behind auth).

---

## M3 — GeoIP Bootstrap & Scheduler

**Goal.** Server start downloads the MMDB if missing; croner is wired up so future jobs can be registered against it.

**Exit criteria**

- [x] `app/server/plugins/geoip-bootstrap.ts` written: checks `data/GeoLite2-City.mmdb`, downloads from MaxMind on miss / age > 35d, instantiates and caches the `Reader`
- [x] `lib/geoip/lookup.ts` exposes `lookupIp(ip)` returning `{ country, city, lat, lon } | null`, reading from cache table first
- [x] `app/server/plugins/scheduler.ts` written: registers a no-op croner job at start as a smoke test, plus a monthly MMDB-refresh job (`0 4 1 * *`)
- [x] Server starts cleanly with `MAXMIND_LICENSE_KEY` set; logs warning (not error) if unset
- [x] Server starts cleanly even if MaxMind is unreachable (downloads are best-effort, lookups return `null` until file exists) — NFR-R3
- [x] Unit tests for `lib/geoip/lookup.ts` using a fixture MMDB

**Satisfies.** AGENTS.md known gaps 5, 6; PRD NFR-P3, NFR-R3.

**Unlocks.** M5 (records can be enriched).

---

## M4 — Inbox Administration

**Goal.** Operator can add, edit, enable/disable, and delete IMAP inboxes. Connection test on save. Passwords encrypted at rest.

**Exit criteria**

- [x] `app/server/utils/encryption.ts` provides `encrypt(text)` / `decrypt(cipher)` using AES-256-GCM with a key derived from `NUXT_SESSION_PASSWORD`
- [x] `POST /api/inboxes` validates input (Zod), tests connection via `imapflow`, encrypts password, creates row
- [x] `PUT /api/inboxes/[id]` mirrors POST; empty password leaves existing unchanged
- [x] `DELETE /api/inboxes/[id]` cascades to owned reports, records, runs
- [x] `/inboxes` list page (PRD J4.R1)
- [x] `/inboxes/new` and `/inboxes/[id]/edit` pages (PRD J1.R3, J4.R2)
- [x] "Scan now" button calls `POST /api/inboxes/[id]/scan` (PRD J4.R3)
- [x] `/inboxes/[id]/runs` shows ScanRun history (PRD J4.R4)

**Satisfies.** PRD J1.R3, J4.R1–R4, NFR-S2, NFR-S6.

**Unlocks.** M5 (real inboxes to scan).

---

## M5 — DMARC Parser & Ingestion Pipeline

**Goal.** Croner-driven IMAP poll fetches messages, parses aggregate and forensic reports, persists records, enriches with GeoIP. Single bad message does not break the run.

**Exit criteria**

- [x] `lib/imap/client.ts` wraps `imapflow` with connect/disconnect helpers
- [x] `lib/imap/dispatcher.ts` classifies a parsed message → `aggregate` | `forensic` | `unknown`
- [x] `lib/dmarc/aggregate.ts` parses XML (zip, gz, plain) → typed `AggregateReport` + `AggregateRecord[]`
- [x] `lib/dmarc/forensic.ts` parses AFRF / `message/feedback-report` → typed `ForensicReport`
- [x] `app/server/utils/ingest.ts` wires it together: dispatch → upsert → enrich
- [x] Per-inbox croner job in `scheduler.ts` calls the ingest pipeline
- [x] Every poll writes a `ScanRun` row regardless of outcome (NFR-O1)
- [x] One bad message does not block the rest of the batch (NFR-R1)
- [x] One bad inbox does not block other inboxes (NFR-R2)
- [x] Unit tests against fixture corpus in `test/fixtures/dmarc/` (NFR-T3): Google, Microsoft, Yahoo, Mailru, plus one weird/malformed sample
- [x] Coverage on `lib/dmarc/` and `lib/imap/dispatcher.ts` >= 80% (NFR-T1)

**Satisfies.** PRD J1.R4, NFR-O1, NFR-R1, NFR-R2, NFR-T1, NFR-T3.

**Unlocks.** M6 (data exists to display).

---

## M6 — Dashboard MVP

**Goal.** The 30-second glance from VISION.md works. Summary tiles + hero chart + recent records table on `/`.

**Exit criteria**

- [x] `/` route renders: tiles (J2.R1), uPlot hero chart (J2.R2), records table (J2.R3)
- [x] Time window selector (24h / 7d / 30d / 90d / custom)
- [x] uPlot wrapper component in `app/components/charts/TimeSeries.vue`
- [x] Initial paint under 1.5 s on 100k-record DB (NFR-P1) — measured, not assumed
- [x] Chart smooth at 5,000 points (NFR-P4)
- [x] Records table: pagination 50/page, sort by time/count, filter by disposition

**Satisfies.** PRD J2.R1–R3, NFR-P1, NFR-P4.

**Unlocks.** M7 (drill-down has somewhere to start from).

---

## M7 — Investigation Views

**Goal.** Drill-down is functional: domain detail, IP detail, forensic viewer, search.

**Exit criteria**

- [x] `/domains/[name]` (PRD J3.R1)
- [x] `/ips/[ip]` (PRD J3.R2)
- [x] `/forensics/[id]` with raw EML toggle and PII indicator (PRD J3.R3)
- [x] Global search (PRD J3.R4) — debounced 300ms, grouped results, keyboard nav

**Satisfies.** PRD J3.R1–R4.

**Unlocks.** M8 (settings is the last user-facing surface).

---

## M8 — Settings & Maintenance

**Goal.** Operator can manage their account, refresh GeoIP on demand, export the database.

**Exit criteria**

- [x] `/settings` page with MMDB status panel (PRD J5.R1)
- [x] "Refresh GeoIP now" button triggers downloader
- [x] Password change form (current + new + confirm)
- [x] "Download SQLite snapshot" link uses `BACKUP TO`, names file `parsedmarc-YYYY-MM-DD.db` (PRD J5.R2)

**Satisfies.** PRD J5.R1, J5.R2.

**Unlocks.** v1.0 release candidate.

---

## M9 — Polish, Accessibility, Dark Mode

**Goal.** The product looks like Umami, behaves like Umami, works for keyboard-only and screen-reader users. Dark mode everywhere.

**Exit criteria**

- [ ] Dark mode parity (Tailwind `darkMode: 'class'`, system-preference detection, manual toggle in header)
- [ ] Keyboard navigation audit: every interactive element reachable, focus rings visible (NFR-A1)
- [ ] Color audit: no color-only meaning (NFR-A2)
- [ ] Form accessibility: labels associated, errors `aria-describedby` (NFR-A3)
- [ ] Chart accessibility: data-table fallback link (NFR-A4)
- [ ] i18n scaffolding via `vue-i18n` even with one locale (NFR-I1)
- [ ] Dates render in browser locale (NFR-I2)
- [ ] Visual pass against the look-and-feel targets in AGENTS.md section 10

**Satisfies.** PRD NFR-A1–A4, NFR-I1, NFR-I2.

**Unlocks.** Release.

---

## M10 — Production Packaging

**Goal.** A production deployment is one `docker compose up` away.

**Exit criteria**

- [ ] `Dockerfile` (multi-stage, alpine-based, non-root user)
- [ ] `docker-compose.yml` with volume for `data/`
- [ ] Healthcheck wired to `/api/health`
- [ ] Migrations run on container start (`prisma migrate deploy`)
- [ ] Structured JSON logs in production, pretty in dev (NFR-O2)
- [ ] CI: GitHub Actions workflow runs `pnpm install`, `pnpm test`, `pnpm test:e2e`, builds the image, pushes on tagged release
- [ ] `README.md` Docker quickstart section verified end-to-end

**Satisfies.** PRD J1.R1 (Docker path), NFR-O2.

**Unlocks.** v1.0 tag.

---

## v1.0 Release

**Exit criteria**

- [ ] Every PRD `Jx.Ry` and `NFR-*` requirement passes (PRD section 7.1, 7.2)
- [ ] The "Sam clones it on a Tuesday" scenario from VISION.md works against a real IMAP server with real DMARC reports (PRD section 7.3)
- [ ] AGENTS.md section 12 status checklist fully checked through M10 items (PRD section 7.4)
- [ ] Git tag `v1.0.0` created, release notes drafted

---

## Post-v1 Horizon (Considered, Not Committed)

These are *not* commitments. They are the candidate pool for v1.x and v2.x. Inclusion here means the idea has merit and a rough place; promotion to a milestone requires a separate scoping discussion.

### Likely v1.x

- **Read-only viewer accounts.** A second user role; PRD persona work.
- **Email digest (opt-in).** Weekly summary email — opt-in only, against the "quiet by default" principle but a frequent ask.
- **CSV export of records.** From any list view.
- **Saved filters.** Persist common dashboard filter combinations as URLs.
- **Rate-limit display.** Show how close each inbox is to its receiver's report-rate.
- **Webhook on-anomaly.** A simple webhook fires when scan-over-scan disposition rate changes by > X%.

### Speculative v2.x

- **Multi-org / row-level isolation.** Forward-compat is in the data model already (`AGENTS.md` section 5 / 11). Promotion requires real demand.
- **API tokens.** For programmatic access to records.
- **Plugin / extension system.** Custom parsers, custom enrichers.
- **Postgres support.** As an alternative to SQLite for very large deployments. Adds operational weight; only worth it if SQLite genuinely caps out.
- **TLS-RPT and BIMI dashboards.** Adjacent email-auth report types.

### Explicitly Not on the Horizon

- Hosted SaaS — see VISION.md "What We Are Explicitly Not".
- DMARC policy recommendations / DNS edits — same.
- Anything that requires a JVM, Python, or external search index.

---

## How to Propose a Roadmap Change

1. Open an issue titled `roadmap: <proposal>` describing the change and which milestone(s) it affects.
2. If the proposal advances scope into v1.0, justify against PRD section 6 ("Out of Scope").
3. If accepted, this file is updated in the same PR that lands the first commit of work.
