/**
 * P0-SEC SEC-1 — requireBroker 역할 축소 회귀 테스트
 *  - broker·admin 통과
 *  - public_user·expert 는 403 (알파 자동 업그레이드 대상에서도 제외 → profiles.role 변경 없음)
 *  - role 없음(null)·기타 역할은 기존 ALLOW_ALPHA_ROLE_UPGRADE 동작 유지
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

let currentRole: string | null = 'broker';
const profileUpserts: unknown[] = [];

vi.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' },
  getServerEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: 'service-key' }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }) },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'u-1', email: 'u@credeal.kr' } }, error: null })),
    },
    from: (_table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        single: async () => ({
          data: currentRole === null ? null : { role: currentRole, display_name: 'U' },
          error: currentRole === null ? { message: 'no rows' } : null,
        }),
        upsert: (row: unknown) => { profileUpserts.push(row); return { eq: async () => ({ data: null, error: null }) }; },
      };
      return q;
    },
  }),
}));

const ORIGINAL_FLAG = process.env.ALLOW_ALPHA_ROLE_UPGRADE;
const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function req() {
  return new NextRequest('http://localhost/api/broker/anything', {
    headers: { Authorization: 'Bearer real-user-token-not-test-pattern' },
  });
}

describe('requireBroker — broker·admin 전용 (P0-SEC)', () => {
  beforeEach(() => {
    profileUpserts.length = 0;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    delete process.env.ALLOW_ALPHA_ROLE_UPGRADE;
  });
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.ALLOW_ALPHA_ROLE_UPGRADE;
    else process.env.ALLOW_ALPHA_ROLE_UPGRADE = ORIGINAL_FLAG;
    if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
  });

  it.each(['broker', 'admin'])('%s → 통과', async (role) => {
    currentRole = role;
    const { requireBroker } = await import('@/lib/auth-guard');
    const r = await requireBroker(req());
    expect(r.error).toBeNull();
    expect(r.role).toBe(role);
    expect(profileUpserts).toEqual([]);
  });

  it.each(['public_user', 'expert'])('%s → 403, 알파 업그레이드도 하지 않음', async (role) => {
    currentRole = role;
    const { requireBroker } = await import('@/lib/auth-guard');
    const r = await requireBroker(req());
    expect(r.error).not.toBeNull();
    expect(r.error!.status).toBe(403);
    const body = await r.error!.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(profileUpserts).toEqual([]);
  });

  it.each(['public_user', 'expert'])('%s → ALLOW_ALPHA_ROLE_UPGRADE=false 에서도 403', async (role) => {
    process.env.ALLOW_ALPHA_ROLE_UPGRADE = 'false';
    currentRole = role;
    const { requireBroker } = await import('@/lib/auth-guard');
    const r = await requireBroker(req());
    expect(r.error!.status).toBe(403);
  });

  it('role 없음(null) → 기존 알파 자동 업그레이드 유지 (broker 로 통과 + profiles upsert)', async () => {
    currentRole = null;
    const { requireBroker } = await import('@/lib/auth-guard');
    const r = await requireBroker(req());
    expect(r.error).toBeNull();
    expect(r.role).toBe('broker');
    expect(profileUpserts).toHaveLength(1);
  });

  it('role 없음(null) + ALLOW_ALPHA_ROLE_UPGRADE=false → 403 (기존 동작 유지)', async () => {
    process.env.ALLOW_ALPHA_ROLE_UPGRADE = 'false';
    currentRole = null;
    const { requireBroker } = await import('@/lib/auth-guard');
    const r = await requireBroker(req());
    expect(r.error!.status).toBe(403);
    expect(profileUpserts).toEqual([]);
  });

  it('미인증 → 401', async () => {
    const { requireBroker } = await import('@/lib/auth-guard');
    // Bearer 없음 + 쿠키 세션 없음 → @supabase/ssr createServerClient 경로 (상단 vi.mock)
    const r = await requireBroker(new NextRequest('http://localhost/api/broker/anything'));
    expect(r.error!.status).toBe(401);
  });
});
