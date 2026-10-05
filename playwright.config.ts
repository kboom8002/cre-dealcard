import { defineConfig } from '@playwright/test';
import * as path from 'path';

// E2E 격리: E2E_PORT 를 주면 별도 포트·별도 distDir(.next/e2e-<port>, 기존 ignore 범위 내) dev 서버를 띄워
// 다른 사람이 3000 에서 돌리는 dev 서버/스펙(LLM_MODE 등 env 상이)과 섞이지 않게 한다. 미설정 시 기존 동작(3000, 재사용).
const E2E_PORT = Number(process.env.E2E_PORT || 3000);
const ISOLATED = E2E_PORT !== 3000;

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,

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
    command: ISOLATED ? `npx next dev -p ${E2E_PORT}` : 'npm run dev',
    port: E2E_PORT,
    reuseExistingServer: true,
    timeout: 120000,
    ...(ISOLATED ? { env: { NEXT_DIST_DIR: `.next/e2e-${E2E_PORT}` } } : {}),
  },
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: 'ko-KR',
    userAgent: 'playwright-e2e-tester',
    extraHTTPHeaders: {
      'x-playwright-test': 'true',
    },
  },
});
