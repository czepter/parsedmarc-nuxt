import { test, expect } from '@playwright/test'

test('home page loads without error', async ({ page }) => {
  await page.goto('/')
  // Page must have a title (any non-error title)
  const title = await page.title()
  expect(title).not.toContain('Error')
  // Smoke test: the Button from app.vue should be visible
  await expect(page.getByRole('button', { name: /parsedmarc-nuxt/i })).toBeVisible()
})
