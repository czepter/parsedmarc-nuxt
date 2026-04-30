# M2 — Auth & Setup Flow: Design Spec

**Date:** 2026-04-30
**Milestone:** M2 (see `docs/ROADMAP.md`)
**Status:** Approved — ready for implementation planning

---

## Goal

A fresh deployment routes a first visitor through operator account creation and gates everything else behind login. Subsequent visits are gated by a signed session cookie. No UI beyond login, setup, and a dashboard placeholder.

---

## Approach: Sealed cookie sessions via nuxt-auth-utils

`nuxt-auth-utils` stores a sealed, HMAC-signed payload in the session cookie using `NUXT_SESSION_PASSWORD`. No database round-trip on each request — the cookie is self-contained. The `Session` DB table (already in schema) is intentionally unused at M2; it is a forward-compat placeholder for a future "revoke all sessions" feature.

Password hashing: `@node-rs/bcrypt` (Rust-backed, one native dep, well-known to security auditors). Already patterns-compatible with the existing `pnpm-workspace.yaml` native-dep allowlist.

Rate limiting: in-memory `Map<ip, number[]>` of attempt timestamps inside a Nitro server middleware. Appropriate for single-node deployment. No external package needed.

---

## Session Shape

```ts
// Placed in app/types/auth.d.ts (or app/server/utils/session.ts)
declare module '#auth-utils' {
  interface UserSession {
    userId: number
    email: string
  }
}
```

---

## Section 1 — Server Layer

### New dependency

```bash
pnpm add @node-rs/bcrypt
```

Add `@node-rs/bcrypt` to the `onlyBuiltDependencies` allowlist in `pnpm-workspace.yaml` (same pattern as `better-sqlite3`).

### Server Routes

One HTTP verb per file (Nuxt convention):

| File | Method | What it does |
|------|--------|-------------|
| `app/server/api/auth/setup.post.ts` | POST | Validates email + password (min 12 chars). If a `User` already exists → 403. Hashes password with `bcrypt.hash`, creates `User` row, calls `setUserSession({ userId, email })`, returns redirect to `/`. |
| `app/server/api/auth/login.post.ts` | POST | Checks in-memory rate limit (see middleware). Loads `User` by email. `bcrypt.compare`. On match, `setUserSession`. On mismatch, generic "Invalid email or password" 401. Redirects to `/` on success. |
| `app/server/api/auth/logout.post.ts` | POST | `clearUserSession(event)`. Redirects to `/login`. |
| `app/server/api/health.get.ts` | GET | Returns `{ status: "ok", db: boolean, mmdb: boolean }`. `db`: attempt `prisma.$queryRaw\`SELECT 1\`` — true if no throw. `mmdb`: `fs.existsSync(path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb'))`. Always 200. |
| `app/server/api/auth/setup-status.get.ts` | GET | Returns `{ exists: boolean }` — `true` if any `User` row exists. Used by `setup.vue` to decide whether to redirect. No auth required. |

### Server Middleware

Applied in declaration order. Two files:

**`app/server/middleware/rate-limit.ts`**
- Intercepts `POST /api/auth/login` only (all other paths pass through immediately).
- In-memory store: `Map<string, number[]>` keyed by client IP (`getRequestIP(event, { xForwardedFor: true })`).
- Window: 5 minutes (300 000 ms). Limit: 5 attempts.
- On breach: throw `createError({ statusCode: 429, statusMessage: "Too many attempts" })` with `Retry-After` header set to seconds remaining until oldest attempt expires.
- Cleanup: prune expired timestamps on each check (no background timer needed).

**`app/server/middleware/auth.ts`**
- Bypass list (exact prefix match): `/setup`, `/login`, `/api/auth/`, `/api/health`, `/_nuxt/`, `/__nuxt_error`.
- For all other paths: call `getUserSession(event)`.
  - No session + API path (`/api/`) → `createError({ statusCode: 401 })`.
  - No session + page path → `sendRedirect(event, '/login', 302)`.
- Does NOT redirect to `/setup` — that logic lives in the `/` page's `definePageMeta` server-side check.

---

## Section 2 — Pages

**`app/app.vue`**
Replace the M1 smoke-test `<Button>` with `<NuxtPage />` so file-based routing is active. Keep `<NuxtRouteAnnouncer />`.

**`app/pages/setup.vue`**
- Server-side guard via `useAsyncData(() => $fetch('/api/auth/setup-status'))`: if `exists === true` → `navigateTo('/login', { redirectCode: 302 })`. Called before the form renders, no flash of content.
- Form: email field, password field (min 12 chars), "Create account" `<Button>`.
- On submit: `POST /api/auth/setup`. On success the server redirects to `/`; on error surface the returned message inline.
- No "already have an account?" link — this page is one-time use.

**`app/pages/login.vue`**
- Form: email field, password field, "Sign in" `<Button>`.
- Error display: always generic "Invalid email or password" (never reveals which field failed).
- Rate-limit error: "Too many attempts — try again in N minutes" (parse `Retry-After` from response header).
- No redirect if already logged in at M2 (low priority, added in polish pass).

**`app/pages/index.vue`**
- Authenticated by server middleware (no extra guard needed in the page itself).
- Renders: site heading, operator email from `useUserSession().user.email`, "Sign out" `<form method="POST" action="/api/auth/logout">` button.
- This is the M2 placeholder; M6 replaces the body without touching the shell.

**shadcn components to add** (via `pnpm dlx shadcn-vue add`):
- `input` — email and password fields
- `card` — centered form container
- `label` — accessible form labels
- `form` — validation wrapper (uses vee-validate under the hood)

**Layout**: centered card, `max-w-sm`, consistent with the existing `app.vue` background style.

---

## Section 3 — Testing

### Playwright e2e — `tests/auth.spec.ts`

Sequential scenario (shares browser state):

1. `GET /` with empty DB → assert URL is `/setup`.
2. Submit setup form (valid email + 12-char password) → assert URL is `/`.
3. Assert page contains "dashboard" text (the placeholder heading).
4. Click / submit sign-out form → assert URL is `/login`.
5. Submit login form with same credentials → assert URL is `/`.
6. `GET /setup` (same authenticated session) → assert redirect to `/login`.

**DB reset between test runs**: `app/server/api/test/reset.delete.ts` always exists as a file but opens with `if (process.env.NODE_ENV !== 'test') throw createError({ statusCode: 404 })`. When in test mode, truncates the `User` table via Prisma (`deleteMany({})`). The Playwright `beforeEach` (or a `beforeAll`) calls `request.delete('/api/test/reset')` before the suite. The `playwright.config.ts` `webServer` command already sets `NODE_ENV=test` implicitly via `pnpm dev` — if not, prepend `NODE_ENV=test` to the command.

### Vitest unit tests — `test/unit/auth/`

**`rate-limit.test.ts`**
- Extracts the core rate-limit logic into a pure function `checkRateLimit(store, ip, now)` that the middleware calls.
- Tests: 5 calls within window → all allowed; 6th → throws 429; after window expires → allowed again (use `vi.setSystemTime`).

**`password.test.ts`**
- `bcrypt.hash` → `bcrypt.compare` roundtrip returns `true`.
- `bcrypt.compare` with wrong password returns `false`.
- Two assertions, documents the library is wired correctly.

---

## File Change Summary

| File | Action |
|------|--------|
| `pnpm-workspace.yaml` | Add `@node-rs/bcrypt` to `onlyBuiltDependencies` |
| `package.json` | Add `@node-rs/bcrypt` dep |
| `app/types/auth.d.ts` | `UserSession` type augmentation |
| `app/app.vue` | Replace `<Button>` smoke test with `<NuxtPage />` |
| `app/pages/index.vue` | Dashboard placeholder (heading + sign-out) |
| `app/pages/setup.vue` | First-run operator creation form |
| `app/pages/login.vue` | Login form |
| `app/server/api/auth/setup.post.ts` | Create operator, set session |
| `app/server/api/auth/login.post.ts` | Verify credentials, set session |
| `app/server/api/auth/logout.post.ts` | Clear session |
| `app/server/api/health.get.ts` | Health check endpoint |
| `app/server/middleware/rate-limit.ts` | In-memory login rate limiter |
| `app/server/middleware/auth.ts` | Session guard for all routes |
| `app/components/ui/input/` | Added by shadcn-vue add |
| `app/components/ui/card/` | Added by shadcn-vue add |
| `app/components/ui/label/` | Added by shadcn-vue add |
| `app/components/ui/form/` | Added by shadcn-vue add |
| `app/server/api/auth/setup-status.get.ts` | Returns `{ exists: boolean }` for setup guard |
| `app/server/api/test/reset.delete.ts` | Test-only DB reset (guards with NODE_ENV check) |
| `test/unit/auth/rate-limit.test.ts` | Rate limit logic unit tests |
| `test/unit/auth/password.test.ts` | bcrypt roundtrip unit tests |
| `tests/auth.spec.ts` | Playwright: setup → logout → login flow |

---

## What This Does NOT Include

- Session DB table usage (forward-compat placeholder only)
- "Forgot password" flow (post-v1)
- Multi-user / read-only viewer accounts (post-v1)
- `nuxt-auth-utils` OAuth providers (not needed for self-hosted single-operator)
- Any dashboard content (M6)
- Dark mode toggle (M9)

---

## Exit Verification

After implementation, all M2 roadmap criteria must pass:

```bash
pnpm test              # Vitest: rate-limit + password unit tests pass
pnpm test:e2e          # Playwright: auth.spec.ts passes (setup→logout→login)
pnpm dev               # Server starts; GET / redirects to /setup on fresh DB
```
