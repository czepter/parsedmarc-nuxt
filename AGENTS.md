# AGENTS.md — parsedmarc-nuxt

> **Read this first.** This is the single source of truth for project orientation, build commands, conventions, and guardrails for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repo.
>
> Companion documents:
> - [`docs/VISION.md`](docs/VISION.md) — narrative product vision and design philosophy
> - [`docs/PRD.md`](docs/PRD.md) — product requirements (user stories, functional + non-functional)
> - [`docs/ROADMAP.md`](docs/ROADMAP.md) — milestone-based delivery plan

---

## 1. Project Overview

`parsedmarc-nuxt` is a self-hosted DMARC analytics dashboard — a Nuxt 4 reimagining of [parsedmarc](https://domainaware.github.io/parsedmarc/index.html), the de-facto Python tool for parsing DMARC aggregate (RUA) and forensic (RUF) reports delivered to a mailbox. It targets sysadmins running their own mail infrastructure who want to know, at a glance, who is sending mail "from" their domains and whether SPF/DKIM/DMARC alignment is holding. Visual reference: [Umami Analytics](https://umami.is/) — clean, dense, soft-palette dashboards instead of Grafana-grade complexity.

## 2. Mission & Non-Goals

**Mission**
- Turn a folder of DMARC reports (delivered by IMAP) into a beautiful, queryable dashboard
- Aggregate-report parsing, forensic-report parsing, GeoIP enrichment, multi-inbox ingestion
- One-binary deployment story: Node + a single SQLite file + MaxMind GeoLite2 web service
- Admin shell for managing many IMAP inboxes per deployment

**Non-Goals**
- Not a mail server — SMTP/IMAP delivery is someone else's job; we only *read* mailboxes
- No Python runtime — DMARC parsing is implemented natively in TypeScript
- No managed-cloud SaaS features — no billing, no multi-tenant database isolation
- No real-time DMARC enforcement — we report and visualize; we do not edit DNS
- No multi-org row-level isolation in v1 (single-org per deployment; see section 11 for forward-compat plan)

## 3. Tech Stack — Locked Decisions

| Layer | Choice | Rationale | Status |
|-------|--------|-----------|--------|
| Framework | Nuxt 4 | SSR + file-based routing + Nitro server in one runtime | installed |
| State | Pinia | Standard Nuxt store solution | installed |
| ORM | Prisma | Type-safe DB access, migrations | installed |
| DB driver | `better-sqlite3` | Sync, fast, zero ops | to add |
| Auth | `nuxt-auth-utils` | Official Nuxt session/cookie utils, no Auth.js machinery | to add |
| IMAP client | `imapflow` | Modern, promise-based, actively maintained | to add |
| Email parsing | `mailparser` | Battle-tested MIME parser, returns clean attachments | to add |
| DMARC XML | `fast-xml-parser` | Fastest pure-JS XML parser, no node-gyp | to add |
| GeoIP client | `@maxmind/geoip2-node` | Calls MaxMind GeoLite2 web service (`geolite.info`) at ingestion time | installed |
| Job scheduling | `croner` | One-file in-process cron, no Redis/queue infra | to add |
| Charts | `uPlot` | Canvas, ~40 KB, smooth at 100K+ points | to add |
| UI primitives | `shadcn-nuxt` | Composable, themeable, matches Umami aesthetic | installed |
| CSS | Tailwind | Required by shadcn | to add (see section 11) |
| Icons | `@nuxt/icon` | Iconify-backed, lazy-loaded | installed |
| Fonts | `@nuxt/fonts` | Self-hosted web fonts | installed |
| Unit testing | Vitest (+ `@nuxt/test-utils`) | | installed |
| E2E testing | Playwright | | installed |

**Rule**: do not add a library to do something a tool in this table already does. If a need genuinely is not covered, propose the addition in your PR description and justify against the alternatives.

## 4. Repository Layout

```
parsedmarc-nuxt/
├── app/
│   ├── app.vue                      # Root layout
│   ├── components/                  # Vue SFCs (shadcn primitives + custom)
│   │   └── charts/                  # uPlot wrapper components
│   ├── pages/                       # File-based routes (dashboard, /inboxes, /login, ...)
│   ├── server/
│   │   ├── api/                     # REST-ish endpoints, e.g. inboxes/[id].get.ts
│   │   ├── plugins/                 # Nitro plugins:
│   │   │                            #   geoip-bootstrap.ts (constructs WebServiceClient singleton)
│   │   │                            #   scheduler.ts       (registers croner jobs)
│   │   └── utils/                   # Server-only helpers (auth, db, geoip lookups)
│   └── generated/prisma/            # Prisma client output (gitignored)
├── lib/                             # Framework-agnostic modules
│   ├── prisma.ts                    # PrismaClient singleton (already exists)
│   ├── dmarc/                       # Aggregate + forensic report parsers
│   ├── imap/                        # imapflow wrapper, attachment dispatcher
│   └── geoip/                       # MaxMind GeoLite2 web service client, lookup cache
├── prisma/
│   ├── schema.prisma                # Models live here (see section 5)
│   └── migrations/
├── data/                            # Runtime artifacts — must be gitignored
│   └── parsedmarc.db                # SQLite database
├── test/                            # Vitest tests (per vitest.config.ts projects)
│   ├── unit/                        # `unit` project (node env)
│   ├── nuxt/                        # `nuxt` project (happy-dom + Nuxt context)
│   └── fixtures/                    # Sample DMARC XML / EML for parser tests
├── tests/                           # Playwright e2e tests (per playwright.config.ts testDir)
├── public/                          # Static assets served verbatim
├── docs/                            # Product docs (vision, PRD, roadmap)
├── nuxt.config.ts
├── prisma.config.ts
├── playwright.config.ts
├── vitest.config.ts
├── package.json
└── AGENTS.md                        # you are here
```

## 5. Data Model Sketch

The current `prisma/schema.prisma` still has the `User` / `Post` boilerplate from `prisma init`. It must be replaced. Final field set is the implementing PR's call; this is the model inventory.

| Model | Purpose | Key fields |
|-------|---------|-----------|
| `User` | Operator login | `id`, `email`, `passwordHash`, `createdAt` |
| `Session` | nuxt-auth-utils session row (if not using cookie-only sessions) | `id`, `userId`, `expiresAt` |
| `Inbox` | An IMAP credential to poll | `id`, `label`, `host`, `port`, `tls`, `username`, `passwordEncrypted`, `processedFolder`, `enabled`, `pollCron` |
| `Domain` | A domain we expect reports for (auto-discovered or pre-listed) | `id`, `name`, `addedAt` |
| `AggregateReport` | One RUA XML file = one row | `id`, `reportId`, `orgName`, `domainId`, `dateBegin`, `dateEnd`, `inboxId`, `rawXml` |
| `AggregateRecord` | Per-source-IP row inside an aggregate report | `id`, `reportId`, `sourceIp`, `count`, `disposition`, `dkim`, `spf`, `headerFrom`, `geoLocationId` |
| `ForensicReport` | One RUF / AFRF email = one row | `id`, `domainId`, `arrivalDate`, `sourceIp`, `subject`, `rawEml`, `inboxId` |
| `GeoLocation` | Cached MaxMind lookup keyed by IP | `id`, `ip` (unique), `country`, `city`, `latitude`, `longitude`, `lookedUpAt` |
| `ScanRun` | One execution of the IMAP poll job (audit trail) | `id`, `inboxId`, `startedAt`, `finishedAt`, `messagesSeen`, `reportsParsed`, `errorMessage` |

Relationships (informal): `Inbox 1—* AggregateReport`, `AggregateReport 1—* AggregateRecord`, `AggregateRecord *—1 GeoLocation`, `Domain 1—* AggregateReport`, `Inbox 1—* ScanRun`.

**Future-proofing for multi-tenancy**: design every domain table so a later `orgId Int? @default(1)` column is a non-breaking additive migration. Do not bake "single org" into composite indexes today (just leave `orgId` out of the index until the migration).

## 6. Build, Run & Test Commands

All commands run from the repo root with `pnpm` (workspace declared in `pnpm-workspace.yaml`).

```bash
# Setup (run once)
pnpm install                          # also runs `nuxt prepare` via postinstall
pnpm exec prisma migrate dev          # create/apply migrations against data/parsedmarc.db
pnpm exec prisma generate             # regenerate Prisma client (usually automatic)

# Develop
pnpm dev                              # Nuxt dev server with HMR

# Build & preview
pnpm build
pnpm preview
pnpm generate                         # prerender static pages (rarely needed)

# Tests
pnpm test                             # Vitest (all projects)
pnpm test:unit                        # unit project only
pnpm test:nuxt                        # Nuxt-aware project only
pnpm test:watch                       # watch mode
pnpm test:coverage                    # coverage report (v8)
pnpm test:e2e                         # Playwright headless
pnpm test:e2e:ui                      # Playwright UI mode

# Diagnostics
pnpm exec prisma studio               # browse the DB visually
```

A fresh clone is `pnpm install && pnpm exec prisma migrate dev && pnpm dev`.

## 7. Code Conventions

**Always**
- TypeScript everywhere. No `.js` files in `app/` or `lib/`.
- Vue SFCs use `<script setup lang="ts">`. No Options API.
- Server routes follow Nuxt's filename convention: `app/server/api/<resource>/[id].get.ts`, `...post.ts`, etc. One HTTP method per file.
- Database access goes through the singleton in `lib/prisma.ts`. Never `new PrismaClient()` elsewhere.
- Read configuration via `useRuntimeConfig()` (server) or `useRuntimeConfig().public` (client). Define everything in `nuxt.config.ts` `runtimeConfig`. **No** `process.env.X` reads outside that file.
- Throw API errors via `createError({ statusCode, statusMessage })`. Never `throw new Error()` inside an event handler.
- Vitest tests live under `test/unit/` (node env) or `test/nuxt/` (Nuxt env), per the `vitest.config.ts` project split. Playwright e2e tests live in `tests/` (per `playwright.config.ts` `testDir`).
- All recurring or long-running work (IMAP poll) goes through `app/server/plugins/scheduler.ts` registered croner jobs — never `setInterval` in module scope.
- Encrypt IMAP passwords at rest. Use a key derived from `NUXT_SESSION_PASSWORD` (or a separate `NUXT_ENCRYPTION_KEY`) and store ciphertext in `Inbox.passwordEncrypted`.

**Never**
- Add Python or any non-Node runtime to the deployment story.
- Commit anything under `data/` (SQLite file) — `.gitignore` must cover it.
- Hard-code `orgId` assumptions outside the auth/session layer (see section 5).
- Bypass `lib/dmarc/` to do ad-hoc XML parsing in a route handler.
- Call `WebServiceClient` directly from a route handler or page. GeoIP web service calls happen at ingestion time only, through `lib/geoip/lookup.ts`. Each IP is queried at most once across the deployment lifetime; results (including `AddressNotFoundError` negatives) are cached indefinitely in the `GeoLocation` table. Render paths read only from the cache via `lookupIp`.
- Log raw IMAP credentials, session tokens, or full email bodies at info/debug level.

## 8. Domain Primer: DMARC in 90 Seconds

DMARC ("Domain-based Message Authentication, Reporting & Conformance", RFC 7489) lets a domain owner publish a DNS TXT record saying *"if mail claiming to be from me fails SPF and DKIM, here is what receivers should do — and please send me reports."*

Two report types arrive in the mailboxes you'll point us at:

- **Aggregate reports (RUA)** — daily summaries, one XML file per receiver per day, usually delivered as a `.zip` or `.gz` attachment. Schema is a `<feedback>` root with `<record>` children per source IP. Each `<record>` has a `<row>` with count + `<policy_evaluated>` (DKIM/SPF result + disposition), `<identifiers>` (the `header_from` domain), and `<auth_results>` (raw DKIM/SPF detail). **This is 95% of useful data.**
- **Forensic reports (RUF / AFRF)** — per-message failure reports. RFC 6591 format, delivered as the email itself with full headers. Rare in practice (most receivers do not send them due to PII concerns) but high-detail when present.

**Alignment** is the DMARC-specific concept on top of SPF/DKIM: a passing SPF or DKIM check only counts toward DMARC if the authenticated domain *aligns with* the `From:` header domain (strict = exact match, relaxed = same organizational domain).

**Why GeoIP matters**: every `<record>` carries a `source_ip`. Mapping IP → country/city is what turns "12,000 failed messages" into "12,000 failed messages from one IP block in Lagos" — actionable. We cache lookups in the `GeoLocation` table so each IP triggers at most one MaxMind web service call.

External references:
- [RFC 7489 (DMARC)](https://datatracker.ietf.org/doc/html/rfc7489)
- [Aggregate report XML schema, Appendix C](https://datatracker.ietf.org/doc/html/rfc7489#appendix-C)
- [parsedmarc docs](https://domainaware.github.io/parsedmarc/)

## 9. IMAP Ingestion Flow

Triggered by `croner` from `app/server/plugins/scheduler.ts`:

```
croner tick (per-Inbox cron expression, default */15 * * * *)
  └─→ for each enabled Inbox in DB:
       open imapflow connection (lib/imap/client.ts)
       fetch unseen messages
       for each message:
         mailparser → { attachments[], headers, body }
         dispatch (lib/imap/dispatcher.ts):
           ├─ aggregate?  (zip|gz|xml attachment)
           │    → lib/dmarc/aggregate.ts (fast-xml-parser)
           │    → upsert AggregateReport + AggregateRecord rows
           │    → for each record.sourceIp:
           │        lib/geoip/lookup.ts (cached via GeoLocation table)
           ├─ forensic?  (AFRF / message/feedback-report)
           │    → lib/dmarc/forensic.ts
           │    → upsert ForensicReport
           └─ unknown? → log to ScanRun.errorMessage, leave UNSEEN
         move to inbox.processedFolder (or mark seen if folder unset)
       persist ScanRun summary row
       close connection
```

Each `Inbox` row carries its own `pollCron` so different mailboxes can have different cadences.

GeoIP enrichment is performed via the MaxMind GeoLite2 web service through `lib/geoip/lookup.ts`; results (positive and `AddressNotFoundError` negatives) are cached indefinitely in the `GeoLocation` table. The `app/server/plugins/geoip-bootstrap.ts` plugin constructs the `WebServiceClient` singleton at server start.

## 10. Look & Feel Targets

The visual reference is **[Umami Analytics](https://umami.is/)**: clean, content-dense, soft palette, generous whitespace, tasteful charts. Specifically:

- Two-column layout: collapsible sidebar (Domains, Inboxes, Settings, Reports) + main content
- Big-number summary tiles at the top of every dashboard view, then a single hero chart, then a paginated table
- Subdued color palette (one accent color, lots of grayscale). Avoid traffic-light gradients.
- Charts are read-first: legends, axes, and tooltips are present but never compete with the data
- Dark mode parity from day one (shadcn handles this if Tailwind's `darkMode: 'class'` is set)
- Typography: a single sans family for UI, monospace only for raw IPs / report IDs

Implementation: shadcn-nuxt for primitives, Tailwind for layout, uPlot wrapped in `app/components/charts/` for time-series + stacked bars. shadcn-nuxt is installed but **Tailwind is not** — that is the first UI task (see section 11).

See [`docs/VISION.md`](docs/VISION.md) for the longer aesthetic argument.

## 11. Known Gaps (must do, not yet done)

Owner of all items below: the first implementation PR(s).

1. **Tailwind**: add `tailwindcss`, `@tailwindcss/vite` (or `@nuxtjs/tailwindcss` module), `tailwindcss-animate` to `package.json`. Run `pnpm dlx shadcn-nuxt init`. Without this, no shadcn component will render styled.
2. **Locked-in deps to install**: `imapflow`, `mailparser`, `fast-xml-parser`, `maxmind`, `nuxt-auth-utils`, `croner`, `uplot`, `better-sqlite3`. Add types where not bundled (`@types/mailparser`).
3. **Real Prisma schema**: replace `User` / `Post` boilerplate in `prisma/schema.prisma` with the models from section 5. Run `pnpm exec prisma migrate dev --name init`.
4. **`.env.example`**: ship with `NUXT_MAXMIND_ACCOUNT_ID=`, `NUXT_MAXMIND_LICENSE_KEY=`, `NUXT_SESSION_PASSWORD=` (32+ chars, required by nuxt-auth-utils), `DATABASE_URL=file:./data/parsedmarc.db`.
5. **GeoIP bootstrap plugin**: write `app/server/plugins/geoip-bootstrap.ts` that constructs the `WebServiceClient` singleton using `NUXT_MAXMIND_ACCOUNT_ID` and `NUXT_MAXMIND_LICENSE_KEY`.
6. **Scheduler plugin**: write `app/server/plugins/scheduler.ts` that loads enabled inboxes and registers a croner job per inbox.
7. **`.gitignore`**: add `data/` (currently absent — runtime artifacts will leak into commits otherwise).
8. **`runtimeConfig`**: declare every secret in `nuxt.config.ts` so `useRuntimeConfig()` is the only access path.

**Future / explicitly post-v1**: per-org row-level isolation. Single-org assumed today. To enable multi-org later: add nullable `orgId Int? @default(1)` to every domain table, backfill, then make non-null. See section 5 for index strategy.

## 12. Development Status

- [x] Project scaffold (Nuxt 4, Pinia, Prisma, shadcn-nuxt, Vitest, Playwright)
- [x] AGENTS.md vision-to-contract rewrite (this file)
- [x] Product vision (`docs/VISION.md`)
- [x] Product requirements (`docs/PRD.md`)
- [x] Product roadmap (`docs/ROADMAP.md`)
- [x] Tailwind + shadcn init (section 11.1)
- [x] Add locked-in deps (section 11.2)
- [x] Real Prisma schema + initial migration (section 11.3)
- [x] `.env.example` + `runtimeConfig` (section 11.4, 11.8)
- [x] Auth: register/login pages, session middleware (`nuxt-auth-utils`)
- [x] GeoIP bootstrap plugin (section 11.5)
- [x] Scheduler plugin (section 11.6)
- [x] IMAP fetcher (`lib/imap/`)
- [x] Aggregate report parser (`lib/dmarc/aggregate.ts`)
- [x] Forensic report parser (`lib/dmarc/forensic.ts`)
- [x] Inbox admin UI (`app/pages/inboxes/`)
- [x] Dashboard (summary tiles + hero chart + records table)
- [x] Domain detail view
- [x] Settings page (GeoIP status, password change, database backup)
- [ ] Dark mode
- [ ] Dockerfile + compose example
- [ ] CI (lint, typecheck, test)

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the milestone-grouped version of this list with target sequencing.

## 13. Quick Reference for Agents

```
Before writing code              → read 3 (stack), 4 (layout), 6 (commands), 7 (conventions)
Before parsing a DMARC report    → read 8 (domain primer)
Before writing IMAP polling code → read 9 (ingestion flow)
Before adding any dependency     → read 3 first; if not in the table, justify it in your PR
Before changing the data model   → read 5 + future-proofing note in 11
Before styling anything          → check 11.1 — Tailwind may not be installed yet
For the "why" behind a choice    → docs/VISION.md
For acceptance criteria          → docs/PRD.md
For sequencing / what's next     → docs/ROADMAP.md
```

If section 3 and reality (`package.json`) disagree, **section 3 is the intent**; either bring `package.json` in line (typical) or update section 3 with rationale (rare). Never silently diverge.
