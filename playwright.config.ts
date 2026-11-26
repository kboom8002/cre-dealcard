import { defineConfig } from '@playwright/test';
import * as path from 'path';

// E2E 격리: E2E_PORT 를 주면 별도 포트·별도 distDir(.next/e2e-<port>, 기존 ignore 범위 내) dev 서버를 띄워
// 다른 사람이 3000 에서 돌리는 dev 서버/스펙(LLM_MODE 등 env 상이)과 섞이지 않게 한다. 미설정 시 기존 동작(3000, 재사용).
// Ring 3 운영 카나리: PLAYWRIGHT_PROD_SERVER=1 이면 dev 대신 빌드된 .next 번들을 `npx next start -p <port>`로 기동한다.
export interface ResolvedPlaywrightServerPlan {
  e2ePort: number;
  isolated: boolean;
  isProdServer: boolean;
  isProdSmoke: boolean;
  skipWebServer: boolean;
  resolvedBaseUrl: string | undefined;
  webServer?: {
    command: string;
    port: number;
    reuseExistingServer: boolean;
    timeout: number;
    env?: Record<string, string>;
  };
}

export function resolvePlaywrightServerPlan(
  env: Record<string, string | undefined> = process.env,
): ResolvedPlaywrightServerPlan {
  const e2ePort = Number(env.E2E_PORT || 3000);
  const isolated = e2ePort !== 3000;
  const isProdServer = env.PLAYWRIGHT_PROD_SERVER === '1';
  const isProdSmoke = env.PROD_SMOKE === '1';
  const explicitBaseUrl = (env.PLAYWRIGHT_BASE_URL || '').trim();
  const skipWebServer = isProdSmoke || Boolean(explicitBaseUrl);
  const resolvedBaseUrl = isProdSmoke
    ? undefined
    : explicitBaseUrl || `http://localhost:${e2ePort}`;

  if (skipWebServer) {
    return {
      e2ePort,
      isolated,
      isProdServer,
      isProdSmoke,
      skipWebServer,
      resolvedBaseUrl,
    };
  }

  const command = isProdServer
    ? `npx next start -p ${e2ePort}`
    : isolated
      ? `npx next dev -p ${e2ePort}`
      : 'npm run dev';

  const reuseExistingServer =
    isProdServer || env.CRE_ENFORCE_QA_GATE === '1' ? false : true;

  const serverEnv: Record<string, string> = {
    ...(isolated && !isProdServer ? { NEXT_DIST_DIR: `.next/e2e-${e2ePort}` } : {}),
    ...(isProdServer && env.NEXT_DIST_DIR ? { NEXT_DIST_DIR: env.NEXT_DIST_DIR } : {}),
    ...(env.CRE_ENFORCE_QA_GATE ? { CRE_ENFORCE_QA_GATE: env.CRE_ENFORCE_QA_GATE } : {}),
    ...(env.QA_ACCESS_KEY ? { QA_ACCESS_KEY: env.QA_ACCESS_KEY } : {}),
  };

  return {
    e2ePort,
    isolated,
    isProdServer,
    isProdSmoke,
    skipWebServer,
    resolvedBaseUrl,
    webServer: {
      command,
      port: e2ePort,
      reuseExistingServer,
      timeout: 120000,
      ...(Object.keys(serverEnv).length > 0 ? { env: serverEnv } : {}),
    },
  };
}

const E2E_PORT = Number(process.env.E2E_PORT || 3000);
const ISOLATED = E2E_PORT !== 3000;
const IS_PROD_SERVER = process.env.PLAYWRIGHT_PROD_SERVER === '1';
const IS_PROD_SMOKE = process.env.PROD_SMOKE === '1';
const PROD_SMOKE_BASE_URL = process.env.PROD_SMOKE_BASE_URL || 'https://www.credeal.net';
const EXPLICIT_BASE_URL = (process.env.PLAYWRIGHT_BASE_URL || '').trim();
const SKIP_WEBSERVER = IS_PROD_SMOKE || Boolean(EXPLICIT_BASE_URL);
const RESOLVED_BASE_URL = IS_PROD_SMOKE
  ? undefined
  : EXPLICIT_BASE_URL || `http://localhost:${E2E_PORT}`;
const SERVER_PLAN = resolvePlaywrightServerPlan(process.env);
void ISOLATED;
void IS_PROD_SERVER;
void SKIP_WEBSERVER;

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,

  /* 프로젝트: 인증 셋업 → 인증 필요 테스트 + 비인증 테스트 + 운영 스모크 분리 */
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
      testIgnore: [/auth\.setup\.ts/, /.*\.auth\.spec\.ts/, /prod-smoke\.spec\.ts/],
    },
    // 운영 사이트 읽기 위주 스모크 (PROD_SMOKE=1 일 때 명시 실행)
    {
      name: 'prod-smoke',
      testMatch: /prod-smoke\.spec\.ts/,
      use: {
        baseURL: PROD_SMOKE_BASE_URL,
      },
    },
  ],

  ...(SERVER_PLAN.webServer ? { webServer: SERVER_PLAN.webServer } : {}),
  use: {
    baseURL: RESOLVED_BASE_URL || `http://localhost:${E2E_PORT}`,
    locale: 'ko-KR',
    userAgent: 'playwright-e2e-tester',
    extraHTTPHeaders: {
      'x-playwright-test': 'true',
    },
  },
});
