# M2 — Auth & Setup Flow: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the entire app behind session-cookie auth: first visit routes to `/setup` (first-time account creation), subsequent visits to `/login`, and passing a valid session grants access to the dashboard.

**Architecture:** `nuxt-auth-utils` sealed cookie sessions (no DB round-trip per request). `@node-rs/bcrypt` for password hashing. A pure `checkRateLimit()` utility (testable without server context) is called by a Nitro server middleware that guards `POST /api/auth/login`. A second middleware enforces session presence on every non-bypass route. Six server API routes + three pages + updated `app.vue`.

**Tech Stack:** Nuxt 4, nuxt-auth-utils ^0.5, @node-rs/bcrypt, Prisma (User model), shadcn-vue (Input, Card, Label), Vitest (unit), Playwright (e2e)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `pnpm-workspace.yaml` | Modify | Allow `@node-rs/bcrypt` native build |
| `vitest.config.ts` | Modify | Widen unit include glob to `test/unit/**/*.{test,spec}.ts` |
| `app/types/auth.d.ts` | Create | `UserSession` type augmentation for nuxt-auth-utils |
| `app/server/utils/rate-limit.ts` | Create | Pure `checkRateLimit()` function + `loginAttempts` singleton Map |
| `app/server/middleware/rate-limit.ts` | Create | Intercepts `POST /api/auth/login`, calls `checkRateLimit`, sets `Retry-After` |
| `app/server/middleware/auth.ts` | Create | Session guard — redirect pages, 401 APIs |
| `app/server/api/auth/setup-status.get.ts` | Create | `{ exists: boolean }` — no auth required, used by setup.vue guard |
| `app/server/api/auth/setup.post.ts` | Create | Hash + create User, set session |
| `app/server/api/auth/login.post.ts` | Create | Verify credentials, set session |
| `app/server/api/auth/logout.post.ts` | Create | Clear session |
| `app/server/api/health.get.ts` | Create | `{ status, db, mmdb }` — public endpoint |
| `app/server/api/test/reset.delete.ts` | Create | Truncate User table; blocked in `NODE_ENV=production` |
| `app/app.vue` | Modify | Replace smoke-test Button with `<NuxtPage />` |
| `app/pages/index.vue` | Create | Dashboard placeholder + sign-out button |
| `app/pages/setup.vue` | Create | First-run operator creation form |
| `app/pages/login.vue` | Create | Login form with error display |
| `app/components/ui/input/` | Install | shadcn Input |
| `app/components/ui/card/` | Install | shadcn Card + sub-components |
| `app/components/ui/label/` | Install | shadcn Label |
| `test/unit/auth/rate-limit.test.ts` | Create | Tests for `checkRateLimit` (fake timers) |
| `test/unit/auth/password.test.ts` | Create | bcrypt hash/compare roundtrip |
| `tests/smoke.spec.ts` | Modify | Point at `/api/health` instead of the M1 Button |
| `tests/auth.spec.ts` | Create | Full flow: setup → logout → login → setup-redirect |

---

## Task 1: Install @node-rs/bcrypt + update configs

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `vitest.config.ts`
- Modify: `package.json` (via pnpm add)

- [ ] **Step 1.1 — Add @node-rs/bcrypt to onlyBuiltDependencies**

Open `pnpm-workspace.yaml`. Add `'@node-rs/bcrypt'` to the list:

```yaml
onlyBuiltDependencies:
  - '@node-rs/bcrypt'
  - '@parcel/watcher'
  - '@prisma/client'
  - better-sqlite3
  - esbuild
  - vue-demi
```

- [ ] **Step 1.2 — Install the package**

```bash
pnpm add @node-rs/bcrypt
```

Expected: `package.json` now has `"@node-rs/bcrypt"` in `dependencies`.

- [ ] **Step 1.3 — Verify installation**

```bash
node -e "const { hash } = require('@node-rs/bcrypt'); hash('test', 10).then(h => console.log('bcrypt ok:', h.startsWith('\$2')))"
```

Expected output: `bcrypt ok: true`

- [ ] **Step 1.4 — Widen Vitest unit glob to support subdirectories**

In `vitest.config.ts`, change the `include` pattern for the `unit` project:

```ts
// Before:
include: ['test/unit/*.{test,spec}.ts'],

// After:
include: ['test/unit/**/*.{test,spec}.ts'],
```

- [ ] **Step 1.5 — Verify existing placeholder test still passes**

```bash
pnpm test:unit
```

Expected: `1 passed`.

- [ ] **Step 1.6 — Commit**

```bash
git add pnpm-workspace.yaml vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat: install @node-rs/bcrypt; widen vitest unit glob for subdirs"
```

---

## Task 2: Rate-limit utility + unit tests (TDD)

**Files:**
- Create: `app/server/utils/rate-limit.ts`
- Create: `test/unit/auth/rate-limit.test.ts`

- [ ] **Step 2.1 — Create the test file first**

Create `test/unit/auth/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX } from '../../../app/server/utils/rate-limit'

describe('checkRateLimit', () => {
  let store: Map<string, number[]>
  const IP = '1.2.3.4'

  beforeEach(() => {
    store = new Map()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to RATE_LIMIT_MAX attempts within the window', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const result = checkRateLimit(store, IP, Date.now())
      expect(result.blocked).toBe(false)
    }
  })

  it('blocks on the attempt after RATE_LIMIT_MAX', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimit(store, IP, Date.now())
    }
    const result = checkRateLimit(store, IP, Date.now())
    expect(result.blocked).toBe(true)
    if (result.blocked) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0)
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(RATE_LIMIT_WINDOW_MS / 1000)
    }
  })

  it('allows again after the window expires', () => {
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      checkRateLimit(store, IP, Date.now())
    }
    vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1)
    const result = checkRateLimit(store, IP, Date.now())
    expect(result.blocked).toBe(false)
  })

  it('does not block a different IP', () => {
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) {
      checkRateLimit(store, IP, Date.now())
    }
    const result = checkRateLimit(store, '5.6.7.8', Date.now())
    expect(result.blocked).toBe(false)
  })
})
```

- [ ] **Step 2.2 — Run tests to confirm they fail (module not found)**

```bash
pnpm test:unit
```

Expected: error `Cannot find module '../../../app/server/utils/rate-limit'`.

- [ ] **Step 2.3 — Create the utility**

Create `app/server/utils/rate-limit.ts`:

```ts
export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
export const RATE_LIMIT_MAX = 5

/** Singleton store — persists for the lifetime of the server process. */
export const loginAttempts = new Map<string, number[]>()

/**
 * Pure rate-limit check. Call with Date.now() as `now`.
 * Returns { blocked: false } if the attempt is allowed (and records it).
 * Returns { blocked: true, retryAfterSeconds } if the limit is exceeded.
 * Does NOT throw — the caller (middleware) is responsible for throwing.
 */
export function checkRateLimit(
  store: Map<string, number[]>,
  ip: string,
  now: number,
): { blocked: false } | { blocked: true; retryAfterSeconds: number } {
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recent = (store.get(ip) ?? []).filter(t => t > windowStart)

  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = Math.min(...recent)
    const retryAfterMs = oldest + RATE_LIMIT_WINDOW_MS - now
    return { blocked: true, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
  }

  recent.push(now)
  store.set(ip, recent)
  return { blocked: false }
}
```

- [ ] **Step 2.4 — Run tests to confirm they pass**

```bash
pnpm test:unit
```

Expected: `4 passed` (the 4 rate-limit tests + 1 placeholder).

- [ ] **Step 2.5 — Commit**

```bash
git add app/server/utils/rate-limit.ts test/unit/auth/rate-limit.test.ts
git commit -m "feat: add checkRateLimit utility with unit tests (TDD)"
```

---

## Task 3: bcrypt roundtrip unit test

**Files:**
- Create: `test/unit/auth/password.test.ts`

- [ ] **Step 3.1 — Create the test file**

Create `test/unit/auth/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hash, compare } from '@node-rs/bcrypt'

describe('bcrypt', () => {
  it('hash + compare roundtrip returns true for correct password', async () => {
    const hashed = await hash('super-secret-passw0rd', 10)
    expect(await compare('super-secret-passw0rd', hashed)).toBe(true)
  })

  it('compare returns false for wrong password', async () => {
    const hashed = await hash('correct-passw0rd', 10)
    expect(await compare('wrong-passw0rd', hashed)).toBe(false)
  })
})
```

- [ ] **Step 3.2 — Run tests to confirm they pass**

```bash
pnpm test:unit
```

Expected: `6 passed` (2 bcrypt + 4 rate-limit + 1 placeholder).

- [ ] **Step 3.3 — Commit**

```bash
git add test/unit/auth/password.test.ts
git commit -m "test: add bcrypt roundtrip unit tests"
```

---

## Task 4: Session type augmentation + shadcn components

**Files:**
- Create: `app/types/auth.d.ts`
- Install: `app/components/ui/input/`, `app/components/ui/card/`, `app/components/ui/label/`

- [ ] **Step 4.1 — Create the type augmentation file**

Create `app/types/auth.d.ts`:

```ts
declare module '#auth-utils' {
  interface UserSession {
    userId: number
    email: string
  }
}

export {}
```

The `export {}` makes TypeScript treat the file as a module (required for `declare module` to work correctly in a project with `"moduleResolution": "bundler"`).

- [ ] **Step 4.2 — Install shadcn Input, Card, and Label components**

```bash
pnpm dlx shadcn-vue@latest add input card label -y
```

Expected: creates files under `app/components/ui/input/`, `app/components/ui/card/`, `app/components/ui/label/`.

- [ ] **Step 4.3 — Verify component files exist**

```bash
ls app/components/ui/input/ && ls app/components/ui/card/ && ls app/components/ui/label/
```

Expected: at least one `.vue` file in each directory.

- [ ] **Step 4.4 — Check and remove any Google Fonts import that shadcn-vue may have re-added**

```bash
head -3 app/assets/css/tailwind.css
```

If the first line contains `@import url("https://fonts.googleapis.com/...`)`, remove it:

```bash
# Only run this if the google fonts line was re-added:
# Edit app/assets/css/tailwind.css — delete line 1 (the @import url(...fonts.googleapis...) line)
# The file must start with @import "tailwindcss"
```

- [ ] **Step 4.5 — Commit**

```bash
git add app/types/auth.d.ts app/components/ui/
git commit -m "feat: add UserSession type augmentation and shadcn Input/Card/Label"
```

---

## Task 5: Server middleware

**Files:**
- Create: `app/server/middleware/rate-limit.ts`
- Create: `app/server/middleware/auth.ts`

- [ ] **Step 5.1 — Create the rate-limit middleware**

Create `app/server/middleware/rate-limit.ts`:

```ts
// H3 functions (defineEventHandler, getMethod, getRequestURL, getRequestIP,
// createError, setResponseHeader) are auto-imported by Nuxt — no import needed.
import { checkRateLimit, loginAttempts } from '../utils/rate-limit'

export default defineEventHandler((event) => {
  if (
    getMethod(event) !== 'POST' ||
    getRequestURL(event).pathname !== '/api/auth/login'
  ) {
    return
  }

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? '127.0.0.1'
  const result = checkRateLimit(loginAttempts, ip, Date.now())

  if (result.blocked) {
    setResponseHeader(event, 'Retry-After', String(result.retryAfterSeconds))
    throw createError({
      statusCode: 429,
      statusMessage: `Too many attempts. Try again in ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`,
    })
  }
})
```

- [ ] **Step 5.2 — Create the auth guard middleware**

Create `app/server/middleware/auth.ts`:

```ts
// H3 functions (defineEventHandler, getRequestURL, sendRedirect, createError)
// and nuxt-auth-utils (getUserSession) are auto-imported by Nuxt — no imports needed.

const BYPASS_PREFIXES = [
  '/setup',
  '/login',
  '/api/auth/',
  '/api/health',
  '/api/test/',
  '/_nuxt/',
  '/__nuxt_error',
  '/favicon.ico',
  '/robots.txt',
]

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (BYPASS_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return
  }

  const session = await getUserSession(event)

  if (!session.user) {
    if (path.startsWith('/api/')) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
    return sendRedirect(event, '/login', 302)
  }
})
```

- [ ] **Step 5.3 — Smoke-test: start the dev server and confirm it boots**

```bash
pnpm dev
```

Expected: server starts without import errors. Stop with Ctrl+C.

- [ ] **Step 5.4 — Commit**

```bash
git add app/server/middleware/rate-limit.ts app/server/middleware/auth.ts
git commit -m "feat: add rate-limit and auth server middlewares"
```

---

## Task 6: Server routes

**Files:**
- Create: `app/server/api/auth/setup-status.get.ts`
- Create: `app/server/api/auth/setup.post.ts`
- Create: `app/server/api/auth/login.post.ts`
- Create: `app/server/api/auth/logout.post.ts`
- Create: `app/server/api/health.get.ts`
- Create: `app/server/api/test/reset.delete.ts`

- [ ] **Step 6.1 — Create setup-status route**

Create `app/server/api/auth/setup-status.get.ts`:

```ts
import prisma from '~~/lib/prisma'

export default defineEventHandler(async () => {
  const count = await prisma.user.count()
  return { exists: count > 0 }
})
```

- [ ] **Step 6.2 — Create setup route**

Create `app/server/api/auth/setup.post.ts`:

```ts
import { hash } from '@node-rs/bcrypt'
import prisma from '~~/lib/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)

  if (!body.email || !body.email.includes('@')) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required' })
  }
  if (!body.password || body.password.length < 12) {
    throw createError({ statusCode: 400, statusMessage: 'Password must be at least 12 characters' })
  }

  const existing = await prisma.user.findFirst()
  if (existing) {
    throw createError({ statusCode: 403, statusMessage: 'Setup already complete' })
  }

  const passwordHash = await hash(body.password, 10)
  const user = await prisma.user.create({
    data: { email: body.email, passwordHash },
  })

  await setUserSession(event, { userId: user.id, email: user.email })
  return { ok: true }
})
```

- [ ] **Step 6.3 — Create login route**

Create `app/server/api/auth/login.post.ts`:

```ts
import { compare } from '@node-rs/bcrypt'
import prisma from '~~/lib/prisma'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event)

  if (!body.email || !body.password) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const user = await prisma.user.findUnique({ where: { email: body.email } })
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const valid = await compare(body.password, user.passwordHash)
  if (!valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  await setUserSession(event, { userId: user.id, email: user.email })
  return { ok: true }
})
```

- [ ] **Step 6.4 — Create logout route**

Create `app/server/api/auth/logout.post.ts`:

```ts
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
```

- [ ] **Step 6.5 — Create health route**

Create `app/server/api/health.get.ts`:

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import prisma from '~~/lib/prisma'

export default defineEventHandler(async () => {
  let db = false
  try {
    await prisma.$queryRaw`SELECT 1`
    db = true
  }
  catch {}

  const mmdb = existsSync(join(process.cwd(), 'data', 'GeoLite2-City.mmdb'))

  return { status: 'ok' as const, db, mmdb }
})
```

- [ ] **Step 6.6 — Create test reset route**

Create `app/server/api/test/reset.delete.ts`:

```ts
import prisma from '~~/lib/prisma'

export default defineEventHandler(async () => {
  // Only allow this in non-production environments.
  // In production NODE_ENV=production; this returns 404.
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404 })
  }
  await prisma.user.deleteMany()
  return { ok: true }
})
```

- [ ] **Step 6.7 — Verify all routes are reachable**

Start `pnpm dev`, then in a second terminal:

```bash
curl -s http://localhost:3000/api/health | python3 -m json.tool
```

Expected:
```json
{
  "status": "ok",
  "db": true,
  "mmdb": false
}
```

```bash
curl -s http://localhost:3000/api/auth/setup-status | python3 -m json.tool
```

Expected: `{ "exists": false }` (no users yet).

Stop dev server.

- [ ] **Step 6.8 — Commit**

```bash
git add app/server/api/
git commit -m "feat: add auth, health, and test-reset server routes"
```

---

## Task 7: Pages

**Files:**
- Modify: `app/app.vue`
- Create: `app/pages/index.vue`
- Create: `app/pages/setup.vue`
- Create: `app/pages/login.vue`

- [ ] **Step 7.1 — Update app.vue to activate routing**

Replace all content of `app/app.vue`:

```vue
<template>
  <NuxtRouteAnnouncer />
  <NuxtPage />
</template>
```

- [ ] **Step 7.2 — Create the dashboard placeholder page**

Create `app/pages/index.vue`:

```vue
<script setup lang="ts">
const { user } = useUserSession()
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="w-full max-w-sm space-y-6 text-center">
      <h1 class="text-2xl font-semibold">Dashboard</h1>
      <p class="text-muted-foreground text-sm">
        Signed in as <span class="font-medium text-foreground">{{ user?.email }}</span>
      </p>
      <form method="POST" action="/api/auth/logout">
        <Button type="submit" variant="outline" class="w-full">Sign out</Button>
      </form>
    </div>
  </div>
</template>
```

- [ ] **Step 7.3 — Create the setup page**

Create `app/pages/setup.vue`:

```vue
<script setup lang="ts">
// Guard: if a user already exists, this deployment is already set up.
const { data: status } = await useAsyncData('setup-status', () =>
  $fetch<{ exists: boolean }>('/api/auth/setup-status'),
)
if (status.value?.exists) {
  await navigateTo('/login', { redirectCode: 302 })
}

const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/setup', { method: 'POST', body: form })
    await navigateTo('/')
  }
  catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } }
    error.value = err.data?.statusMessage ?? 'Something went wrong'
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create operator account</CardTitle>
        <CardDescription>
          Set up your parsedmarc-nuxt instance. This page disappears after first use.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-1.5">
            <Label for="setup-email">Email</Label>
            <Input
              id="setup-email"
              v-model="form.email"
              type="email"
              required
              autocomplete="email"
              placeholder="admin@example.com"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="setup-password">
              Password
              <span class="text-muted-foreground text-xs font-normal">(min 12 characters)</span>
            </Label>
            <Input
              id="setup-password"
              v-model="form.password"
              type="password"
              minlength="12"
              required
              autocomplete="new-password"
            />
          </div>
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
          <Button type="submit" class="w-full" :disabled="loading">
            {{ loading ? 'Creating…' : 'Create account' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 7.4 — Create the login page**

Create `app/pages/login.vue`:

```vue
<script setup lang="ts">
const form = reactive({ email: '', password: '' })
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: form })
    await navigateTo('/')
  }
  catch (e: unknown) {
    const err = e as { statusCode?: number; data?: { statusMessage?: string } }
    if (err.statusCode === 429) {
      error.value = err.data?.statusMessage ?? 'Too many attempts'
    }
    else {
      error.value = 'Invalid email or password'
    }
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <form class="space-y-4" @submit.prevent="submit">
          <div class="space-y-1.5">
            <Label for="login-email">Email</Label>
            <Input
              id="login-email"
              v-model="form.email"
              type="email"
              required
              autocomplete="email"
            />
          </div>
          <div class="space-y-1.5">
            <Label for="login-password">Password</Label>
            <Input
              id="login-password"
              v-model="form.password"
              type="password"
              required
              autocomplete="current-password"
            />
          </div>
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
          <Button type="submit" class="w-full" :disabled="loading">
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </Button>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] **Step 7.5 — Smoke-test the pages manually**

```bash
pnpm dev
```

Open `http://localhost:3000`. Expected: redirected to `/setup`. Fill in email + password (≥12 chars) and submit. Expected: redirected to `/`, shows Dashboard heading and email. Click Sign out. Expected: redirected to `/login`. Sign in with same credentials. Expected: back at `/`.

Stop dev server.

- [ ] **Step 7.6 — Commit**

```bash
git add app/app.vue app/pages/
git commit -m "feat: add setup, login, and dashboard placeholder pages"
```

---

## Task 8: E2e tests

**Files:**
- Modify: `tests/smoke.spec.ts`
- Create: `tests/auth.spec.ts`

- [ ] **Step 8.1 — Update smoke.spec.ts to use /api/health**

Replace the entire content of `tests/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('health endpoint is reachable and returns ok', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.status).toBe('ok')
  expect(typeof body.db).toBe('boolean')
})
```

- [ ] **Step 8.2 — Create the auth e2e spec**

Create `tests/auth.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const TEST_EMAIL = 'e2e-admin@example.com'
const TEST_PASSWORD = 'e2eSecretPass123'

test('full auth flow: setup → dashboard → logout → login', async ({ page, request }) => {
  // Reset the DB so this test always starts from a clean slate.
  const reset = await request.delete('/api/test/reset')
  expect(reset.status()).toBe(200)

  // 1. Fresh server with no users → / redirects to /setup
  await page.goto('/')
  await expect(page).toHaveURL('/setup')

  // 2. Setup form creates the operator account
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // 3. Sign out
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/login')

  // 4. Login with the same credentials
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // 5. /setup redirects to /login when a user already exists
  await page.goto('/setup')
  await expect(page).toHaveURL('/login')
})
```

- [ ] **Step 8.3 — Run the e2e suite**

```bash
pnpm test:e2e
```

Expected: 2 tests pass (`health endpoint` + `full auth flow`).

If the auth flow test fails because the test reset route returns 404, confirm `NODE_ENV` is not `production` when `pnpm dev` runs (it shouldn't be — dev mode uses `development`).

- [ ] **Step 8.4 — Commit**

```bash
git add tests/smoke.spec.ts tests/auth.spec.ts
git commit -m "test: update smoke spec; add Playwright auth e2e (setup→logout→login)"
```

---

## Task 9: Final verification + ROADMAP update

- [ ] **Step 9.1 — Run the full Vitest suite**

```bash
pnpm test
```

Expected: all pass (unit: rate-limit ×4, bcrypt ×2, placeholder ×1 = 7 total; nuxt: 0 tests, acceptable).

- [ ] **Step 9.2 — Run the full Playwright suite**

```bash
pnpm test:e2e
```

Expected: 2 tests pass.

- [ ] **Step 9.3 — Verify M2 exit criteria manually**

```bash
# nuxt-auth-utils session cookie configured
grep -r "setUserSession\|getUserSession" app/server/api/ | wc -l
# Expected: ≥ 2 matches

# /setup page guards correctly
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/setup
# Start dev first; expected 200 (no users) or 302 (user exists)

# Rate limiter middleware exists
cat app/server/middleware/rate-limit.ts | grep "429"
# Expected: line with statusCode 429

# /api/health works
curl -s http://localhost:3000/api/health
# Expected: {"status":"ok","db":true,"mmdb":false}
```

- [ ] **Step 9.4 — Update ROADMAP.md M2 status**

In `docs/ROADMAP.md`, change each `- [ ]` under **M2 — Auth & Setup Flow** to `- [x]`:

```markdown
- [x] `nuxt-auth-utils` configured with session cookie + password hashing (argon2 or bcrypt)
- [x] `/setup` page renders only when no `User` rows exist
- [x] `/setup` POST creates the first operator and logs them in
- [x] `/login` page + POST handler
- [x] `/logout` POST handler
- [x] Auth middleware redirects unauthenticated requests to `/login` (except `/setup`, `/login`, `/api/health`)
- [x] Rate limiter on `/login` (5/IP/5min)
- [x] `/api/health` returns `{ status, db, mmdb }` JSON
- [x] Playwright e2e: setup → logout → login → see dashboard placeholder
```

- [ ] **Step 9.5 — Update AGENTS.md §12 status**

In `AGENTS.md`, section 12 "Development Status", change the auth line from `[ ]` to `[x]`:

```markdown
- [x] Auth: register/login pages, session middleware (`nuxt-auth-utils`)
```

- [ ] **Step 9.6 — Final commit**

```bash
git add docs/ROADMAP.md AGENTS.md
git commit -m "docs: mark M2 exit criteria as complete in ROADMAP and AGENTS"
```
