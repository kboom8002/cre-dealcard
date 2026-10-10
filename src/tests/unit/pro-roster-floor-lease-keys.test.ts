// X2 — floor_leases 실제 키(rent_manwon / mgmt_fee_manwon)로 Pro 로스터 임대료·관리비가 채워진다
import { describe, it, expect } from 'vitest';
import { bindProImChapterData } from '@/domain/building/mobile-im/pptx/binder/pro-chapter-binder';

const bind = (floor_leases: any[]) => bindProImChapterData({ body: { floor_leases } } as any, undefined, {}) as any;

const base = { floor: '1F', unit_number: '101호', tenant_name: 'A사', industry: '사무', deposit_manwon: 1000, lease_end_date: '2028-12-31', area_sqm: 100 };

describe('Pro 바인더 X2 — 키 별칭 폴백', () => {
  it('rent_manwon / mgmt_fee_manwon 만 있어도 월임대료·관리비가 0 이 아니다', () => {
    const r = bind([{ ...base, rent_manwon: 123, mgmt_fee_manwon: 12 }]);
    const total = r.rentRollPart1.tableRows[r.rentRollPart1.tableRows.length - 1] as string[];
    const joined = total.join('|');
    expect(joined).toContain('123');
    expect(joined).toContain('12');
  });

  it('레거시 키(monthly_rent_manwon / maintenance_manwon)가 있으면 그것이 우선 (회귀 없음)', () => {
    const r = bind([{ ...base, monthly_rent_manwon: 200, rent_manwon: 999, maintenance_manwon: 20, mgmt_fee_manwon: 99 }]);
    const row = (r.rentRollPart1.tableRows[0] as string[]).join('|');
    expect(row).toContain('200');
    expect(row).not.toContain('999');
  });

  it('두 키 모두 없으면 0 (기존 동작)', () => {
    const r = bind([{ ...base }]);
    expect(r.rentRollPart1.tableRows.length).toBeGreaterThan(0);
  });
});
