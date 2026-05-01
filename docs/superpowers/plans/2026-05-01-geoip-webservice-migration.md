# GeoIP Web Service Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local GeoLite2-City MMDB pipeline with the official MaxMind `@maxmind/geoip2-node` `WebServiceClient` against the free `geolite.info` host, authenticated with `account_id` + `license_key`. Cache positive AND `AddressNotFoundError` negatives in the `GeoLocation` table so each IP triggers at most one definitive MaxMind API call.

**Architecture:** A Nitro startup plugin constructs a singleton `WebServiceClient` from runtime config; `lib/geoip/lookup.ts` queries it on cache miss and upserts the result (including all-null rows for `AddressNotFoundError`). Transient failures (network, auth, quota) deliberately bypass the cache so they retry on the next ingestion run. The on-disk MMDB, monthly refresh cron, `tar` extraction, and `maxmind` npm package are all removed.

**Tech Stack:** `@maxmind/geoip2-node` (new), Nuxt 4 / Nitro plugins, Prisma 7 (existing `GeoLocation` table — no migration), Vitest with `vi.mock` for unit tests, `pnpm` for dep management.

**Spec:** `docs/superpowers/specs/2026-05-01-geoip-webservice-migration-design.md`

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `package.json` | modify | Swap deps: `+@maxmind/geoip2-node`, `-maxmind`, `-tar` |
| `pnpm-lock.yaml` | regenerated | Side effect of `pnpm install` |
| `nuxt.config.ts` | modify | Add `maxmindAccountId` runtimeConfig field |
| `lib/geoip/client.ts` | create | Module-scoped `WebServiceClient` singleton (get/set) |
| `lib/geoip/reader.ts` | delete | Replaced by `client.ts` |
| `lib/geoip/download.ts` | delete | No more MMDB downloads |
| `lib/geoip/lookup.ts` | rewrite body | Query client; handle `AddressNotFoundError` (cache negative); transient errors return `null` without caching |
| `app/server/plugins/geoip-bootstrap.ts` | rewrite | Construct `WebServiceClient` singleton; warn-and-skip if either credential missing |
| `app/server/plugins/scheduler.ts` | modify | Drop the `// --- Monthly MMDB refresh ---` cron block + its imports |
| `test/unit/geoip/lookup.test.ts` | rewrite | Mock `client` not `reader`; camelCase response fields; +2 new tests for negative cache + transient |
| `AGENTS.md` | modify | Update §3 (stack), §7 (`Never` rule + `data/` mention), §8 (domain primer MMDB reference), §9 (ingestion flow), §11.4 (env vars) |

**Sequencing constraint:** `app/server/plugins/geoip-bootstrap.ts` and `app/server/plugins/scheduler.ts` both import from `lib/geoip/reader.ts` today. The plugins must be rewritten **before** `reader.ts` is deleted, otherwise the build fails between tasks.

---

## Task 1: Dependency Swap

**Files:**
- Modify: `package.json`
- Regenerated: `pnpm-lock.yaml`

- [ ] **Step 1: Remove `maxmind` and `tar` from dependencies**

Run from repo root:
```bash
pnpm remove maxmind tar
```

Expected: `package.json` no longer lists `maxmind` or `tar` under `dependencies`. `pnpm-lock.yaml` updated.

- [ ] **Step 2: Add `@maxmind/geoip2-node`**

Run:
```bash
pnpm add @maxmind/geoip2-node
```

Expected: `package.json` lists `@maxmind/geoip2-node` under `dependencies` with a caret-pinned version (e.g. `"^5.x.x"`).

- [ ] **Step 3: Verify the install left the workspace consistent**

Run:
```bash
pnpm install
```

Expected: "Already up to date" or a clean install with no errors. If `prisma generate` runs as part of `postinstall`, it must complete cleanly.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: swap maxmind+tar for @maxmind/geoip2-node"
```

---

## Task 2: Add `maxmindAccountId` to runtimeConfig

**Files:**
- Modify: `nuxt.config.ts`

- [ ] **Step 1: Add the new field next to the existing license key**

Open `nuxt.config.ts`. Locate the `runtimeConfig` block (currently around lines 37–42):

```ts
  runtimeConfig: {
    sessionPassword: '',         // NUXT_SESSION_PASSWORD
    maxmindLicenseKey: '',       // NUXT_MAXMIND_LICENSE_KEY
    databaseUrl: process.env.DATABASE_URL ?? '', // bridges to Prisma's DATABASE_URL
    public: {},
  },
```

Replace with:

```ts
  runtimeConfig: {
    sessionPassword: '',         // NUXT_SESSION_PASSWORD
    maxmindAccountId: '',        // NUXT_MAXMIND_ACCOUNT_ID
    maxmindLicenseKey: '',       // NUXT_MAXMIND_LICENSE_KEY
    databaseUrl: process.env.DATABASE_URL ?? '', // bridges to Prisma's DATABASE_URL
    public: {},
  },
```

- [ ] **Step 2: Verify Nuxt typegen picks up the new field**

Run:
```bash
pnpm exec nuxt prepare
```

Expected: completes without errors. (This regenerates `.nuxt/types/` with `maxmindAccountId` in the `RuntimeConfig` type so subsequent files can read it without TS errors.)

- [ ] **Step 3: Commit**

```bash
git add nuxt.config.ts
git commit -m "config: add NUXT_MAXMIND_ACCOUNT_ID to runtimeConfig"
```

---

## Task 3: Create `lib/geoip/client.ts` Singleton

**Files:**
- Create: `lib/geoip/client.ts`

- [ ] **Step 1: Write the file**

Create `lib/geoip/client.ts` with exactly this content:

```ts
import type { WebServiceClient } from '@maxmind/geoip2-node'

/**
 * Module-scoped singleton holding the MaxMind WebServiceClient.
 * Set once at startup by app/server/plugins/geoip-bootstrap.ts after
 * verifying that both NUXT_MAXMIND_ACCOUNT_ID and NUXT_MAXMIND_LICENSE_KEY
 * are configured. lib/geoip/lookup.ts reads it on each cache miss.
 *
 * Returns null until set, or if credentials are missing — callers must
 * handle the null case (lookupIp returns null without caching, so the
 * lookup is retried on the next ingestion run).
 */
let client: WebServiceClient | null = null

export function setGeoClient(c: WebServiceClient | null): void {
  client = c
}

export function getGeoClient(): WebServiceClient | null {
  return client
}
```

- [ ] **Step 2: Verify the file typechecks**

Run:
```bash
pnpm exec nuxt prepare && pnpm exec tsc --noEmit -p .
```

Expected: no errors. (If the project lacks a top-level `tsc` script, `pnpm exec nuxt prepare` alone is sufficient — Nuxt's typegen surfaces import errors.)

- [ ] **Step 3: Commit**

```bash
git add lib/geoip/client.ts
git commit -m "feat(geoip): add WebServiceClient singleton getter/setter"
```

---

## Task 4: Rewrite `lib/geoip/lookup.ts` with TDD

**Files:**
- Test: `test/unit/geoip/lookup.test.ts`
- Modify: `lib/geoip/lookup.ts`

This is the only file in this migration that needs proper TDD. The other changes are plumbing.

- [ ] **Step 1: Replace the entire test file with the new test suite**

Open `test/unit/geoip/lookup.test.ts` and replace its entire contents with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddressNotFoundError } from '@maxmind/geoip2-node'

// vi.mock is hoisted — these mocks are applied before the imports below
vi.mock('../../../lib/prisma', () => ({
  default: {
    geoLocation: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

vi.mock('../../../lib/geoip/client', () => ({
  getGeoClient: vi.fn(),
}))

import { lookupIp } from '../../../lib/geoip/lookup'
import prisma from '../../../lib/prisma'
import { getGeoClient } from '../../../lib/geoip/client'

const mockFindUnique = vi.mocked(prisma.geoLocation.findUnique)
const mockUpsert = vi.mocked(prisma.geoLocation.upsert)
const mockGetClient = vi.mocked(getGeoClient)

describe('lookupIp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cached result from DB on cache hit', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'geo1',
      ip: '8.8.8.8',
      country: 'US',
      city: 'Mountain View',
      latitude: 37.4,
      longitude: -122.1,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('8.8.8.8')

    expect(result).toEqual({ country: 'US', city: 'Mountain View', lat: 37.4, lon: -122.1 })
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { ip: '8.8.8.8' } })
    // Client must not be touched on a cache hit
    expect(mockGetClient).not.toHaveBeenCalled()
  })

  it('returns null when client is not configured (creds unset)', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    mockGetClient.mockReturnValueOnce(null)

    const result = await lookupIp('8.8.8.8')

    expect(result).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('queries client, stores result, and returns it on cache miss', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockResolvedValue({
        country: { isoCode: 'DE' },
        city: { names: { en: 'Berlin' } },
        location: { latitude: 52.52, longitude: 13.4 },
      }),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)
    mockUpsert.mockResolvedValueOnce({
      id: 'geo2',
      ip: '1.2.3.4',
      country: 'DE',
      city: 'Berlin',
      latitude: 52.52,
      longitude: 13.4,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('1.2.3.4')

    expect(fakeClient.city).toHaveBeenCalledWith('1.2.3.4')
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '1.2.3.4' },
      create: { ip: '1.2.3.4', country: 'DE', city: 'Berlin', latitude: 52.52, longitude: 13.4 },
      update: { country: 'DE', city: 'Berlin', latitude: 52.52, longitude: 13.4, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: 'DE', city: 'Berlin', lat: 52.52, lon: 13.4 })
  })

  it('caches negative result on AddressNotFoundError', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockRejectedValue(new AddressNotFoundError('IP address not found')),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)
    mockUpsert.mockResolvedValueOnce({
      id: 'geo-neg',
      ip: '192.168.1.1',
      country: null,
      city: null,
      latitude: null,
      longitude: null,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('192.168.1.1')

    expect(fakeClient.city).toHaveBeenCalledWith('192.168.1.1')
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '192.168.1.1' },
      create: { ip: '192.168.1.1', country: null, city: null, latitude: null, longitude: null },
      update: { country: null, city: null, latitude: null, longitude: null, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: null, city: null, lat: null, lon: null })
  })

  it('does not cache transient errors', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)

    const result = await lookupIp('1.2.3.4')

    expect(result).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns partial result when client response is missing optional fields', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockResolvedValue({
        country: { isoCode: 'US' },
        // city and location intentionally omitted — real MaxMind may omit these
      }),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)
    mockUpsert.mockResolvedValueOnce({
      id: 'geo3',
      ip: '1.1.1.1',
      country: 'US',
      city: null,
      latitude: null,
      longitude: null,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('1.1.1.1')

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '1.1.1.1' },
      create: { ip: '1.1.1.1', country: 'US', city: null, latitude: null, longitude: null },
      update: { country: 'US', city: null, latitude: null, longitude: null, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: 'US', city: null, lat: null, lon: null })
  })

  it('returns null fields when client response omits everything', async () => {
    mockFindUnique.mockResolvedValueOnce(null)
    const fakeClient = {
      city: vi.fn().mockResolvedValue({ country: {} }),
    } as any
    mockGetClient.mockReturnValueOnce(fakeClient)
    mockUpsert.mockResolvedValueOnce({
      id: 'geo4',
      ip: '2.2.2.2',
      country: null,
      city: null,
      latitude: null,
      longitude: null,
      lookedUpAt: new Date(),
    } as any)

    const result = await lookupIp('2.2.2.2')

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ip: '2.2.2.2' },
      create: { ip: '2.2.2.2', country: null, city: null, latitude: null, longitude: null },
      update: { country: null, city: null, latitude: null, longitude: null, lookedUpAt: expect.any(Date) },
    })
    expect(result).toEqual({ country: null, city: null, lat: null, lon: null })
  })
})
```

- [ ] **Step 2: Run the tests and verify they FAIL**

Run:
```bash
pnpm test:unit -- test/unit/geoip/lookup.test.ts
```

Expected: tests fail. The exact failure mode varies — likely module resolution errors (the test imports `AddressNotFoundError` from `@maxmind/geoip2-node`, which is fine, but `lib/geoip/lookup.ts` still imports from `./reader` and uses snake_case fields, so the assertions won't match). The point is tests are running and at least one must be failing. If they all pass, the test file or current implementation is wrong — stop and investigate.

- [ ] **Step 3: Replace `lib/geoip/lookup.ts` with the new implementation**

Open `lib/geoip/lookup.ts` and replace its entire contents with:

```ts
import { AddressNotFoundError } from '@maxmind/geoip2-node'
import prisma from '../prisma'
import { getGeoClient } from './client'

export type GeoResult = {
  country: string | null
  city: string | null
  lat: number | null
  lon: number | null
}

/**
 * Look up geo information for an IP address.
 *
 * Resolution order:
 * 1. GeoLocation table (DB cache — both positive and AddressNotFoundError negatives are cached here)
 * 2. MaxMind WebServiceClient (set by app/server/plugins/geoip-bootstrap.ts)
 * 3. null  (creds unset, or transient network/auth/quota error — retry next ingestion)
 *
 * Caching contract:
 * - Cache hit: return shape from row (fields may be null for cached negatives).
 * - Web service success: upsert with returned fields, return shape.
 * - AddressNotFoundError: upsert all-null row, return null-shape (definitive negative).
 * - Other errors (network, auth, quota): do NOT upsert, return plain null so the
 *   caller can retry on the next ingestion run.
 */
export async function lookupIp(ip: string): Promise<GeoResult | null> {
  // 1. DB cache hit (positive or cached negative)
  const cached = await prisma.geoLocation.findUnique({ where: { ip } })
  if (cached) {
    return {
      country: cached.country,
      city: cached.city,
      lat: cached.latitude,
      lon: cached.longitude,
    }
  }

  // 2. Client not configured → don't cache, signal "couldn't ask"
  const client = getGeoClient()
  if (!client) return null

  // 3. Web service call
  let response
  try {
    response = await client.city(ip)
  }
  catch (err) {
    // Definitive: MaxMind has no record for this IP → cache the negative
    if (err instanceof AddressNotFoundError) {
      await prisma.geoLocation.upsert({
        where: { ip },
        create: { ip, country: null, city: null, latitude: null, longitude: null },
        update: { country: null, city: null, latitude: null, longitude: null, lookedUpAt: new Date() },
      })
      return { country: null, city: null, lat: null, lon: null }
    }
    // Transient (network, auth, quota): do NOT cache, log, return null so we retry next time
    console.warn(`[geoip] lookup failed for ${ip}: ${(err as Error).message}`)
    return null
  }

  const country = response.country?.isoCode ?? null
  const city = response.city?.names?.en ?? null
  const lat = response.location?.latitude ?? null
  const lon = response.location?.longitude ?? null

  await prisma.geoLocation.upsert({
    where: { ip },
    create: { ip, country, city, latitude: lat, longitude: lon },
    update: { country, city, latitude: lat, longitude: lon, lookedUpAt: new Date() },
  })

  return { country, city, lat, lon }
}
```

- [ ] **Step 4: Run the tests and verify they PASS**

Run:
```bash
pnpm test:unit -- test/unit/geoip/lookup.test.ts
```

Expected: all 7 tests pass. If a test fails, read the diff between expected and actual carefully — the most common cause is a typo in field names (`isoCode` vs `iso_code`) or a forgotten `await` on the prisma upsert.

- [ ] **Step 5: Commit**

```bash
git add lib/geoip/lookup.ts test/unit/geoip/lookup.test.ts
git commit -m "feat(geoip): query WebServiceClient with negative-result caching"
```

---

## Task 5: Rewrite `app/server/plugins/geoip-bootstrap.ts`

**Files:**
- Modify: `app/server/plugins/geoip-bootstrap.ts`

- [ ] **Step 1: Replace the entire file with the new bootstrap**

Open `app/server/plugins/geoip-bootstrap.ts` and replace its entire contents with:

```ts
import { WebServiceClient } from '@maxmind/geoip2-node'
import { setGeoClient } from '~~/lib/geoip/client'

/**
 * GeoIP startup plugin.
 *
 * Constructs the MaxMind WebServiceClient singleton against the free
 * GeoLite2 web service host (`geolite.info`) using NUXT_MAXMIND_ACCOUNT_ID
 * + NUXT_MAXMIND_LICENSE_KEY. If either credential is missing, logs a
 * warning and skips initialization — lookupIp will then return null for
 * every cache miss, and ingestion proceeds without geo enrichment.
 */
export default defineNitroPlugin(() => {
  const { maxmindAccountId, maxmindLicenseKey } = useRuntimeConfig()

  if (!maxmindAccountId || !maxmindLicenseKey) {
    console.warn(
      '[geoip] NUXT_MAXMIND_ACCOUNT_ID and NUXT_MAXMIND_LICENSE_KEY required '
      + '— GeoIP lookups will return null',
    )
    return
  }

  setGeoClient(new WebServiceClient(maxmindAccountId, maxmindLicenseKey, { host: 'geolite.info' }))
  console.info('[geoip] WebServiceClient initialized (geolite.info)')
})
```

- [ ] **Step 2: Verify the file typechecks**

Run:
```bash
pnpm exec nuxt prepare
```

Expected: no errors. (Nuxt's typegen confirms `useRuntimeConfig().maxmindAccountId` is a known field and `setGeoClient` is exported correctly.)

- [ ] **Step 3: Commit**

```bash
git add app/server/plugins/geoip-bootstrap.ts
git commit -m "refactor(geoip): bootstrap WebServiceClient instead of MMDB Reader"
```

---

## Task 6: Drop the Monthly MMDB Refresh from `scheduler.ts`

**Files:**
- Modify: `app/server/plugins/scheduler.ts`

- [ ] **Step 1: Remove the unused imports**

Open `app/server/plugins/scheduler.ts`. The current file (96 lines) starts with these imports:

```ts
import { Cron } from 'croner'
import { join } from 'node:path'
import { open } from 'maxmind'
import { downloadMmdb } from '~~/lib/geoip/download'
import { setGeoReader } from '~~/lib/geoip/reader'
import prisma from '~~/lib/prisma'
import { decrypt } from '../utils/encryption'
import { runIngest } from '../utils/ingest'
```

Replace those eight lines with:

```ts
import { Cron } from 'croner'
import prisma from '~~/lib/prisma'
import { decrypt } from '../utils/encryption'
import { runIngest } from '../utils/ingest'
```

(`join`, `open`, `downloadMmdb`, `setGeoReader` are no longer needed.)

- [ ] **Step 2: Remove the `MMDB_PATH` constant**

Locate and delete this line (currently line 10):

```ts
const MMDB_PATH = join(process.cwd(), 'data', 'GeoLite2-City.mmdb')
```

- [ ] **Step 3: Remove the entire monthly MMDB refresh cron block**

Locate the block currently at lines 37–54:

```ts
  // --- Monthly MMDB refresh ---
  new Cron('0 4 1 * *', async () => {
    const licenseKey = useRuntimeConfig().maxmindLicenseKey
    if (!licenseKey) {
      console.warn('[scheduler] MMDB refresh skipped — NUXT_MAXMIND_LICENSE_KEY not set')
      return
    }
    console.info('[scheduler] Starting monthly MMDB refresh…')
    try {
      await downloadMmdb(licenseKey, MMDB_PATH)
      const reader = await open(MMDB_PATH)
      setGeoReader(reader)
      console.info('[scheduler] MMDB refresh complete')
    }
    catch (err) {
      console.error('[scheduler] MMDB refresh failed:', (err as Error).message)
    }
  })

```

Delete the entire block (including the trailing blank line). The smoke-test cron (`new Cron('* * * * *', { maxRuns: 1 }, …)`) and the per-inbox dispatcher cron remain untouched.

- [ ] **Step 4: Verify the file typechecks**

Run:
```bash
pnpm exec nuxt prepare
```

Expected: no errors.

- [ ] **Step 5: Verify the per-inbox dispatcher tests (if any) still pass**

Run:
```bash
pnpm test:unit
```

Expected: no regressions in non-geoip unit tests.

- [ ] **Step 6: Commit**

```bash
git add app/server/plugins/scheduler.ts
git commit -m "refactor(scheduler): drop monthly MMDB refresh cron"
```

---

## Task 7: Delete Obsolete `lib/geoip` Files

**Files:**
- Delete: `lib/geoip/reader.ts`
- Delete: `lib/geoip/download.ts`

By this point no source file imports from either — verify before deleting.

- [ ] **Step 1: Confirm no references remain**

Run:
```bash
pnpm exec rg -n "from ['\"](~~/)?lib/geoip/(reader|download)" app/ lib/ test/
```

Expected: zero matches. If anything matches, fix that file first — do not proceed to deletion until the search is empty.

- [ ] **Step 2: Delete the files**

Run:
```bash
git rm lib/geoip/reader.ts lib/geoip/download.ts
```

- [ ] **Step 3: Verify the build still typechecks and tests still pass**

Run:
```bash
pnpm exec nuxt prepare && pnpm test:unit
```

Expected: prepare completes without errors; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(geoip): delete obsolete reader and download modules"
```

---

## Task 8: Update `AGENTS.md`

**Files:**
- Modify: `AGENTS.md`

The spec calls for updates to four sections. Each step below is a single edit.

- [ ] **Step 1: Update §3 stack table — replace the GeoIP-related rows**

Locate the rows currently at lines 43 and 44:

```markdown
| GeoIP reader | `maxmind` (npm) | Reads GeoLite2-City.mmdb in-process | to add |
| GeoIP DB | GeoLite2-City.mmdb | Downloaded at server start, refreshed monthly via croner | runtime artifact |
```

Replace with:

```markdown
| GeoIP client | `@maxmind/geoip2-node` | Calls MaxMind GeoLite2 web service (`geolite.info`) at ingestion time | installed |
```

(One row replaces two — the runtime-artifact row is gone because there is no longer an on-disk MMDB.)

- [ ] **Step 2: Update §7 `Always` — remove the obsolete MMDB refresh reference**

Locate the bullet currently at line 161:

```markdown
- All recurring or long-running work (IMAP poll, MMDB refresh) goes through `app/server/plugins/scheduler.ts` registered croner jobs — never `setInterval` in module scope.
```

Replace with:

```markdown
- All recurring or long-running work (IMAP poll) goes through `app/server/plugins/scheduler.ts` registered croner jobs — never `setInterval` in module scope.
```

- [ ] **Step 3: Update §7 `Never` — replace the `data/` line and the GeoIP rule**

Locate the bullet currently at line 166:

```markdown
- Commit anything under `data/` (SQLite file, MMDB) — `.gitignore` must cover it.
```

Replace with:

```markdown
- Commit anything under `data/` (SQLite file) — `.gitignore` must cover it.
```

Then locate the bullet currently at line 169:

```markdown
- Fetch GeoIP data per-record from MaxMind's web API at request time. Always go through the local MMDB via `lib/geoip/`.
```

Replace with:

```markdown
- Call `WebServiceClient` directly from a route handler or page. GeoIP web service calls happen at ingestion time only, through `lib/geoip/lookup.ts`. Each IP is queried at most once across the deployment lifetime; results (including `AddressNotFoundError` negatives) are cached indefinitely in the `GeoLocation` table. Render paths read only from the cache via `lookupIp`.
```

- [ ] **Step 4: Update §8 domain primer — drop the MMDB reference**

Locate the sentence currently at line 183:

```markdown
**Why GeoIP matters**: every `<record>` carries a `source_ip`. Mapping IP → country/city is what turns "12,000 failed messages" into "12,000 failed messages from one IP block in Lagos" — actionable. We cache lookups in the `GeoLocation` table to avoid re-reading the MMDB on every render.
```

Replace with:

```markdown
**Why GeoIP matters**: every `<record>` carries a `source_ip`. Mapping IP → country/city is what turns "12,000 failed messages" into "12,000 failed messages from one IP block in Lagos" — actionable. We cache lookups in the `GeoLocation` table so each IP triggers at most one MaxMind web service call.
```

- [ ] **Step 5: Update §9 ingestion flow — drop the MMDB downloader paragraph**

Locate the paragraph currently at line 218 (the last paragraph of §9, just before §10):

```markdown
The MMDB downloader is its own croner job (`0 4 1 * *` — 04:00 on the 1st of each month) plus a one-shot bootstrap call from `app/server/plugins/geoip-bootstrap.ts` at server start.
```

Replace with:

```markdown
GeoIP enrichment is performed via the MaxMind GeoLite2 web service through `lib/geoip/lookup.ts`; results (positive and `AddressNotFoundError` negatives) are cached indefinitely in the `GeoLocation` table. The `app/server/plugins/geoip-bootstrap.ts` plugin constructs the `WebServiceClient` singleton at server start.
```

- [ ] **Step 6: Update §11.4 — list both env vars**

Locate the bullet currently at line 242:

```markdown
4. **`.env.example`**: ship with `MAXMIND_LICENSE_KEY=`, `NUXT_SESSION_PASSWORD=` (32+ chars, required by nuxt-auth-utils), `DATABASE_URL=file:./data/parsedmarc.db`.
```

Replace with:

```markdown
4. **`.env.example`**: ship with `NUXT_MAXMIND_ACCOUNT_ID=`, `NUXT_MAXMIND_LICENSE_KEY=`, `NUXT_SESSION_PASSWORD=` (32+ chars, required by nuxt-auth-utils), `DATABASE_URL=file:./data/parsedmarc.db`.
```

- [ ] **Step 7: Verify no stale MMDB references remain**

Run:
```bash
pnpm exec rg -n "MMDB|GeoLite2-City\.mmdb|downloadMmdb|setGeoReader" AGENTS.md
```

Expected: zero matches. Any hit indicates a section that still references the removed MMDB pipeline and must be cleaned up before commit. Then run a broader sanity check:

```bash
pnpm exec rg -n "@maxmind/geoip2-node|GeoLite2 web service|geolite\.info" AGENTS.md
```

Expected: at least one match each in §3 (stack table row), §7 (`Never` bullet) or §9 (ingestion paragraph). These are the surviving, intended references.

- [ ] **Step 8: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): update GeoIP architecture references for web service migration"
```

---

## Task 9: Final Verification

**Files:** none (validation only)

- [ ] **Step 1: Full unit test suite**

Run:
```bash
pnpm test:unit
```

Expected: all tests pass, including the 7 lookupIp tests from Task 4.

- [ ] **Step 2: Nuxt typegen + project typecheck**

Run:
```bash
pnpm exec nuxt prepare
```

Expected: completes cleanly. (No standalone `tsc` script in this repo; `nuxt prepare` surfaces type errors via Nuxt's auto-generated types.)

- [ ] **Step 3: Boot the dev server with credentials unset and confirm graceful warning**

Run:
```bash
unset NUXT_MAXMIND_ACCOUNT_ID NUXT_MAXMIND_LICENSE_KEY
pnpm dev
```

Expected, in the server log within ~5 seconds of startup:
```
[geoip] NUXT_MAXMIND_ACCOUNT_ID and NUXT_MAXMIND_LICENSE_KEY required — GeoIP lookups will return null
```

The server must continue starting (no crash). Stop with `Ctrl+C` once the warning is observed.

- [ ] **Step 4: Boot the dev server with credentials set and confirm initialization**

Set the credentials (use a real GeoLite2 account_id + license_key from the operator's MaxMind account), then run:
```bash
NUXT_MAXMIND_ACCOUNT_ID=<your-id> NUXT_MAXMIND_LICENSE_KEY=<your-key> pnpm dev
```

Expected, in the server log:
```
[geoip] WebServiceClient initialized (geolite.info)
```

Stop with `Ctrl+C`.

- [ ] **Step 5: Confirm `data/` no longer accumulates an MMDB**

Run:
```bash
ls data/
```

Expected: `parsedmarc.db` only (the previously-generated `GeoLite2-City.mmdb` may still be present from the old code path — it is now orphaned and may be deleted manually with `rm data/GeoLite2-City.mmdb`, but this is operator discretion, not part of the migration).

- [ ] **Step 6: Final commit (if any uncommitted state remains)**

Run:
```bash
git status --short
```

If there are any uncommitted files at this point (there should not be — every task ends in a commit), investigate before declaring done. If clean, the migration is complete.

---

## Summary of Commits

A clean execution produces these commits in order:

1. `deps: swap maxmind+tar for @maxmind/geoip2-node`
2. `config: add NUXT_MAXMIND_ACCOUNT_ID to runtimeConfig`
3. `feat(geoip): add WebServiceClient singleton getter/setter`
4. `feat(geoip): query WebServiceClient with negative-result caching`
5. `refactor(geoip): bootstrap WebServiceClient instead of MMDB Reader`
6. `refactor(scheduler): drop monthly MMDB refresh cron`
7. `refactor(geoip): delete obsolete reader and download modules`
8. `docs(agents): update GeoIP architecture references for web service migration`

Each commit independently passes `pnpm test:unit` and `pnpm exec nuxt prepare`. Bisecting through this branch is safe at every step.
