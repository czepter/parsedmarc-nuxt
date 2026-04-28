# M1 — Build Surface Ready: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm install && pnpm dev` produce a working dev server with Tailwind compiling, a styled shadcn Button visible in `app.vue`, all locked-in deps available, and a clean Prisma migration applied to `data/parsedmarc.db`.

**Architecture:** Sequential infrastructure setup — env/gitignore first (no deps), then UI toolchain via `shadcn-vue init` (establishes Tailwind + components.json), then remaining runtime deps + module registration, then Prisma schema replacement + migration, then smoke-test wiring in `app.vue`, then placeholder tests so `pnpm test` and `pnpm test:e2e` both pass.

**Tech Stack:** Nuxt 4, Tailwind v4 (`@tailwindcss/vite`), shadcn-vue CLI, `shadcn-nuxt` Nuxt module, Prisma 6 (SQLite + `better-sqlite3`), `nuxt-auth-utils`, Vitest, Playwright

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `.gitignore` | Modify | Add `data/` so SQLite file and MMDB are never committed |
| `.env.example` | Create | Document every recognized env var with comments |
| `.env` | Create (gitignored) | Local dev values; provides `DATABASE_URL` for Prisma |
| `components.json` | Created by init | shadcn-vue config (style, aliases, tailwind css path) |
| `app/assets/css/tailwind.css` | Created by init | Tailwind v4 import + shadcn CSS variable layer |
| `app/lib/utils.ts` | Created by init | `cn()` helper (clsx + tailwind-merge) |
| `nuxt.config.ts` | Modify (after init) | Add `runtimeConfig`, `nuxt-auth-utils` module, `shadcn` componentDir, css reference |
| `prisma/schema.prisma` | Replace | 9 production models; remove User/Post boilerplate |
| `lib/prisma.ts` | Modify | Fix import path from `@prisma/client` → generated output |
| `prisma/migrations/` | Created by migrate | Initial migration SQL |
| `app/generated/prisma/` | Created by generate | Prisma client (gitignored) |
| `app/app.vue` | Modify | Add styled `<Button>` smoke test |
| `test/unit/placeholder.test.ts` | Create | Trivial Vitest unit test so `pnpm test` exits 0 |
| `tests/smoke.spec.ts` | Create | Playwright test: home page loads without error |

---

## Task 1: Environment Files + .gitignore

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `.env`

- [ ] **Step 1.1: Add `data/` to .gitignore**

Open `.gitignore`. After the `# Local env files` block, append:

```
# Runtime artifacts (SQLite DB, MaxMind MMDB)
data/
```

- [ ] **Step 1.2: Verify .gitignore change**

```bash
grep "data/" .gitignore
```

Expected output: `data/`

- [ ] **Step 1.3: Create `.env.example`**

Create the file at the project root:

```dotenv
# Required — nuxt-auth-utils session encryption key (32+ random characters)
# Generate with: openssl rand -base64 32
# NUXT_SESSION_PASSWORD=

# Required for GeoIP — MaxMind license key (free account at maxmind.com)
# NUXT_MAXMIND_LICENSE_KEY=

# SQLite database path (relative to project root)
# Used by both Prisma (prisma.config.ts) and useRuntimeConfig().databaseUrl
DATABASE_URL=file:./data/parsedmarc.db
```

- [ ] **Step 1.4: Create `.env` for local development**

```dotenv
DATABASE_URL=file:./data/parsedmarc.db
NUXT_SESSION_PASSWORD=dev-only-password-change-in-production-32chars
```

- [ ] **Step 1.5: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: add data/ to gitignore and write .env.example"
```

---

## Task 2: Tailwind + shadcn Init

**Files:**
- Created by command: `components.json`, `app/assets/css/tailwind.css`, `app/lib/utils.ts`
- Modified by command: `nuxt.config.ts` (may add vite plugin), `package.json` (adds tailwind deps)

- [ ] **Step 2.1: Run shadcn-vue init**

```bash
pnpm dlx shadcn-vue@latest init --template nuxt --base-color zinc -y
```

Expected: command completes without error. Watch for:
- `components.json` created at project root
- Tailwind CSS file created (path shown in output)
- `lib/utils.ts` or `app/lib/utils.ts` created

- [ ] **Step 2.2: Verify components.json exists and contains `"framework": "nuxt"`**

```bash
cat components.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['framework'], d['tailwind']['baseColor'])"
```

Expected output: `nuxt zinc`

- [ ] **Step 2.3: Verify Tailwind CSS file exists**

The init creates a CSS file referenced in `components.json` under `tailwind.css`. Find it:

```bash
python3 -c "import json; d=json.load(open('components.json')); print(d['tailwind']['css'])"
```

Note the path printed — it will be referenced in Step 3.2. Typically `app/assets/css/tailwind.css`.

Confirm the file exists:

```bash
python3 -c "import json; import os; d=json.load(open('components.json')); print(os.path.exists(d['tailwind']['css']))"
```

Expected output: `True`

- [ ] **Step 2.4: If `app/assets/css/tailwind.css` was NOT created, write it manually**

Only do this step if Step 2.3 printed `False`.

```bash
mkdir -p app/assets/css
```

Create `app/assets/css/tailwind.css`:

```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 89.8%;
    --input: 240 5.9% 89.8%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 2.5: Verify `app/lib/utils.ts` exists (created by init)**

```bash
cat app/lib/utils.ts
```

Expected: a file containing a `cn` function using `clsx` and `tailwind-merge`.

If it does NOT exist, create `app/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Then install the missing deps:

```bash
pnpm add clsx tailwind-merge
```

- [ ] **Step 2.6: Verify package.json now contains tailwind packages**

```bash
cat package.json | python3 -c "import sys,json; d=json.load(sys.stdin); deps={**d.get('dependencies',{}),**d.get('devDependencies',{})}; [print(k) for k in deps if 'tailwind' in k]"
```

Expected: at least `tailwindcss` and `@tailwindcss/vite` listed.

If `tailwindcss-animate` is missing, install it:

```bash
pnpm add tailwindcss-animate
```

- [ ] **Step 2.7: Commit init output**

```bash
git add -A
git commit -m "feat: run shadcn-vue init (Tailwind v4 + components.json)"
```

---

## Task 3: Post-init nuxt.config.ts

The init may have modified `nuxt.config.ts` to add the Tailwind vite plugin and/or css import. This task adds everything else: `runtimeConfig`, `nuxt-auth-utils` module (once installed in Task 4), and the `shadcn` block.

**Files:**
- Modify: `nuxt.config.ts`

- [ ] **Step 3.1: Read the current nuxt.config.ts**

```bash
cat nuxt.config.ts
```

Note what the init added (likely a `vite: { plugins: [tailwindcss()] }` block and/or `css: [...]` line).

- [ ] **Step 3.2: Rewrite nuxt.config.ts to the complete target state**

Replace the entire file with the following. Preserve any Tailwind vite plugin import line the init added at the top:

```ts
import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/test-utils/module',
    '@pinia/nuxt',
    '@prisma/nuxt',
    'shadcn-nuxt',
    'nuxt-auth-utils',
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  css: ['~/assets/css/tailwind.css'],

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },

  runtimeConfig: {
    sessionPassword: '',         // NUXT_SESSION_PASSWORD
    maxmindLicenseKey: '',       // NUXT_MAXMIND_LICENSE_KEY
    databaseUrl: process.env.DATABASE_URL ?? '', // bridges to Prisma's DATABASE_URL
    public: {},
  },
})
```

**Note on `@nuxt/test-utils/module`:** The original config listed `@nuxt/test-utils` but the correct module ID is `@nuxt/test-utils/module`. Fix it here.

- [ ] **Step 3.3: Commit — do this AFTER completing Task 4**

`nuxt-auth-utils` is in the modules array above but not yet installed. Complete Task 4 (dep install) before making this commit, so the project is never in a broken state.

```bash
git add nuxt.config.ts
git commit -m "feat: add runtimeConfig, shadcn config, and Tailwind wiring to nuxt.config.ts"
```

---

## Task 4: Install Locked-in Runtime Deps

**Files:**
- Modify: `package.json` (via pnpm add)

- [ ] **Step 4.1: Install all 8 runtime deps in one command**

```bash
pnpm add imapflow mailparser fast-xml-parser maxmind nuxt-auth-utils croner uplot better-sqlite3
```

- [ ] **Step 4.2: Install type package as devDep**

```bash
pnpm add -D @types/mailparser
```

- [ ] **Step 4.3: Verify all 8 appear in dependencies**

```bash
node -e "
const p = JSON.parse(require('fs').readFileSync('package.json','utf8'))
const deps = {...p.dependencies,...p.devDependencies}
const required = ['imapflow','mailparser','fast-xml-parser','maxmind','nuxt-auth-utils','croner','uplot','better-sqlite3','@types/mailparser']
required.forEach(r => console.log(r, deps[r] ? '✓' : '✗ MISSING'))
"
```

Expected: all 9 lines print `✓`.

- [ ] **Step 4.4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: install all M1 locked-in runtime dependencies"
```

---

## Task 5: Replace Prisma Schema

**Files:**
- Replace: `prisma/schema.prisma`
- Modify: `lib/prisma.ts` (fix import path)

- [ ] **Step 5.1: Replace prisma/schema.prisma with the 9-model production schema**

```prisma
// https://pris.ly/d/prisma-schema

generator client {
  provider = "prisma-client"
  output   = "../app/generated/prisma"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id           Int       @id @default(autoincrement())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  sessions     Session[]
}

model Session {
  id        String   @id @default(cuid())
  userId    Int
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Inbox {
  id                String            @id @default(cuid())
  label             String
  host              String
  port              Int               @default(993)
  tls               Boolean           @default(true)
  username          String
  passwordEncrypted String
  processedFolder   String?
  enabled           Boolean           @default(true)
  pollCron          String            @default("*/15 * * * *")
  aggregateReports  AggregateReport[]
  forensicReports   ForensicReport[]
  scanRuns          ScanRun[]
}

model Domain {
  id               String            @id @default(cuid())
  name             String            @unique
  addedAt          DateTime          @default(now())
  aggregateReports AggregateReport[]
  forensicReports  ForensicReport[]
}

model AggregateReport {
  id        String            @id @default(cuid())
  reportId  String            @unique
  orgName   String
  domainId  String
  domain    Domain            @relation(fields: [domainId], references: [id])
  dateBegin DateTime
  dateEnd   DateTime
  inboxId   String
  inbox     Inbox             @relation(fields: [inboxId], references: [id])
  rawXml    String
  records   AggregateRecord[]
}

model AggregateRecord {
  id            String           @id @default(cuid())
  reportId      String
  report        AggregateReport  @relation(fields: [reportId], references: [id], onDelete: Cascade)
  sourceIp      String
  count         Int
  disposition   String
  dkim          String
  spf           String
  headerFrom    String
  geoLocationId String?
  geoLocation   GeoLocation?     @relation(fields: [geoLocationId], references: [id])
}

model ForensicReport {
  id          String   @id @default(cuid())
  domainId    String
  domain      Domain   @relation(fields: [domainId], references: [id])
  arrivalDate DateTime
  sourceIp    String
  subject     String
  rawEml      String
  inboxId     String
  inbox       Inbox    @relation(fields: [inboxId], references: [id])
}

model GeoLocation {
  id               String            @id @default(cuid())
  ip               String            @unique
  country          String?
  city             String?
  latitude         Float?
  longitude        Float?
  lookedUpAt       DateTime
  aggregateRecords AggregateRecord[]
}

model ScanRun {
  id            String    @id @default(cuid())
  inboxId       String
  inbox         Inbox     @relation(fields: [inboxId], references: [id])
  startedAt     DateTime  @default(now())
  finishedAt    DateTime?
  messagesSeen  Int       @default(0)
  reportsParsed Int       @default(0)
  errorMessage  String?
}
```

- [ ] **Step 5.2: Validate the schema**

```bash
pnpm exec prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid 🚀` (no errors).

- [ ] **Step 5.3: Fix lib/prisma.ts import path**

The current file imports from `@prisma/client` but the generated client is in `app/generated/prisma/`. Replace `lib/prisma.ts`:

```ts
import { PrismaClient } from '../app/generated/prisma'

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>
} & typeof global

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
```

- [ ] **Step 5.4: Commit**

```bash
git add prisma/schema.prisma lib/prisma.ts
git commit -m "feat: replace Prisma schema with 9 production models; fix import path in lib/prisma.ts"
```

---

## Task 6: Initial Prisma Migration

**Files:**
- Create: `prisma/migrations/YYYYMMDDHHMMSS_init/migration.sql` (generated)
- Create: `data/parsedmarc.db` (generated, gitignored)

- [ ] **Step 6.1: Create the data directory**

```bash
mkdir -p data
```

- [ ] **Step 6.2: Confirm DATABASE_URL is set**

```bash
grep DATABASE_URL .env
```

Expected: `DATABASE_URL=file:./data/parsedmarc.db`

- [ ] **Step 6.3: Run the initial migration**

```bash
pnpm exec prisma migrate dev --name init
```

Expected output includes:
```
Applying migration `XXXXXXXXXXXXXX_init`
Your database is now in sync with your schema.
Generated Prisma Client
```

If it fails with "directory not found", confirm `data/` exists (`ls data/`).

- [ ] **Step 6.4: Verify the database and migration files exist**

```bash
ls data/parsedmarc.db && ls prisma/migrations/
```

Expected: `parsedmarc.db` listed; migrations directory contains one folder ending in `_init`.

- [ ] **Step 6.5: Verify data/ is gitignored (critical)**

```bash
git status --short | grep "data/"
```

Expected: no output. If `data/parsedmarc.db` appears as untracked, `.gitignore` is not working — re-check Task 1 Step 1.1.

- [ ] **Step 6.6: Commit**

```bash
git add prisma/migrations/
git commit -m "feat: add initial Prisma migration (9 production models)"
```

---

## Task 7: app.vue Button Smoke Test

**Files:**
- Created by add command: `app/components/ui/button/` (Button component)
- Modify: `app/app.vue`

- [ ] **Step 7.1: Install the shadcn Button component**

```bash
pnpm dlx shadcn-vue@latest add button -y
```

Expected: `app/components/ui/button/` directory created with `Button.vue` (and possibly `index.ts`).

- [ ] **Step 7.2: Verify the button component was installed**

```bash
ls app/components/ui/button/
```

Expected: at least one `.vue` file listed.

- [ ] **Step 7.3: Update app/app.vue with the smoke test**

```vue
<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <NuxtRouteAnnouncer />
    <Button>parsedmarc-nuxt ✓</Button>
  </div>
</template>
```

The `Button` component is auto-imported by `shadcn-nuxt` from `app/components/ui/` — no explicit import needed.

- [ ] **Step 7.4: Start the dev server and confirm the button renders styled**

```bash
pnpm dev
```

Open `http://localhost:3000`. You should see a styled button with the text "parsedmarc-nuxt ✓" centered on a white background. If the button renders but is unstyled (no background, no border-radius), Tailwind is not loading — check that `css: ['~/assets/css/tailwind.css']` is in `nuxt.config.ts` and that `@import "tailwindcss"` is in the CSS file.

Stop the dev server (`Ctrl+C`) once confirmed.

- [ ] **Step 7.5: Commit**

```bash
git add app/app.vue app/components/
git commit -m "feat: install shadcn Button component; add smoke test to app.vue"
```

---

## Task 8: Vitest Placeholder Test

**Files:**
- Create: `test/unit/placeholder.test.ts`

- [ ] **Step 8.1: Write the placeholder unit test**

Create `test/unit/placeholder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('placeholder', () => {
  it('true is true — replace with real tests in M2+', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 8.2: Run Vitest and confirm it passes**

```bash
pnpm test:unit
```

Expected output includes:
```
✓ test/unit/placeholder.test.ts (1)
  ✓ placeholder > true is true
Test Files  1 passed (1)
```

- [ ] **Step 8.3: Run the full Vitest suite**

```bash
pnpm test
```

Expected: all projects pass (unit + nuxt). The nuxt project may show 0 tests — that is acceptable at M1.

- [ ] **Step 8.4: Commit**

```bash
git add test/unit/placeholder.test.ts
git commit -m "test: add placeholder Vitest unit test so pnpm test exits 0"
```

---

## Task 9: Playwright E2E Smoke Test

**Files:**
- Create: `tests/smoke.spec.ts`

- [ ] **Step 9.1: Write the e2e smoke test**

Create `tests/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('home page loads without error', async ({ page }) => {
  await page.goto('/')
  // Page must have a title (any non-error title)
  const title = await page.title()
  expect(title).not.toContain('Error')
  // Smoke test: the Button from app.vue should be visible
  await expect(page.getByRole('button', { name: /parsedmarc-nuxt/i })).toBeVisible()
})
```

The `playwright.config.ts` already configures `@nuxt/test-utils/playwright` at the config level with `use: { nuxt: { rootDir: ... } }` — this starts the Nuxt dev server automatically before tests run. No `setup()` call needed in individual test files.

- [ ] **Step 9.2: Install Playwright browsers if not already installed**

```bash
pnpm exec playwright install chromium
```

- [ ] **Step 9.3: Run the e2e suite**

```bash
pnpm test:e2e
```

Expected: 1 test passes. If the Nuxt server fails to start, check that `pnpm dev` runs without error first (Task 7.4).

- [ ] **Step 9.4: Commit**

```bash
git add tests/smoke.spec.ts
git commit -m "test: add Playwright e2e smoke test (home page loads + Button visible)"
```

---

## Task 10: Final Verification Pass

All 9 M1 exit criteria — verify each one explicitly.

- [ ] **10.1 — Tailwind compiling**

```bash
pnpm build 2>&1 | grep -E "(error|warn|✓|vite)" | tail -20
```

Expected: build completes without Tailwind-related errors. CSS is in the output.

- [ ] **10.2 — shadcn Button renders styled**

Start `pnpm dev`, open `http://localhost:3000`. Button should have: rounded corners, background color, padding, hover state. Stop dev server.

- [ ] **10.3 — All locked-in deps installed**

```bash
node -e "
const p = JSON.parse(require('fs').readFileSync('package.json','utf8'))
const deps = {...p.dependencies,...p.devDependencies}
const required = ['imapflow','mailparser','fast-xml-parser','maxmind','nuxt-auth-utils','croner','uplot','better-sqlite3','@types/mailparser','tailwindcss']
required.forEach(r => console.log(r, deps[r] ? '✓' : '✗ MISSING'))
"
```

Expected: all lines print `✓`.

- [ ] **10.4 — runtimeConfig declared in nuxt.config.ts**

```bash
grep -A 6 "runtimeConfig" nuxt.config.ts
```

Expected: `sessionPassword`, `maxmindLicenseKey`, `databaseUrl` all present.

- [ ] **10.5 — .env.example written**

```bash
cat .env.example
```

Expected: all three vars (`NUXT_SESSION_PASSWORD`, `NUXT_MAXMIND_LICENSE_KEY`, `DATABASE_URL`) documented and commented.

- [ ] **10.6 — data/ gitignored**

```bash
echo "data/" | git check-ignore --stdin
```

Expected output: `data/`

- [ ] **10.7 — Real Prisma schema in place**

```bash
grep -c "^model " prisma/schema.prisma
```

Expected: `9`

- [ ] **10.8 — Migration applied cleanly**

```bash
pnpm exec prisma migrate status
```

Expected: `All migrations have been applied.`

- [ ] **10.9 — pnpm test passes**

```bash
pnpm test
```

Expected: exits 0, all test files pass.

- [ ] **10.10 — pnpm test:e2e passes**

```bash
pnpm test:e2e
```

Expected: exits 0, smoke test passes.

- [ ] **10.11 — Final commit (if any loose files)**

```bash
git status
```

If any tracked files are modified and uncommitted:

```bash
git add -A
git commit -m "chore: M1 final tidy-up"
```

- [ ] **10.12 — Update ROADMAP.md M1 status**

In `docs/ROADMAP.md`, change each `[ ]` under M1 exit criteria to `[x]`:

```markdown
- [x] Tailwind installed and configured (PRD section 3 / AGENTS.md 11.1)
- [x] `pnpm dlx shadcn-nuxt init` run; at least one shadcn primitive renders styled in `app.vue` as a smoke test
- [x] All locked-in deps installed (AGENTS.md 11.2): `imapflow`, `mailparser`, `fast-xml-parser`, `maxmind`, `nuxt-auth-utils`, `croner`, `uplot`, `better-sqlite3`, plus types (`@types/mailparser`)
- [x] `nuxt.config.ts` declares `runtimeConfig` with placeholders for `sessionPassword`, `maxmindLicenseKey`, `databaseUrl`
- [x] `.env.example` written with every recognized env var commented
- [x] `.gitignore` updated to include `data/`
- [x] Real Prisma schema written from AGENTS.md section 5 model inventory
- [x] `pnpm exec prisma migrate dev --name init` runs cleanly against `data/parsedmarc.db`
- [x] `pnpm test` and `pnpm test:e2e` both pass (with whatever placeholder tests exist)
```

Also update AGENTS.md §12 (Development Status) checkboxes for the same items.

```bash
git add docs/ROADMAP.md AGENTS.md
git commit -m "docs: mark M1 exit criteria as complete in ROADMAP and AGENTS"
```
