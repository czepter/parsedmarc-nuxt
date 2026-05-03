import { test, expect } from '@playwright/test'

const TEST_EMAIL = 'prefs-admin@example.com'
const TEST_PASSWORD = 'prefsSecretPass123'

async function setupAndLogin(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never, request: Parameters<typeof test>[1] extends (args: { request: infer R }) => unknown ? R : never) {
  const reset = await request.delete('/api/test/reset')
  expect(reset.status()).toBe(200)

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/^\/$|\/\?/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

test('window preference persists across page reload', async ({ page, request }) => {
  await setupAndLogin(page, request)

  // Default redirect lands somewhere with window=7d
  await expect(page).toHaveURL(/window=7d/)

  // Click 90d
  await page.getByRole('radio', { name: '90d' }).click()
  await expect(page).toHaveURL(/window=90d/)
  await page.waitForLoadState('networkidle')

  // Reload with no window param — middleware should redirect to ?window=90d
  await page.goto('/')
  await expect(page).toHaveURL(/window=90d/, { timeout: 10000 })
})

test('window carries from Dashboard to Records via nav link', async ({ page, request }) => {
  await setupAndLogin(page, request)

  // Set 30d
  await page.getByRole('radio', { name: '30d' }).click()
  await expect(page).toHaveURL(/window=30d/)
  await page.waitForLoadState('networkidle')

  // Click the Records nav link — should carry window=30d
  await page.getByRole('link', { name: 'Records' }).click()
  await expect(page).toHaveURL(/\/records.*window=30d/, { timeout: 10000 })
})

test('window carries from Records to Dashboard via nav link', async ({ page, request }) => {
  await setupAndLogin(page, request)

  // Go directly to Records with 24h
  await page.goto('/records?window=24h')
  await page.waitForLoadState('networkidle')

  // Click Dashboard nav — should carry window=24h
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page).toHaveURL(/\/\?.*window=24h|\/\?window=24h/, { timeout: 10000 })
})

test('records-specific filters restore after a dashboard detour (sessionStorage)', async ({ page, request }) => {
  await setupAndLogin(page, request)

  // Go to records and apply a sort filter
  await page.goto('/records?window=7d&sort=count&order=desc')
  await page.waitForLoadState('networkidle')

  // Navigate to dashboard (window= carries, records filters saved to sessionStorage)
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page).toHaveURL(/window=7d/)
  await page.waitForLoadState('networkidle')

  // Navigate back to records — sort should be restored from sessionStorage
  await page.getByRole('link', { name: 'Records' }).click()
  await expect(page).toHaveURL(/sort=count/, { timeout: 10000 })
  await expect(page).toHaveURL(/order=desc/)
})

test('bookmarked window= is respected over DB preference', async ({ page, request }) => {
  await setupAndLogin(page, request)

  // Set 90d as DB pref
  await page.getByRole('radio', { name: '90d' }).click()
  await page.waitForLoadState('networkidle')

  // Open a bookmarked 24h URL — middleware no-ops (window= present)
  await page.goto('/?window=24h')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/window=24h/)
})

test('PATCH /api/me/preferences with invalid window returns 400', async ({ request }) => {
  // Authenticate first via API
  const reset = await request.delete('/api/test/reset')
  expect(reset.status()).toBe(200)

  await request.post('/api/auth/setup', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })
  await request.post('/api/auth/login', {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  })

  const res = await request.patch('/api/me/preferences', {
    data: { window: '999d' },
  })
  expect(res.status()).toBe(400)
})

test('PATCH /api/me/preferences without auth returns 401', async ({ request }) => {
  const res = await request.patch('/api/me/preferences', {
    data: { window: '7d' },
  })
  // Either 401 (API) or 302 redirect to /login — both indicate unauthenticated
  expect([401, 302]).toContain(res.status())
})
