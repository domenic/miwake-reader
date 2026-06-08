import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;
const ciServerURL = 'http://localhost:4173';
const localServerURL =
  /Local:\s+(?<playwright_test_base_url>http:\/\/(?:localhost|127\.0\.0\.1):\d+\/)/;

export default defineConfig({
  testDir: 'tests/integration',
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  outputDir: 'tests/integration/test-results',
  reporter: isCI
    ? [['html', { outputFolder: 'tests/integration/playwright-report' }], ['github']]
    : 'list',
  use: {
    baseURL: isCI ? ciServerURL : undefined,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  },
  webServer: isCI
    ? {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: ciServerURL,
        reuseExistingServer: false
      }
    : {
        command: 'npm run dev',
        wait: {
          stdout: localServerURL,
          stderr: localServerURL
        },
        reuseExistingServer: false
      }
});
