/**
 * Broker Contact SSoT — 더미 플레이스홀더/가공 상호 금지 (Rule 34/37)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchBrokerContact, toPptxBrokerInput } from '@/domain/broker/broker-contact';

function mockSupabase(tables: Record<string, any>, authEmail: string | null = null) {
  return {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: tables[t] ?? null }) }),
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: authEmail ? { email: authEmail } : null } }) } },
  };
}

describe('fetchBrokerContact', () => {
  it('부재 필드는 null (플레이스홀더 없음)', async () => {
    const sb = mockSupabase({
      profiles: { display_name: 'E2E 테스트 브로커', company: null, phone: '  ' },
      broker_profiles: { name: '김테스트', office_reg_number: null, license_number: null, contact_email: null },
    });
    const c = await fetchBrokerContact(sb, 'u1', { authEmailFallback: false });
    expect(c).toMatchObject({ displayName: 'E2E 테스트 브로커', company: null, phone: null, email: null, officeRegNumber: null });
    const pptx = toPptxBrokerInput(c)!;
    expect(pptx.company_name).toBeUndefined();
    expect(pptx.phone).toBeUndefined();
    expect(JSON.stringify(pptx)).not.toMatch(/\[|크리딜/);
  });

  it('실제 DB 값 매핑 — 등록번호는 office_reg_number, 이메일은 contact_email 우선', async () => {
    const sb = mockSupabase(
      {
        profiles: { display_name: null, company: '실제중개법인', phone: '02-000-0000' },
        broker_profiles: { name: '홍길동', office_reg_number: '11650-2020-00001', license_number: 'L-1', contact_email: 'biz@x.kr', deal_specialty: ['수익형', '사옥'] },
      },
      'login@x.kr',
    );
    const c = await fetchBrokerContact(sb, 'u1');
    expect(c).toMatchObject({ displayName: '홍길동', company: '실제중개법인', phone: '02-000-0000', email: 'biz@x.kr', officeRegNumber: '11650-2020-00001', specialty: '수익형, 사옥' });
  });

  it('contact_email 부재 시 auth 이메일 폴백 (migration 00062 설계)', async () => {
    const sb = mockSupabase({ profiles: { display_name: 'A' }, broker_profiles: null }, 'login@x.kr');
    const c = await fetchBrokerContact(sb, 'u1');
    expect(c?.email).toBe('login@x.kr');
  });

  it('userId 없거나 두 테이블 모두 없으면 null', async () => {
    expect(await fetchBrokerContact(mockSupabase({}), null)).toBeNull();
    expect(await fetchBrokerContact(mockSupabase({}), 'u1')).toBeNull();
  });
});

describe('소스 회귀 가드 — 브로커 더미 문구 금지', () => {
  const root = process.cwd();
  const files = [
    'src/domain/building/mobile-im/pptx/pptx-renderer.ts',
    'src/app/(public)/im-lite/[buildingId]/fetch-im-data.ts',
    'src/app/api/public/im-lite/[buildingId]/route.ts',
    'src/app/api/public/im-lite/[buildingId]/export/route.ts',
  ];
  it.each(files)('%s 에 더미 연락처/가공 상호 없음', (f) => {
    const src = readFileSync(join(root, f), 'utf8');
    expect(src).not.toMatch(/\[(담당자명|연락처|중개법인명)\]/);
    expect(src).not.toMatch(/크리딜 (부동산중개법인|파트너스|공인중개사 네트워크)/);
  });
});
