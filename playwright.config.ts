import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: { command: 'npm run dev', port: 3000, reuseExistingServer: true, timeout: 120000 },
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'ko-KR',
    userAgent: 'playwright-e2e-tester',
    extraHTTPHeaders: {
      'x-playwright-test': 'true',
    },
  },
});
