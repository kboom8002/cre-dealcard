/**
 * 매거진 단위테스트 전용 env 가드 (F-05, 함정 #16) + 전역 Hermetic Supabase 네트워크 가드
 *
 * 1) 기본(Hermetic) 모드(`VITEST_USE_LIVE_ENV !== '1'`)에서는 `NEXT_PUBLIC_SUPABASE_URL` 이
 *    허용된 모의 호스트(`mock.supabase.co`, `example.supabase.co`, `test.supabase.co`) 외의
 *    실제 `*.supabase.co` 호스트(특히 운영 `vwbmaulavgjwezffbxgi.supabase.co`)를 가리키면
 *    즉시 `https://mock.supabase.co` 로 스크러빙하여 운영 DB 오접속을 원천 차단한다.
 * 2) 매거진/워크스페이스 단위테스트 경로에서는 기존과 동일하게 `MAGAZINE_TEST_ENV` 더미 값을 적용한다.
 */

export const ALLOWED_MOCK_SUPABASE_HOSTS = new Set([
  'mock.supabase.co',
  'example.supabase.co',
  'test.supabase.co',
]);

export const BLOCKED_PROD_SUPABASE_HOST = 'vwbmaulavgjwezffbxgi.supabase.co';

export function isLiveSupabaseUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false;
  let hostname = '';
  try {
    hostname = new URL(rawUrl.trim()).hostname.toLowerCase();
  } catch {
    const match = rawUrl.match(/([a-z0-9.-]*supabase\.co)/i);
    hostname = match ? match[1].toLowerCase() : '';
  }
  if (!hostname) return false;
  if (hostname === BLOCKED_PROD_SUPABASE_HOST) return true;
  if (hostname === 'supabase.co' || hostname.endsWith('.supabase.co')) {
    return !ALLOWED_MOCK_SUPABASE_HOSTS.has(hostname);
  }
  return false;
}

/**
 * Hermetic 모드(`VITEST_USE_LIVE_ENV !== '1'`)에서 실서버 `*.supabase.co` URL 을
 * `https://mock.supabase.co` 로 강제 스크러빙한다.
 */
export function applyHermeticSupabaseGuard(): boolean {
  if (process.env.VITEST_USE_LIVE_ENV === '1') return false;
  const currentUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (isLiveSupabaseUrl(currentUrl)) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    return true;
  }
  return false;
}

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
  const norm = testPath.replace(/\\/g, '/');
  return (
    norm.includes('/src/tests/unit/magazine/') ||
    norm.includes('/src/tests/magazine/') ||
    norm.includes('/src/tests/workspace/')
  );
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

// 1) 전역 Hermetic 가드: 실서버 *.supabase.co 오접속 원천 차단
applyHermeticSupabaseGuard();

// 2) setupFiles 로 로드될 때 현재 테스트 파일 경로로 매거진 env 가드 자동 적용
try {
  const jestMatchers = (globalThis as Record<symbol, any>)[
    Symbol.for('$$jest-matchers-object')
  ];
  const workerPath =
    (globalThis as Record<string, any>).__vitest_worker__?.filepath ||
    jestMatchers?.state?.testPath;
  applyMagazineEnvGuard(workerPath);
} catch {
  /* vitest 밖에서 import 되면 무시 */
}
