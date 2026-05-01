# GeoIP Web Service Migration — Design

**Date:** 2026-05-01
**Status:** Approved (pending implementation plan)
**Supersedes (operationally, not as record):** parts of `2026-05-01-m3-geoip-bootstrap-scheduler.md` describing the MMDB downloader path.

## 1. Summary

Replace the local-MMDB GeoIP pipeline with the official MaxMind `@maxmind/geoip2-node` `WebServiceClient`, pointed at the free GeoLite2 web service host (`geolite.info`). Authenticate with the MaxMind-mandated pair of credentials: `account_id` + `license_key`. Keep the existing `GeoLocation` DB cache and extend it to also cache **negative** lookups (`AddressNotFoundError`) so each IP triggers at most one definitive MaxMind API call.

This drops the in-process MMDB binary, the monthly `tar.gz` download, the `tar` and `maxmind` npm dependencies, and the entire on-disk MMDB lifecycle.

## 2. Motivation

- **MaxMind credential guideline:** MaxMind's current authentication contract requires both `account_id` and `license_key`. The query-string-only `license_key=...` form used today is being phased out of their guidance.
- **Operational simplification:** No file-system artifact, no `tar` extraction, no startup gating on a `~70 MB` download, no monthly refresh job, no 35-day staleness window.
- **Always-fresh data:** Web service responses reflect MaxMind's current database, not whatever the last successful download produced.

## 3. Trade-offs (acknowledged)

- Every cache **miss** is now a network round-trip (~50–200 ms) instead of a microsecond MMDB read. The existing `GeoLocation` DB cache makes this a one-time cost per IP rather than per-record.
- Ingestion gains a network dependency on `geolite.info`. Transient failures degrade gracefully (return `null`, retry next ingestion) rather than crashing.
- MaxMind GeoLite2 web service has rate limits. Negative caching (see §6) is the primary defense.

## 4. Architecture

```
Ingestion (per DMARC record source_ip):
  lookupIp(ip)
    ├─ DB cache hit?            → return shape from GeoLocation row (incl. all-null cached negative)
    ├─ getGeoClient() === null? → return null (creds unset; retry next ingestion)
    ├─ client.city(ip)
    │    ├─ success             → upsert GeoLocation, return shape
    │    ├─ AddressNotFoundError → upsert all-null GeoLocation, return null-shape
    │    └─ other error         → log, return null, do NOT upsert (transient — retry next ingestion)
```

Render path (`app/pages/ips/[ip].vue`, `app/server/api/ips/[ip].get.ts`, etc.) reads only from the `GeoLocation` cache via `lookupIp`. **No render-time web service calls.**

## 5. Components

### 5.1 `lib/geoip/client.ts` (new — replaces `reader.ts`)

Module-scoped singleton mirroring the old `getGeoReader / setGeoReader` shape:

```ts
import { WebServiceClient } from '@maxmind/geoip2-node'

let client: WebServiceClient | null = null

export function setGeoClient(c: WebServiceClient | null): void { client = c }
export function getGeoClient(): WebServiceClient | null { return client }
```

### 5.2 `app/server/plugins/geoip-bootstrap.ts` (rewritten)

```ts
import { WebServiceClient } from '@maxmind/geoip2-node'
import { setGeoClient } from '~~/lib/geoip/client'

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

No file system access, no `MMDB_PATH`, no async setup. The `host: 'geolite.info'` is **hardcoded** — selecting the free GeoLite2 web service. (Switching to paid GeoIP2 is out of scope; if needed later, expose host via runtimeConfig.)

### 5.3 `lib/geoip/lookup.ts` (rewritten body, same exported shape)

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

export async function lookupIp(ip: string): Promise<GeoResult | null> {
  // 1. DB cache hit (positive or negative)
  const cached = await prisma.geoLocation.findUnique({ where: { ip } })
  if (cached) {
    return {
      country: cached.country,
      city: cached.city,
      lat: cached.latitude,
      lon: cached.longitude,
    }
  }

  // 2. Client not configured → don't cache, retry next ingestion
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

**Field-name change:** SDK returns camelCase (`country.isoCode`, `location.latitude`); the old MMDB Reader returned snake_case (`country.iso_code`). Callers of `lookupIp` see the unchanged `GeoResult` shape — only the SDK-facing field names change inside this file.

### 5.4 `app/server/plugins/scheduler.ts` (deletion)

Remove the entire `// --- Monthly MMDB refresh ---` block (the `Cron('0 4 1 * *', ...)` and its imports: `open` from `maxmind`, `downloadMmdb`, `setGeoReader`, `MMDB_PATH`). The smoke-test cron and per-inbox dispatcher are untouched.

### 5.5 `nuxt.config.ts`

Add to `runtimeConfig`:
```ts
maxmindAccountId: '',       // NUXT_MAXMIND_ACCOUNT_ID
maxmindLicenseKey: '',      // NUXT_MAXMIND_LICENSE_KEY (existing)
```

### 5.6 Files to delete

- `lib/geoip/download.ts` — obsolete (no MMDB downloads)
- `lib/geoip/reader.ts` — replaced by `client.ts`

### 5.7 `package.json`

- **Add:** `@maxmind/geoip2-node`
- **Remove:** `maxmind`, `tar`, and `@types/tar` if present.
- Run `pnpm install` to update `pnpm-lock.yaml`.

## 6. Caching Contract (explicit)

Each IP is queried until MaxMind returns a **definitive** answer (success or `AddressNotFoundError`), then never queried again. Transient failures (network, auth, quota) are intentionally NOT cached so they can be retried on the next ingestion run.

| Outcome | Cache | `lookupIp` returns |
|---------|-------|--------------------|
| DB cache hit (any row) | already cached | `{ country, city, lat, lon }` from row (fields may be null) |
| Web service success | upsert with returned fields | shape with non-null fields where present |
| `AddressNotFoundError` | **upsert with all geo fields null**, `lookedUpAt = now` | `{ country: null, city: null, lat: null, lon: null }` |
| Network / auth / quota error | **do not upsert** | `null` |
| Client not configured (creds unset) | **do not upsert** | `null` |

Return-value distinction:
- `{ country: null, city: null, lat: null, lon: null }` = "we asked, MaxMind has no data for this IP" (definitive negative).
- `null` = "we couldn't ask right now" (transient).

This distinction is what gives callers (and the DB) the ability to retry transient failures without poisoning the cache.

**No TTL on negative results.** AddressNotFoundError is treated as definitive. Re-checking unrouted IPs is out of scope; if it ever matters, add a `lookedUpAt < now - 90d` predicate to the cache hit check in a follow-up.

## 7. Error Handling

| Error site | Handling |
|------------|----------|
| `geoip-bootstrap.ts` — creds missing | `console.warn(...)`, plugin returns; subsequent `getGeoClient()` calls return `null`; `lookupIp` returns `null` for cache misses; ingestion continues without geo data |
| `lookup.ts` — `AddressNotFoundError` | Cached as null-row; subsequent lookups for same IP are DB cache hits |
| `lookup.ts` — other thrown errors | Logged via `console.warn`; not cached; `lookupIp` returns `null`; caller (ingestion) records record without geo and proceeds |
| `WebServiceClient` constructor | Throws synchronously on bad input shape — should never happen with our string-typed `useRuntimeConfig()` values; would surface as a Nitro plugin startup error |

No new `createError(...)` calls are introduced. GeoIP failures never propagate to API responses.

## 8. Tests

`test/unit/geoip/lookup.test.ts` updates:

**Mock swap (mechanical):**
- `vi.mock('../../../lib/geoip/reader')` → `vi.mock('../../../lib/geoip/client')`
- `mockGetReader` → `mockGetClient`
- Fake reader's `get()` returning a value → fake client's `city()` returning a Promise
- Mock response field names: `iso_code` → `isoCode`

**Test cases (final list):**

1. `returns cached result from DB on cache hit` — unchanged in spirit; verify `getGeoClient` is NOT called on a hit.
2. `returns null when client is not configured` — replaces the old "Reader not loaded" test. `getGeoClient` returns `null`, expect `lookupIp` returns plain `null` and no upsert.
3. `queries client, stores result, and returns it on cache miss` — was the Reader-success test; now uses `client.city` returning camelCase.
4. **NEW: `caches negative result on AddressNotFoundError`** — `client.city` rejects with `new AddressNotFoundError('not found for IP …')`. Expect upsert called with `{country:null, city:null, latitude:null, longitude:null}` and result = `{country:null, city:null, lat:null, lon:null}`.
5. **NEW: `does not cache transient errors`** — `client.city` rejects with `new Error('ECONNREFUSED')`. Expect upsert NOT called and result = `null`.
6. `returns partial result when response is missing optional fields` — keep, with camelCase response (`country.isoCode: 'US'`, no `city`/`location`).
7. `returns null fields when response omits everything` — keep, with empty `country: {}`.

Tests for `geoip-bootstrap.ts` and `scheduler.ts` are not currently present and remain out of scope; the bootstrap rewrite is small and exercised by the lookup tests via the singleton getter.

## 9. Documentation Changes

`AGENTS.md`:

- **§3 stack table:** Remove the `maxmind` (npm) row and the `GeoLite2-City.mmdb` runtime-artifact row. Add `@maxmind/geoip2-node` as the GeoIP client. Remove `tar` mention if present.
- **§7 conventions:** Replace the existing "Never … Fetch GeoIP data per-record from MaxMind's web API at request time. Always go through the local MMDB via `lib/geoip/`." rule with:
  > "GeoIP web service calls happen at ingestion time only, through `lib/geoip/lookup.ts`. Each IP is queried at most once across the deployment lifetime; results (including `AddressNotFoundError` negatives) are cached indefinitely in the `GeoLocation` table. Render paths read only from the cache via `lookupIp`. Never call `WebServiceClient` directly from a route handler or page."
- **§9 IMAP ingestion flow:** Drop the paragraph "The MMDB downloader is its own croner job (`0 4 1 * *` …) plus a one-shot bootstrap call from `app/server/plugins/geoip-bootstrap.ts` at server start." Replace with: "GeoIP enrichment happens via the MaxMind web service through `lib/geoip/lookup.ts`; results are cached in the `GeoLocation` table."
- **§11.4 (`.env.example` placeholders):** Update the listed env vars to include both `NUXT_MAXMIND_ACCOUNT_ID=` and `NUXT_MAXMIND_LICENSE_KEY=`.

`docs/superpowers/specs/` and `docs/superpowers/plans/` historical milestone files are left untouched (they are immutable historical records).

`.gitignore` is left untouched — `data/` still hosts `parsedmarc.db`.

## 10. Files Touched (final)

| File | Change |
|------|--------|
| `nuxt.config.ts` | +1 runtimeConfig field (`maxmindAccountId`) |
| `package.json` | swap `maxmind`+`tar` (+`@types/tar` if present) → `@maxmind/geoip2-node` |
| `pnpm-lock.yaml` | regenerated by `pnpm install` |
| `lib/geoip/client.ts` | **new** (singleton WebServiceClient) |
| `lib/geoip/reader.ts` | **deleted** |
| `lib/geoip/download.ts` | **deleted** |
| `lib/geoip/lookup.ts` | swap Reader for client.city; add AddressNotFoundError negative caching; transient-error pass-through |
| `app/server/plugins/geoip-bootstrap.ts` | rewrite — construct client only, no download |
| `app/server/plugins/scheduler.ts` | drop monthly MMDB refresh cron block + its imports |
| `test/unit/geoip/lookup.test.ts` | mock swap + 2 new tests + 1 repurposed |
| `AGENTS.md` | §3, §7, §9, §11.4 updates |

## 11. Out of Scope (YAGNI)

- Configurable `host` for the paid GeoIP2 web service (hardcoded `geolite.info`).
- TTL on negative cache rows (no expiry; manual `DELETE FROM GeoLocation WHERE country IS NULL` if ever needed).
- New `.env.example` file (AGENTS.md §11.4 still flags this as a separate gap).
- Unit tests for `geoip-bootstrap.ts` or `scheduler.ts`.
- Migration tooling for existing deployments — the `GeoLocation` table schema is unchanged; existing cached rows keep working. The local `data/GeoLite2-City.mmdb` file becomes orphaned; operators may delete it manually.
- Quota / rate-limit telemetry for MaxMind calls.
