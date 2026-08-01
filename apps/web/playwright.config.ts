import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end and accessibility configuration.
 *
 * E2E tests are slow, so the testing strategy reserves them for journeys where a
 * break is unacceptable. This config is tuned for that: few tests, run seriously.
 *
 * No retries locally. A test that passes on retry is a flaky test, and hiding
 * that locally means discovering it in CI. CI retries once, because a genuine
 * infrastructure blip should not block a merge — but the retry count is visible.
 */
const PORT = 3100
const baseURL = `http://127.0.0.1:${String(PORT)}`
const isCI = process.env['CI'] !== undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Spread rather than assign undefined: `exactOptionalPropertyTypes` treats an
  // explicit undefined as different from an absent property, and locally we want
  // Playwright's own default worker count rather than a value we picked.
  ...(isCI ? { workers: 1 } : {}),
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile is not a reduced desktop; the design system treats it as a first
    // class layout, so it gets its own run rather than a viewport tweak.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    // Tests run against a production build. A dev-server run would measure
    // development overhead and miss anything that only breaks when built.
    command: `pnpm start --port ${String(PORT)}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
})
