import { defineConfig } from '@playwright/test';

const baseURL = 'http://localhost:5174';

export default defineConfig({
  testDir: 'tests/integration',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  outputDir: 'tests/integration/test-results',
  reporter: process.env.CI
    ? [['html', { outputFolder: 'tests/integration/playwright-report' }], ['github']]
    : 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  },
  webServer: {
    command: process.env.CI
      ? 'npm run preview -- --port 5174 --strictPort'
      : 'npm run dev -- --port 5174 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI
  }
});
