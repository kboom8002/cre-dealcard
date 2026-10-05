/**
 * P0-02 (S2-02) — proxy 소셜봇 예외 축소 단위테스트
 * UA 위조(facebookexternalhit 등)로 /broker/* 전체가 열리던 문제를 경로 화이트리스트로 차단.
 */
import { describe, it, expect, vi } from 'vitest';

// proxy.ts 가 import 하는 외부 의존(환경변수 검증·Supabase SSR)은 순수 함수 테스트에 불필요 → 격리
vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' },
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isSocialBotAllowedPath, proxy } from '@/proxy';

const FB = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const KAKAO = 'Mozilla/5.0 (compatible; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/)';

describe('isSocialBotAllowedPath — 순수 함수', () => {
  it('봇 UA + OG 경로 2종은 허용한다', () => {
    expect(isSocialBotAllowedPath('/broker/deal-card/abc-123', FB)).toBe(true);
    expect(isSocialBotAllowedPath('/broker/leasing/space-9', KAKAO)).toBe(true);
  });

  it('UA 위조로 다른 /broker/* 경로는 거부한다', () => {
    for (const p of [
      '/broker/dashboard',
      '/broker',
      '/broker/magazine-editor',
      '/broker/deal-card/x/edit',
      '/broker/deal-card',
      '/broker/deal-card/',
      '/broker/deal-card/x/y',
      '/broker/leasing',
      '/broker/leasing/s/inquiries',
      '/broker/clients/new',
    ]) {
      expect(isSocialBotAllowedPath(p, FB), p).toBe(false);
    }
  });

  it('생성 화면(new)은 봇에게도 거부한다', () => {
    expect(isSocialBotAllowedPath('/broker/deal-card/new', FB)).toBe(false);
    expect(isSocialBotAllowedPath('/broker/leasing/new', FB)).toBe(false);
    // 접두 일치 오탐 방지: newsletter 는 일반 id 로 취급(허용 경로 패턴 안)
    expect(isSocialBotAllowedPath('/broker/deal-card/newsletter', FB)).toBe(true);
  });

  it('admin 경로는 어떤 봇 UA 에도 거부한다', () => {
    expect(isSocialBotAllowedPath('/admin', FB)).toBe(false);
    expect(isSocialBotAllowedPath('/admin/deal-card/abc', FB)).toBe(false);
  });

  it('일반 브라우저·빈 UA 는 허용 경로에서도 예외 대상이 아니다', () => {
    expect(isSocialBotAllowedPath('/broker/deal-card/abc', 'Mozilla/5.0 Chrome/120')).toBe(false);
    expect(isSocialBotAllowedPath('/broker/deal-card/abc', '')).toBe(false);
  });

  it('UA 대소문자 구분 없이 매칭한다', () => {
    expect(isSocialBotAllowedPath('/broker/deal-card/abc', 'FacebookExternalHit/1.1')).toBe(true);
  });
});

describe('proxy() — 비로그인 요청 처리', () => {
  function mockAnonymous() {
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    } as unknown as ReturnType<typeof createServerClient>);
  }
  function req(path: string, ua: string, extra: Record<string, string> = {}) {
    return new NextRequest(`http://localhost:3000${path}`, { headers: { 'user-agent': ua, ...extra } });
  }

  it('facebookexternalhit 위조로 /broker/dashboard 접근 → /login 리다이렉트', async () => {
    mockAnonymous();
    const res = await proxy(req('/broker/dashboard', FB));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?redirectTo=%2Fbroker%2Fdashboard');
  });

  it('위조 UA 로 /broker/magazine-editor, /broker/deal-card/x/edit → 307', async () => {
    mockAnonymous();
    for (const p of ['/broker/magazine-editor', '/broker/deal-card/x/edit']) {
      const res = await proxy(req(p, FB));
      expect(res.status, p).toBe(307);
      expect(res.headers.get('location')).toContain('/login');
    }
  });

  it('봇 UA 로 /admin/* → 307', async () => {
    mockAnonymous();
    const res = await proxy(req('/admin/users', FB));
    expect(res.status).toBe(307);
  });

  it('봇 UA 로 OG 경로 2종은 통과(리다이렉트 아님)', async () => {
    mockAnonymous();
    for (const p of ['/broker/deal-card/abc', '/broker/leasing/sp1']) {
      const res = await proxy(req(p, FB));
      expect(res.status, p).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('비프로덕션 E2E 예외(playwright UA / x-playwright-test)는 유지된다', async () => {
    mockAnonymous();
    const prev = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'test');
    try {
      const a = await proxy(req('/broker/dashboard', 'Mozilla Playwright/1.0'));
      expect(a.status).toBe(200);
      const b = await proxy(req('/broker/dashboard', 'Mozilla/5.0', { 'x-playwright-test': 'true' }));
      expect(b.status).toBe(200);
    } finally {
      vi.stubEnv('NODE_ENV', prev ?? 'test');
    }
  });

  it('프로덕션에서는 E2E 예외가 적용되지 않는다', async () => {
    mockAnonymous();
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = await proxy(req('/broker/dashboard', 'Mozilla Playwright/1.0', { 'x-playwright-test': 'true' }));
      expect(res.status).toBe(307);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
