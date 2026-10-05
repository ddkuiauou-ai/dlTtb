import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.FEED_TEST_BASE_URL ?? 'http://127.0.0.1:5005',
    viewport: { width: 1440, height: 983 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : undefined,
  },
  // A supplied URL is an externally managed server (including isolated regression builds).
  webServer: process.env.FEED_TEST_BASE_URL ? undefined : {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:5005/test-feed',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
