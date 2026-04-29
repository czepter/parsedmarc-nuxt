# Product Requirements Document — parsedmarc-nuxt

> **Scope of this document.** What the product *does* and how we know it's done. Functional requirements grouped by user journey, plus non-functional requirements. The "why" lives in [`VISION.md`](VISION.md). The "when" lives in [`ROADMAP.md`](ROADMAP.md). Implementation details (libraries, file layout) live in [`../AGENTS.md`](../AGENTS.md).
>
> **Audience.** Implementers (human or AI) who need a precise, testable definition of complete.
>
> **Versioning.** This document describes **v1.0**. Post-v1 items are called out explicitly and are *not* requirements for the first release.

---

## 1. Glossary

| Term | Meaning |
|------|---------|
| **Operator** | The single human running this deployment (Sam from `VISION.md`). v1 assumes one operator account; multi-user is post-v1. |
| **Inbox** | An IMAP credential the system polls for DMARC reports. One deployment can have many. |
| **Aggregate report (RUA)** | DMARC daily summary XML, normally inside a `.zip` or `.gz` email attachment. RFC 7489 Appendix C. |
| **Forensic report (RUF / AFRF)** | Per-message DMARC failure report. RFC 6591. |
| **Domain** | A DNS domain mentioned as `header_from` in an aggregate report. Auto-discovered. |
| **Record** | A single `<record>` row inside an aggregate report (one source IP). |
| **Disposition** | DMARC verdict from a record's `<policy_evaluated>`: `none`, `quarantine`, or `reject`. |
| **Alignment** | Whether SPF/DKIM authenticated against a domain that matches the `From:` header (strict vs relaxed). |
| **Scan run** | One execution of the IMAP poll job for one inbox. Logged to the `ScanRun` table. |

## 2. Personas (v1)

- **Operator** — sets up the deployment, manages inboxes, reads dashboards. The only persona in v1.
- (Post-v1: **Read-only viewer**, **Auditor**.)

## 3. User Journeys & Functional Requirements

Five journeys cover v1. Each requirement has an **ID** (`Jx.Ry`), a **functional spec**, and **acceptance criteria**. IDs are stable — refer to them in PRs and issues.

---

### J1. First-time setup (the 15-minute promise)

A fresh operator goes from `git clone` (or `docker compose up`) to seeing real data on the dashboard in under 15 minutes.

#### J1.R1 — One-shot install

- **Spec.** A documented setup path that, on a clean machine with Node 20+ and pnpm installed, gets the operator to a running dev server. Equivalent path via Docker compose for production.
- **Acceptance.**
  - `README.md` lists exactly: `pnpm install`, `pnpm exec prisma migrate dev`, `pnpm dev` — no other steps required.
  - A `Dockerfile` and `docker-compose.yml` exist; `docker compose up` produces a running container with persistent volumes for `data/`.
  - On first start, the absence of the GeoLite2 MMDB does **not** crash the server (it triggers a download or logs a clear warning if the license key is missing).

#### J1.R2 — Operator account creation

- **Spec.** First request to the running server, when no `User` rows exist, redirects to a setup page that creates the initial operator account (email + password). Subsequent visits redirect unauthenticated users to login.
- **Acceptance.**
  - `GET /` with no users in DB → 302 to `/setup`.
  - `GET /setup` when a user already exists → 404 (or 302 to `/login`).
  - Password is stored as a salted hash (bcrypt or argon2 via `nuxt-auth-utils` patterns). Plaintext is never persisted or logged.
  - Email format is validated; password minimum length 12 characters.

#### J1.R3 — Add the first inbox

- **Spec.** Authenticated operator can add an IMAP inbox via a form: label, host, port, TLS toggle, username, password, optional "Processed" folder, poll cron.
- **Acceptance.**
  - Form submit triggers an immediate connection test (`imapflow` connect + logout). Failure surfaces a human-readable error, no row created.
  - On success, the password is encrypted at rest using a key derived from the session secret. `Inbox.passwordEncrypted` is opaque ciphertext; the cleartext is never persisted.
  - Default poll cron is `*/15 * * * *` if the operator leaves it blank.
  - Default "Processed" folder field is empty (in which case messages are simply marked seen, not moved).

#### J1.R4 — First successful scan

- **Spec.** Within one cron tick of adding an inbox, the system fetches unseen messages, parses any DMARC reports, and writes records to the DB.
- **Acceptance.**
  - A `ScanRun` row is written for every poll attempt with `startedAt`, `finishedAt`, `messagesSeen`, `reportsParsed`.
  - Errors during a scan populate `ScanRun.errorMessage` but do **not** halt subsequent inboxes.
  - The dashboard reflects parsed records within 5 seconds of the scan completing (no manual refresh required for data freshness, but page reload is acceptable in v1).

---

### J2. The daily/weekly glance (the 30-second check)

The operator opens the dashboard, scans summary tiles, confirms normality, closes the tab.

#### J2.R1 — Dashboard summary tiles

- **Spec.** Top of the dashboard shows tiles for the selected time window (default: last 7 days):
  - Total messages reported
  - DMARC pass rate (% of messages with `disposition=none` AND aligned)
  - Top sending source IP
  - Top sending country
  - Number of distinct sender IPs
- **Acceptance.**
  - All five tiles render in under 500 ms on a DB containing 100k records.
  - Time window selector offers: 24h, 7d, 30d, 90d, custom range.
  - Tiles show a delta versus the previous equivalent period (e.g. "+3.2pp vs prior week").

#### J2.R2 — Hero time-series chart

- **Spec.** A single uPlot chart below the tiles showing message volume over time, stacked by DMARC disposition (`none` / `quarantine` / `reject`).
- **Acceptance.**
  - Renders smoothly (no jank) at 90 days × hourly granularity (~2160 points × 3 series).
  - Tooltip on hover shows exact counts per disposition for the hovered bucket.
  - Zoom by drag-select; reset on double-click.
  - Granularity (hour / day / week) auto-selected based on time window.

#### J2.R3 — Recent records table

- **Spec.** Below the chart, a paginated table of the most recent `AggregateRecord` rows. Columns: timestamp, source IP, country, count, disposition, header_from, DKIM, SPF.
- **Acceptance.**
  - 50 rows per page; total count shown.
  - Sortable by timestamp and count.
  - Filterable by disposition (multi-select chip).
  - Clicking a source IP navigates to the IP detail view (J3.R2).

---

### J3. Investigation (the "what is going on" view)

Something on the dashboard caught the operator's eye. They drill in.

#### J3.R1 — Domain detail view

- **Spec.** `/domains/[name]` shows the dashboard tiles and chart filtered to one domain, plus a list of distinct sending IPs ranked by volume.
- **Acceptance.**
  - Lists every IP that has sent reported mail for this domain in the time window.
  - Each row: IP, country, total count, alignment rate, last seen.
  - Click-through to IP detail.

#### J3.R2 — IP detail view

- **Spec.** `/ips/[ip]` shows everything we know about one source IP: country/city from GeoLocation, all aggregate records grouped by domain, all forensic reports if any.
- **Acceptance.**
  - GeoLocation row, if present, shows country, city, lat/lon, last lookup time.
  - Records grouped by `header_from` domain with totals.
  - Forensic reports section appears only if rows exist.

#### J3.R3 — Forensic report viewer

- **Spec.** `/forensics/[id]` shows one forensic report with raw EML toggle, parsed headers, and a "what failed" annotation (which auth check produced the failure).
- **Acceptance.**
  - Headers rendered as a key-value table.
  - "View raw EML" reveals the original message in a `<pre>` block.
  - PII warning shown if the body contains recognizable personal-data indicators (email addresses in the body, etc.) — informational, not blocking.

#### J3.R4 — Search

- **Spec.** Global search box accepts: domain name, source IP, report ID. Returns matching domains / IPs / reports.
- **Acceptance.**
  - Debounced 300 ms.
  - Results grouped by entity type with at most 5 per group.
  - Keyboard-accessible (arrow keys to navigate, Enter to open).

---

### J4. Inbox administration

The operator manages the set of mailboxes being polled.

#### J4.R1 — Inbox list

- **Spec.** `/inboxes` lists every `Inbox` row with: label, host, status (last scan result), enabled toggle, edit / delete actions.
- **Acceptance.**
  - Status column shows: green check (last scan succeeded), yellow warning (last scan had errors), grey (never scanned), red X (last scan failed completely). Hovering shows the exact `ScanRun.finishedAt` and any `errorMessage`.
  - Disabling an inbox via toggle takes effect on the next cron tick.
  - Delete prompts for confirmation; cascades to delete owned `AggregateReport`, `AggregateRecord`, `ForensicReport`, `ScanRun` rows.

#### J4.R2 — Inbox edit

- **Spec.** Edit form mirrors add form (J1.R3). Changing host/port/credentials triggers a re-test before save.
- **Acceptance.**
  - Password field is empty in edit mode; submitting empty leaves the existing password unchanged.
  - Cron expression is validated (croner accepts it) before save.

#### J4.R3 — Manual scan trigger

- **Spec.** Each inbox has a "Scan now" button that runs the poll job out-of-band.
- **Acceptance.**
  - Disabled while a scan is in progress for that inbox.
  - Result (success / error) appears as a toast within 30 s for typical mailboxes.

#### J4.R4 — Scan history

- **Spec.** `/inboxes/[id]/runs` lists `ScanRun` rows for that inbox, most recent first, paginated 50 per page.
- **Acceptance.**
  - Columns: started, duration, messages seen, reports parsed, error (truncated, expandable).

---

### J5. Settings & maintenance

Things the operator does once or rarely.

#### J5.R1 — Settings page

- **Spec.** `/settings` exposes:
  - GeoLite2 MMDB status (path, file size, last refresh, age)
  - "Refresh GeoIP database now" button
  - Operator account: email, change password
- **Acceptance.**
  - MMDB section warns visually if the file is older than 35 days or missing.
  - Password change requires the current password.

#### J5.R2 — Database export

- **Spec.** Settings page offers a "Download SQLite snapshot" link that streams the `data/parsedmarc.db` file with a sane filename.
- **Acceptance.**
  - Uses `BACKUP TO` (better-sqlite3 supports it) — does not corrupt while writes are in flight.
  - Filename includes ISO date: `parsedmarc-YYYY-MM-DD.db`.

---

## 4. Non-Functional Requirements

### 4.1 Performance

- **NFR-P1.** Dashboard initial paint under 1.5 s on a database with 100k aggregate records, on a Raspberry Pi 4 / equivalent ARM64.
- **NFR-P2.** IMAP poll for a mailbox with 100 unseen messages completes in under 60 s (network-bound; this is a soft target).
- **NFR-P3.** GeoIP lookup latency under 1 ms per IP after MMDB is loaded (in-memory `Reader`, no I/O per call).
- **NFR-P4.** Time-series chart renders 5,000 points without jank (60fps) on mid-tier hardware.

### 4.2 Security

- **NFR-S1.** All authenticated routes require a valid session via `nuxt-auth-utils` middleware. The only unauthenticated routes are `/login`, `/setup` (when no users exist), and `/api/health`.
- **NFR-S2.** IMAP passwords are encrypted at rest with AES-256-GCM (or equivalent provided by `nuxt-auth-utils`). Encryption key is derived from `NUXT_SESSION_PASSWORD` or a dedicated `NUXT_ENCRYPTION_KEY` env var. Loss of the key means inboxes must be re-credentialed; this is documented.
- **NFR-S3.** The MaxMind license key, session secret, and any IMAP password never appear in logs at any level.
- **NFR-S4.** All form posts are protected against CSRF (nuxt-auth-utils default).
- **NFR-S5.** Rate limit `/login` to 5 attempts per IP per 5 minutes.
- **NFR-S6.** `app/server/api/**` routes validate input shape (Zod or equivalent) before reaching the DB.

### 4.3 Reliability

- **NFR-R1.** A single bad message (unparseable XML, malformed MIME) must not prevent processing of subsequent messages in the same scan.
- **NFR-R2.** A failing inbox (auth error, network timeout) must not prevent other inboxes from being scanned in the same croner tick.
- **NFR-R3.** Server start does not block on MMDB download. If download fails, log a warning and continue; GeoIP lookups return `null` until the file is available.
- **NFR-R4.** Database migrations run idempotently on startup (or via explicit `pnpm exec prisma migrate deploy`).

### 4.4 Observability

- **NFR-O1.** Every scan writes a `ScanRun` row regardless of outcome.
- **NFR-O2.** Logs are structured (JSON in production, pretty in dev) at INFO by default. `LOG_LEVEL` env var overrides.
- **NFR-O3.** A `/api/health` endpoint returns 200 with `{ status: 'ok', db: 'ok', mmdb: 'ok'|'missing'|'stale' }` and is used by Docker healthcheck.

### 4.5 Accessibility

- **NFR-A1.** Keyboard navigation works for all interactive elements (no mouse-only flows).
- **NFR-A2.** Color is not the sole carrier of meaning — disposition tags carry text labels alongside color (e.g. "Reject" + red, not red alone).
- **NFR-A3.** Form fields have labels; error messages are programmatically associated.
- **NFR-A4.** Charts have a textual fallback (a data table linked from the chart container) for screen readers.

### 4.6 Internationalization

- **NFR-I1.** v1 is English-only. UI strings live in a single source so future i18n is a lift, not a rewrite. (Recommend `vue-i18n` shape from day one even with one locale.)
- **NFR-I2.** All dates are displayed in the operator's browser locale and timezone. Stored as UTC ISO-8601 in DB.

### 4.7 Documentation

- **NFR-D1.** `README.md` covers: quickstart (dev), Docker quickstart (prod), required env vars, and links to `AGENTS.md`, `docs/VISION.md`, `docs/PRD.md`, `docs/ROADMAP.md`.
- **NFR-D2.** `.env.example` lists every recognized env var with a short comment.
- **NFR-D3.** Every Nitro plugin has a top-of-file comment explaining what it does and when it runs.

### 4.8 Testing

- **NFR-T1.** Unit test coverage on `lib/dmarc/` and `lib/imap/dispatcher.ts` is at least 80%. These are the parsers — they must be tight.
- **NFR-T2.** At least one Playwright e2e covers J1.R2 → J1.R3 → J1.R4 (setup, add inbox, see record). This is the smoke test.
- **NFR-T3.** A small corpus of real-world (anonymized) aggregate XML samples lives in `test/fixtures/dmarc/` covering: Google, Microsoft, Yahoo, Mailru, and at least one "weird" sender. Each is a Vitest unit test under `test/unit/`.

## 5. Data Requirements

- **DR1.** Schema reflects the model inventory in `AGENTS.md` section 5.
- **DR2.** All raw report content is preserved (`AggregateReport.rawXml`, `ForensicReport.rawEml`). No "lossy" parsing — we always have the original to re-parse if the parser improves.
- **DR3.** No PII is stored unnecessarily. Forensic reports inherently contain envelope addresses; this is documented and the operator is warned via the J3.R3 PII indicator.
- **DR4.** Database supports SQLite `BACKUP TO` for J5.R2 (better-sqlite3 supports this natively).

## 6. Out of Scope (v1.0)

Explicitly **not** v1 — proposing these in PRs without a separate scoping discussion will not be accepted:

- Multi-user / role-based access (only one operator account)
- Multi-org / multi-tenant row isolation (single-org per deployment)
- Email or webhook alerts (quiet by default, per VISION.md)
- DMARC policy recommendations or DNS edits
- BIMI integration
- Report forwarding / re-emission
- Per-record annotation / commenting
- Custom dashboard layouts / saved views
- API tokens for programmatic access
- Plugin / extension system

These may live in `ROADMAP.md` post-v1 sections, but they are not v1.0 acceptance items.

## 7. Acceptance Definition for v1.0

v1.0 ships when:

1. Every `Jx.Ry` requirement above passes its acceptance criteria.
2. Every `NFR-*` requirement above passes its criteria (verified by tests where automatable, manually otherwise).
3. The "Sam clones it on a Tuesday" scenario from `VISION.md` ("What Success Feels Like") works end-to-end with a real IMAP server and real DMARC reports.
4. `AGENTS.md`'s "Development Status" checklist (section 12) is fully checked through "Dockerfile + compose example".
5. `docs/ROADMAP.md` v1.0 milestone is marked complete with a release tag.
