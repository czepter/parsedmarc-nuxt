# Filter Persistence — Design

**Date:** 2026-05-03
**Status:** Approved

## 1. Summary

Persist the active time-window filter (`24h` / `7d` / `30d` / `90d`) across browser sessions by storing it in the database on the `User` row. Additionally, carry the current `window=` query param forward when navigating between pages (Dashboard ↔ Records ↔ Settings etc.) so the user's context is never silently reset. Records-page-specific filters (sort, order, disposition, dkim, spf, ip, headerFrom, page) are preserved within the current browser tab via sessionStorage but are not persisted to the DB.

## 2. Decisions

| Question | Answer | Rationale |
|---|---|---|
| What goes in DB? | `window` only | Only the "I usually look at 90 days" preference is meaningful across sessions; page numbers and text searches are transient |
| URL strategy | URL is canonical truth; redirect to fill in `?window=` if absent | Consistent with existing URL behaviour; shareable links, browser back button all work |
| Nav link carry | Carry `window=` through all nav links uniformly | Simpler code; Settings/Inboxes ignore it harmlessly |
| Records filters | sessionStorage for tab lifetime | Free of server round-trips; naturally cleared when tab closes |
| Save trigger | Explicit toggle click only (debounced PATCH) | URL-driven changes (bookmarks, deep links) do not overwrite the DB pref |
| Validation | Zod on PATCH body | Fail loud with 400 on invalid input |
| Storage shape | JSON column on User | One column, zero migrations for future prefs; union of all pref fields lives in one place |

## 3. Architecture

Three layers of state with three different lifetimes:

```
┌─────────────────────────────────────────────────────────────┐
│  DB (cross-session, cross-device)                           │
│  User.preferences JSON: { "window": "90d" }                 │
└─────────────────────────────────────────────────────────────┘
                  ▲ PATCH on toggle click (debounced 400ms)
                  │ GET on SSR when URL is missing window=
                  │
┌─────────────────────────────────────────────────────────────┐
│  URL (canonical, shareable)                                 │
│  /?window=90d   /records?window=90d&dkim=fail&page=3        │
└─────────────────────────────────────────────────────────────┘
                  ▲ ToggleGroup @update writes here
                  │ Nav links carry window= forward
                  │
┌─────────────────────────────────────────────────────────────┐
│  sessionStorage (tab-scoped, records page only)             │
│  records-filters: {sort, order, disposition, dkim, …}       │
└─────────────────────────────────────────────────────────────┘
```

### Read path (fresh page-load, no `window=` in URL)

1. `GET /` arrives
2. Auth middleware (`02-auth.ts`) verifies session
3. Filter-defaults middleware (`03-filter-defaults.ts`) reads `user.preferences.window`, 302-redirects to `/?window=90d`
4. `GET /?window=90d` arrives; middleware sees `window=` present → no-op
5. Page renders with `90d` active

### Write path (user clicks a window toggle)

1. `setWindow('30d')` (from `useWindowFilter`) updates URL via `router.push`
2. Same call fires a debounced `PATCH /api/me/preferences { window: '30d' }`
3. DB updated; next fresh load shows `30d`

## 4. Data Model

```prisma
model User {
  id           Int       @id @default(autoincrement())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  preferences  String    @default("{}")   // ← NEW: JSON-encoded UserPreferences
  sessions     Session[]
}
```

Column type `String` (not `Json`) because Prisma's `Json` type is unsupported by SQLite. JSON is stringified by the server utility before write and parsed on read.

### TypeScript types

**`app/types/preferences.ts`** (new file):
```ts
export type WindowKey = '24h' | '7d' | '30d' | '90d'

export interface UserPreferences {
  window?: WindowKey
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  window: '7d',
}
```

### Migration

```sql
-- prisma/migrations/<timestamp>_add_user_preferences/migration.sql
ALTER TABLE "User" ADD COLUMN "preferences" TEXT NOT NULL DEFAULT '{}';
```

Existing users get `'{}'` and fall through to `7d` until they toggle.

## 5. Server Utilities

### `app/server/utils/preferences.ts` (new file)

```ts
import type { UserPreferences, WindowKey } from '~/types/preferences'
import { DEFAULT_PREFERENCES } from '~/types/preferences'

const VALID_WINDOWS: readonly WindowKey[] = ['24h', '7d', '30d', '90d']

export function parsePreferences(raw: string | null): Required<UserPreferences> {
  if (!raw) return { ...DEFAULT_PREFERENCES } as Required<UserPreferences>
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>
    return {
      window: VALID_WINDOWS.includes(parsed.window as WindowKey)
        ? (parsed.window as WindowKey)
        : DEFAULT_PREFERENCES.window!,
    }
  }
  catch {
    return { ...DEFAULT_PREFERENCES } as Required<UserPreferences>
  }
}
```

## 6. API Endpoints

### `GET /api/me/preferences`

**File:** `app/server/api/me/preferences.get.ts`

Returns the current user's parsed preferences. Always returns a normalized object with all keys populated.

**Response:** `{ window: '90d' }`

### `PATCH /api/me/preferences`

**File:** `app/server/api/me/preferences.patch.ts`

Merges the supplied partial preferences into the stored value. Validates input with Zod; rejects unknown `window` values with 400.

**Body:** `{ window?: WindowKey }` (partial — only supplied keys are updated)
**Response:** full updated preferences object

Zod schema:
```ts
import { z } from 'zod'

const Schema = z.object({
  window: z.enum(['24h', '7d', '30d', '90d']).optional(),
})
```

Auth: both endpoints call `requireUserSession(event)` in addition to the global `02-auth.ts` middleware (belt-and-braces).

## 7. Server Middleware

**File:** `app/server/middleware/03-filter-defaults.ts`

Runs after `02-auth.ts` (Nitro orders by filename). Only fires on authenticated `GET` requests for `/` or `/records` that lack a `window=` query param.

```
Early exits (no DB hit):
  method !== GET
  path not in { '/', '/records' }
  searchParams.has('window')    ← prevents redirect loops
```

On redirect: reads `user.preferences.window`, builds the canonical URL with `window=` appended, sends 302. DB errors are caught; on failure the middleware falls through (page renders with the `7d` hard default from `selectedWindow`'s fallback).

## 8. Client Composable

**File:** `app/composables/useWindowFilter.ts` (new file)

Consolidates the `WindowKey`, `WINDOWS`, `selectedWindow`, `timeRange`, and `setWindow` logic that is currently duplicated between `pages/index.vue` and `pages/records/index.vue`. Both pages call this composable instead.

Key behaviour:
- `selectedWindow`: computed from `route.query.window`; falls back to `'7d'`
- `timeRange`: derived from `selectedWindow` and the shared `dashboardInitTime` `useState`
- `setWindow(w)`: calls `router.push` to update URL, then fires debounced `PATCH /api/me/preferences`
- The debounced PATCH is module-scoped (not inside `setWindow`) so rapid clicking coalesces to one DB write

## 9. Layout Nav Links

**File:** `app/layouts/default.vue`

Add a `navTo(path)` helper:
```ts
function navTo(path: string) {
  const window = route.query.window
  return window ? { path, query: { window } } : path
}
```

Apply to all four nav links (Dashboard, Records, Inboxes, Settings). Inboxes and Settings ignore the param; carrying it uniformly is simpler than allowlisting.

## 10. Records sessionStorage

**File:** `app/pages/records/index.vue`

Session-storage key: `'records-filters'`

Stored shape:
```ts
interface RecordsFilters {
  sort?: 'time' | 'count'
  order?: 'asc' | 'desc'
  disposition?: string   // comma-joined values
  dkim?: string
  spf?: string
  ip?: string
  headerFrom?: string
  page?: number
}
```

**On mount:** If URL carries none of these params, read sessionStorage and `router.replace` with the stored values. `page=1` is treated as default and skipped (avoids restoring a stale page number).

**On route.query watch:** Mirror the current URL state to sessionStorage on every change. `window` is deliberately excluded from the snapshot (DB owns it).

**Precedence:** URL > sessionStorage > defaults.

**Resilience:** sessionStorage access is wrapped in try/catch; unavailability (private mode, quota exceeded) silently skips restore.

## 11. Edge Cases

| Scenario | Behavior |
|---|---|
| New user, no pref row yet | `parsePreferences('{}')` → `{ window: '7d' }` |
| Corrupted JSON in DB | Parser catches error, returns default |
| Unknown `window` value in DB (e.g. `'2y'`) | Validator strips it, returns default |
| PATCH with invalid `window` | Zod throws 400 |
| DB read fails in middleware | Falls through; page renders with `selectedWindow` fallback `7d` |
| Bookmark `/?window=24h` with `90d` in DB | Middleware no-ops (param present); `24h` used for that view |
| sessionStorage unavailable | try/catch swallows error; restore skipped |
| Two tabs with different windows | Last PATCH wins in DB; sessionStorage is per-tab |

## 12. Files Created / Modified

### New files
- `app/types/preferences.ts`
- `app/server/utils/preferences.ts`
- `app/server/api/me/preferences.get.ts`
- `app/server/api/me/preferences.patch.ts`
- `app/server/middleware/03-filter-defaults.ts`
- `app/composables/useWindowFilter.ts`
- `prisma/migrations/<timestamp>_add_user_preferences/`
- `test/unit/preferences.test.ts`
- `test/nuxt/me-preferences.test.ts`

### Modified files
- `prisma/schema.prisma` — add `preferences String @default("{}")` to `User`
- `app/layouts/default.vue` — add `navTo()` helper, update all four `<NuxtLink>` `to` props
- `app/pages/index.vue` — replace inline `WindowKey`/`WINDOWS`/`setWindow` with `useWindowFilter()`
- `app/pages/records/index.vue` — replace inline `WindowKey`/`WINDOWS`/`setWindow` with `useWindowFilter()`; add sessionStorage mount/watch

## 13. Test Plan

### Unit (`test/unit/preferences.test.ts`)
- `parsePreferences(null)` → default
- `parsePreferences('{}')` → default
- `parsePreferences('{"window":"90d"}')` → `{ window: '90d' }`
- `parsePreferences('{"window":"2y"}')` → default
- `parsePreferences('not json')` → default

### Nuxt integration (`test/nuxt/me-preferences.test.ts`)
- `GET /api/me/preferences` → stored pref for authenticated user
- `PATCH /api/me/preferences` valid payload → DB updated, new value returned
- `PATCH /api/me/preferences` invalid `window` → 400
- `PATCH /api/me/preferences` unauthenticated → 401
- Middleware: `GET /` no `window`, user has `90d` → 302 to `/?window=90d`
- Middleware: `GET /?window=24h` → no redirect

### E2E (`tests/`)
- Click `90d` on Dashboard → navigate to Records → Records opens with `?window=90d`
- Click `90d` on Dashboard → reload → `?window=90d` persists
- Apply `dkim=fail` + `sort=count` on Records → navigate to Dashboard → navigate back → filters restored
