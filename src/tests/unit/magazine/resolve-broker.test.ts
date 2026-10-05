/**
 * resolveBroker (I-02) — 형식 분기, `.or` 미사용, 형식 불일치는 DB 미호출, 오류는 throw
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveBroker } from '@/lib/magazine/resolve-broker';

const UUID = '11111111-1111-4111-8111-111111111111';

interface Rec {
  table: string;
  cols?: string;
  eqs: Array<[string, unknown]>;
  usedOr: boolean;
}

/** from().select().eq().maybeSingle() 체인만 지원. 그 외 메서드(.or 등) 호출 시 TypeError → 테스트 실패 */
function mockSupabase(opts: {
  broker?: Record<string, unknown> | null;
  brokerError?: { message: string };
  profile?: Record<string, unknown> | null;
  profileError?: { message: string };
}) {
  const recs: Rec[] = [];
  const client = {
    from(table: string) {
      const rec: Rec = { table, eqs: [], usedOr: false };
      recs.push(rec);
      const chain = {
        select(cols: string) {
          rec.cols = cols;
          return chain;
        },
        eq(col: string, val: unknown) {
          rec.eqs.push([col, val]);
          return chain;
        },
        async maybeSingle() {
          if (table === 'broker_profiles') return { data: opts.broker ?? null, error: opts.brokerError ?? null };
          return { data: opts.profile ?? null, error: opts.profileError ?? null };
        },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, recs };
}

const BROKER_ROW = {
  user_id: UUID,
  slug: 'kim-broker',
  bio: '소개',
  specialty_regions: ['강남'],
  specialty_assets: ['꼬마빌딩'],
  is_public: true,
};
const PROFILE_ROW = { id: UUID, display_name: '김중개', photo_url: null, company: '딜카드', tagline: null };

describe('resolveBroker', () => {
  it('slug 형식 → slug 컬럼으로 단일 eq 쿼리', async () => {
    const { client, recs } = mockSupabase({ broker: BROKER_ROW, profile: PROFILE_ROW });
    const r = await resolveBroker(client, 'kim-broker');
    expect(recs[0].table).toBe('broker_profiles');
    expect(recs[0].eqs).toEqual([['slug', 'kim-broker']]);
    expect(r).toMatchObject({ userId: UUID, slug: 'kim-broker', displayName: '김중개', company: '딜카드', specialtyRegions: ['강남'] });
  });

  it('uuid 형식 → user_id 컬럼으로 단일 eq 쿼리 (slug 컬럼에 uuid를 넣지 않는다)', async () => {
    const { client, recs } = mockSupabase({ broker: BROKER_ROW, profile: PROFILE_ROW });
    await resolveBroker(client, UUID);
    expect(recs[0].eqs).toEqual([['user_id', UUID]]);
    expect(recs.some((r) => r.eqs.some(([c]) => c === 'slug'))).toBe(false);
  });

  it('profiles는 id eq 로 별도 조회', async () => {
    const { client, recs } = mockSupabase({ broker: BROKER_ROW, profile: PROFILE_ROW });
    await resolveBroker(client, 'kim-broker');
    expect(recs[1].table).toBe('profiles');
    expect(recs[1].eqs).toEqual([['id', UUID]]);
  });

  it.each(['../etc', 'a,b', 'x)', 'slug.eq.1,user_id.eq.2', '', 'AB', 'a b', '-bad-', 'x'.repeat(40)])(
    '형식 불일치 %j → DB 호출 없이 null',
    async (bad) => {
      const { client, recs } = mockSupabase({ broker: BROKER_ROW, profile: PROFILE_ROW });
      expect(await resolveBroker(client, bad)).toBeNull();
      expect(recs).toHaveLength(0);
    },
  );

  it('비문자열 입력 → null', async () => {
    const { client, recs } = mockSupabase({});
    expect(await resolveBroker(client, undefined as unknown as string)).toBeNull();
    expect(recs).toHaveLength(0);
  });

  it('미존재 broker → null (profiles 조회 안 함)', async () => {
    const { client, recs } = mockSupabase({ broker: null });
    expect(await resolveBroker(client, 'ghost-broker')).toBeNull();
    expect(recs).toHaveLength(1);
  });

  it('DB 오류는 "없음"으로 위장하지 않고 throw', async () => {
    const { client } = mockSupabase({ brokerError: { message: 'boom' } });
    await expect(resolveBroker(client, 'kim-broker')).rejects.toThrow(/broker lookup failed/);
  });

  it('표시명 조회 실패 시 displayName은 null(가짜 기본값 없음), broker는 반환', async () => {
    const { client } = mockSupabase({ broker: BROKER_ROW, profileError: { message: 'profiles down' } });
    const r = await resolveBroker(client, 'kim-broker');
    expect(r?.userId).toBe(UUID);
    expect(r?.displayName).toBeNull();
  });

  it('공개 불가 필드(전화·이메일·면허)는 반환 타입에 없다', async () => {
    const { client } = mockSupabase({
      broker: { ...BROKER_ROW, license_number: 'X-1', contact_email: 'a@b.c' },
      profile: { ...PROFILE_ROW, phone: '01012345678' },
    });
    const r = (await resolveBroker(client, 'kim-broker')) as unknown as Record<string, unknown>;
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['phone']));
    expect(JSON.stringify(r)).not.toMatch(/01012345678|a@b\.c|X-1/);
  });
});
