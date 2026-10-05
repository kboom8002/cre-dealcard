/**
 * 매거진 단위테스트 전용 env 가드 (F-05, 함정 #16)
 *
 * vitest.config.ts 는 `.env.local` 을 process.env 로 로드한다. 매거진 단위테스트가 실수로 운영
 * Supabase / OpenAI / 카카오 키로 실제 호출하지 않도록, `src/tests/unit/magazine/` 아래 테스트 파일에서만
 * 더미 값으로 덮어쓴다. 그 외 테스트(IM 등)에는 영향이 없다(no-op).
 *
 * 사용법 (선택): vitest.config.ts 의 `test.setupFiles` 에 `'src/tests/setup/magazine-env-guard.ts'` 추가.
 * 또는 매거진 테스트 상단에서 `import '../../setup/magazine-env-guard';` 로 직접 import.
 * IM 테스트가 실제 env 를 읽으므로 전역 적용(경로 무시)은 금지 — `applyMagazineEnvGuard(force)` 는 테스트용.
 */

export const MAGAZINE_TEST_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  OPENAI_API_KEY: 'test-openai-key',
  NEXT_PUBLIC_KAKAO_JS_KEY: 'test-kakao-key',
  CRON_SECRET: 'test-cron-secret',
};

export function isMagazineTestPath(testPath: string | undefined | null): boolean {
  if (!testPath) return false;
  return testPath.replace(/\\/g, '/').includes('/src/tests/unit/magazine/');
}

/** @returns 덮어쓴 키 목록 (경로가 매거진 테스트가 아니면 빈 배열) */
export function applyMagazineEnvGuard(testPath?: string | null, force = false): string[] {
  if (!force && !isMagazineTestPath(testPath)) return [];
  const applied: string[] = [];
  for (const [k, v] of Object.entries(MAGAZINE_TEST_ENV)) {
    process.env[k] = v;
    applied.push(k);
  }
  return applied;
}

// setupFiles 로 로드될 때 현재 테스트 파일 경로로 자동 적용 (vitest 전용 API 라 동적으로 접근)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { expect } = require('vitest') as typeof import('vitest');
  applyMagazineEnvGuard(expect.getState().testPath);
} catch {
  /* vitest 밖에서 import 되면 무시 */
}
