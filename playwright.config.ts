import { defineConfig } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: './e2e',

  /* 프로젝트: 인증 셋업 → 인증 필요 테스트 + 비인증 테스트 분리 */
  projects: [
    // 인증 셋업 (로그인 → storageState 저장)
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    // 인증 필요 테스트 (딜카드 생성, IM 생성 등)
    {
      name: 'authenticated',
      testMatch: /.*\.auth\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        storageState: path.resolve(__dirname, 'e2e/.auth/user.json'),
      },
    },
    // 비인증 테스트 (뷰어, 반응형, 기존 테스트)
    {
      name: 'default',
      testIgnore: [/auth\.setup\.ts/, /.*\.auth\.spec\.ts/],
    },
  ],

  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'ko-KR',
    userAgent: 'playwright-e2e-tester',
    extraHTTPHeaders: {
      'x-playwright-test': 'true',
    },
  },
});
