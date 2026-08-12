import { defineConfig } from '@playwright/test';

// Without a UTF-8 locale, Chromium silently aliases non-ASCII OPFS directory
// names to their parent directory, breaking every sync spec:
// https://issues.chromium.org/issues/545336271
process.env.LC_ALL = 'C.UTF-8';

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
        // Playwright forces FORCE_COLOR=1 on the spawned server, and vite 8
        // then embeds ANSI escapes inside the printed URL (bold port number),
        // which the wait regex below can never match. NO_COLOR wins over
        // FORCE_COLOR in vite's color detection.
        env: { NO_COLOR: '1' },
        wait: {
          stdout: localServerURL,
          stderr: localServerURL
        },
        reuseExistingServer: false
      }
});
