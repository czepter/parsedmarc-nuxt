# M1 — Build Surface Ready: Design Spec

**Date:** 2026-04-28
**Milestone:** M1 (see `docs/ROADMAP.md`)
**Status:** Approved — ready for implementation planning

---

## Goal

`pnpm install && pnpm dev` produces a working dev server with all chosen libraries available, Tailwind compiling, a styled shadcn primitive visible in `app.vue`, and migrations applying against `data/parsedmarc.db`. No application features — just a foundation that won't be re-litigated.

---

## Scope

Exactly the nine exit criteria from `docs/ROADMAP.md §M1`. Nothing more.

---

## Approach: shadcn-vue init drives Tailwind setup (Approach A)

Use `pnpm dlx shadcn-vue@latest init --template nuxt --base-color zinc -y` as the canonical Tailwind + shadcn bootstrap. This is preferred over manual Tailwind v3 (`@nuxtjs/tailwindcss`) or manual Tailwind v4 wiring because:

- The official Nuxt template keeps Tailwind's version and CSS-variable conventions in sync with shadcn-vue's expectations.
- It writes `components.json` (the shadcn config file) in one shot with correct Nuxt-aware paths.
- Community material and future `shadcn-vue add <component>` commands all assume this init was run.

The init installs Tailwind v4 via `@tailwindcss/vite`, which is the direction called out in `AGENTS.md §11.1`.

---

## Work Areas

### 1. UI Layer — Tailwind + shadcn

**What:** Run `shadcn-vue init --template nuxt --base-color zinc -y` from the project root. Then add one `Button` primitive to `app/app.vue` as a smoke test.

**Why zinc:** Neutral grey-based palette. Matches the subdued, Umami-style aesthetic described in `AGENTS.md §10` ("lots of grayscale, one accent colour"). Can be overridden at any later milestone without structural change.

**Outcome:**
- `components.json` written at project root
- `app/assets/css/tailwind.css` (or equivalent path chosen by init) with CSS variable layer
- `tailwindcss`, `@tailwindcss/vite`, `tailwindcss-animate` in `package.json`
- `nuxt.config.ts` updated with the Vite plugin (or `@nuxtjs/tailwindcss` module, whichever init selects)
- `app/app.vue` renders a styled `Button` that proves the CSS pipeline is live

**Note:** `shadcn-nuxt` is already installed and declared in `nuxt.config.ts` modules. The init adds the shadcn-vue CLI config layer on top; both are needed.

---

### 2. Locked-in Runtime Dependencies

**What:** Single `pnpm add` for all 8 runtime deps + 1 type package.

| Package | Purpose |
|---------|---------|
| `imapflow` | IMAP client |
| `mailparser` | MIME email parsing |
| `fast-xml-parser` | DMARC XML parsing (no node-gyp) |
| `maxmind` | GeoLite2-City.mmdb reader |
| `nuxt-auth-utils` | Session/cookie auth |
| `croner` | In-process cron scheduler |
| `uplot` | Time-series chart (canvas, ~40 KB) |
| `better-sqlite3` | Sync SQLite driver |
| `@types/mailparser` | (devDep) TypeScript types for mailparser |

No tree-shaking or conditional installation — all go in at once. These are locked decisions per `AGENTS.md §3`; justification already exists in that table.

---

### 3. nuxt.config.ts — runtimeConfig

**What:** Add a `runtimeConfig` block so `useRuntimeConfig()` is the only path to secrets, per `AGENTS.md §7`.

```ts
runtimeConfig: {
  sessionPassword: '',                                    // NUXT_SESSION_PASSWORD
  maxmindLicenseKey: '',                                  // NUXT_MAXMIND_LICENSE_KEY
  databaseUrl: process.env.DATABASE_URL ?? '',            // DATABASE_URL (shared with Prisma)
  public: {}
}
```

Private keys (no `public` nesting) mean they are server-only. `databaseUrl` is bridged from `DATABASE_URL` rather than `NUXT_DATABASE_URL` so that `prisma.config.ts` (which reads `process.env["DATABASE_URL"]` directly) and server route handlers (which call `useRuntimeConfig().databaseUrl`) both consume the same env var without duplication.

---

### 4. .env.example

**What:** Write `.env.example` at the project root with every recognized env var, all commented, with description lines.

```dotenv
# Required — nuxt-auth-utils session encryption key (32+ random characters)
# NUXT_SESSION_PASSWORD=

# Required for GeoIP — MaxMind license key (free account at maxmind.com)
# NUXT_MAXMIND_LICENSE_KEY=

# SQLite database path (relative to project root)
# DATABASE_URL=file:./data/parsedmarc.db
```

`.env` is already in `.gitignore` via `.env.*` glob. `.env.example` is explicitly excluded from that glob (`!.env.example`), so it is safely committed.

---

### 5. .gitignore — add data/

**What:** Append `data/` to `.gitignore`.

**Why:** `data/parsedmarc.db` and `data/GeoLite2-City.mmdb` are runtime artifacts. Without this, the next `pnpm exec prisma migrate dev` will stage the SQLite file. `AGENTS.md §11.7` flags this as currently absent.

---

### 6. Prisma Schema — replace boilerplate

**What:** Replace the `User` / `Post` boilerplate in `prisma/schema.prisma` with the full model inventory from `AGENTS.md §5`.

**Models to define:**

| Model | Key fields |
|-------|-----------|
| `User` | `id`, `email`, `passwordHash`, `createdAt` |
| `Session` | `id`, `userId` (→ User), `expiresAt` |
| `Inbox` | `id`, `label`, `host`, `port`, `tls`, `username`, `passwordEncrypted`, `processedFolder`, `enabled`, `pollCron` |
| `Domain` | `id`, `name` (unique), `addedAt` |
| `AggregateReport` | `id`, `reportId` (unique), `orgName`, `domainId` (→ Domain), `dateBegin`, `dateEnd`, `inboxId` (→ Inbox), `rawXml` |
| `AggregateRecord` | `id`, `reportId` (→ AggregateReport), `sourceIp`, `count`, `disposition`, `dkim`, `spf`, `headerFrom`, `geoLocationId` (→ GeoLocation, optional) |
| `ForensicReport` | `id`, `domainId` (→ Domain), `arrivalDate`, `sourceIp`, `subject`, `rawEml`, `inboxId` (→ Inbox) |
| `GeoLocation` | `id`, `ip` (unique), `country`, `city`, `latitude`, `longitude`, `lookedUpAt` |
| `ScanRun` | `id`, `inboxId` (→ Inbox), `startedAt`, `finishedAt` (optional), `messagesSeen`, `reportsParsed`, `errorMessage` (optional) |

**Future-proofing:** No `orgId` column yet. Every model is designed so `orgId Int? @default(1)` can be added later as a non-breaking additive migration (`AGENTS.md §5`).

**SQLite type notes:** Use `String` for IPs (SQLite has no INET type). Use `DateTime` for timestamps (Prisma maps to ISO string in SQLite). Use `Float` for lat/lon.

---

### 7. Prisma Migration

**What:** Run `pnpm exec prisma migrate dev --name init` against `data/parsedmarc.db`.

**Pre-conditions:**
- `data/` directory exists (create if absent — it is gitignored)
- `DATABASE_URL=file:./data/parsedmarc.db` set in `.env` (or shell env) before running
- Schema is valid (step 6 complete)

**Outcome:** `prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql` written and applied. Prisma client regenerated into `app/generated/prisma/`.

---

### 8. Placeholder Tests

**Why needed:** `pnpm test` (Vitest) and `pnpm test:e2e` (Playwright) are both exit criteria. Both test directories (`test/unit/`, `tests/`) are currently empty, which causes Vitest to exit with "no test files found" (non-zero in some configurations) and Playwright to have nothing to run.

**Vitest — `test/unit/placeholder.test.ts`:**
```ts
import { describe, it, expect } from 'vitest'

describe('placeholder', () => {
  it('true is true', () => {
    expect(true).toBe(true)
  })
})
```

**Playwright — `tests/smoke.spec.ts`:**
```ts
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { setup } from '@nuxt/test-utils/playwright'

test.use(setup({ rootDir: fileURLToPath(new URL('..', import.meta.url)) }))

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).not.toHaveTitle('Error')
})
```

These are minimal scaffolds. Real tests arrive in M2+. The unit test is in `test/unit/` (node env project). The e2e test uses `@nuxt/test-utils/playwright` to spin up the Nuxt server automatically.

---

## File Change Summary

| File | Action |
|------|--------|
| `components.json` | Created by shadcn-vue init |
| `app/assets/css/tailwind.css` | Created by shadcn-vue init |
| `nuxt.config.ts` | Updated — Tailwind plugin/module + `runtimeConfig` + `shadcn` config block |
| `package.json` | Updated — 8 runtime deps + `@types/mailparser` devDep |
| `.env.example` | Created |
| `.gitignore` | Updated — append `data/` |
| `prisma/schema.prisma` | Replaced — 9 production models |
| `prisma/migrations/` | Created — `_init` migration |
| `app/generated/prisma/` | Regenerated (gitignored) |
| `app/app.vue` | Updated — Button smoke test |
| `test/unit/placeholder.test.ts` | Created |
| `tests/smoke.spec.ts` | Created |

---

## What This Does NOT Include

- Any application pages, routes, or server handlers (those are M2+)
- GeoIP bootstrap plugin (M3)
- Scheduler plugin (M3)
- Auth middleware (M2)
- Any `lib/dmarc/`, `lib/imap/`, `lib/geoip/` modules (M3, M4, M5)

---

## Exit Verification

After implementation, the following must all pass:

```bash
pnpm install          # clean install from lockfile
pnpm dev              # dev server starts, no unresolved imports
# open http://localhost:3000 → styled Button visible
pnpm exec prisma migrate dev --name init   # runs cleanly
pnpm test             # Vitest: all pass
pnpm test:e2e         # Playwright: smoke passes
```
