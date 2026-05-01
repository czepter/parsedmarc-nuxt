import { defineConfig, devices } from '@playwright/test'

// Use a dedicated port for the test server to avoid conflicts with the dev server
const TEST_PORT = 3001

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  webServer: {
    command: `NODE_ENV=test PORT=${TEST_PORT} pnpm dev`,
    url: `http://localhost:${TEST_PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    trace: 'on-first-retry',
    baseURL: `http://localhost:${TEST_PORT}`,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
