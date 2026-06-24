import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Root causes of flakiness (HTMX change-event race, script-redirect timing,
  // tight timeouts) have been fixed; retries absorb the residual load-induced
  // timing variance inherent to driving a real server + browser.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: 'line',
  // E2E tests drive a real Bun server + browser over many HTMX round-trips.
  // The lifecycle tests are long monoliths, so give them generous timeouts
  // rather than letting load-induced slowness flake the suite.
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command:
      'bun scripts/e2e-reset.ts && DB_PATH=data/clickdown_test.db bun scripts/migrate.ts && E2E_TEST=true PORT=3001 DB_PATH=data/clickdown_test.db bun run src/index.tsx',
    url: 'http://localhost:3001',
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
