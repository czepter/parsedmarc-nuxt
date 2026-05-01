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
  // Wait for Vue hydration so @submit.prevent handlers are active before we interact.
  await page.waitForLoadState('networkidle')

  // 2. Setup form creates the operator account
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/', { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // 3. Sign out
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/login')

  // 4. Login with the same credentials — wait for hydration before interacting
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(TEST_EMAIL)
  await page.getByLabel('Password').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/', { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  // 5. /setup redirects to /login when a user already exists
  await page.goto('/setup')
  await expect(page).toHaveURL('/login')
})
