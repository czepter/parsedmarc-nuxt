import { test, expect } from '@playwright/test'

test('health endpoint is reachable and returns ok', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.status).toBe('ok')
  expect(typeof body.db).toBe('boolean')
})
