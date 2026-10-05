/**
 * 오너 결정 D1 — IM 은 실제 임차인명 표기, 공개 티저만 마스킹. 날조 브랜드만 검증 후 치환.
 */
import { describe, it, expect } from 'vitest';
import { maskFabricatedBrands, collectRentRollTenantNames, FABRICATED_BRAND_REPLACEMENT } from '@/domain/building/mobile-im/tenant-name-policy';
import { runDisclosureGuard, stripLegacyNameMask } from '@/domain/building/mobile-im/guardrails';
import { normalizeFloorLeases, formatRentRollMarkdown, formatRentRollSummary } from '@/domain/building/mobile-im/lease-adapter';
import { runPublishGates, PUBLISH_GATES } from '@/domain/building/mobile-im/quality-gates-v02';

const leases = [
  { floor: '1F', tenant_name: '고은약국', tenant_type: '약국' },
  { floor: '2F', tenant_name: '로뎀나무내과', tenant_type: '의원' },
  { floor: 'B1', tenant_name: '스타벅스 당산점', tenant_type: '카페' },
];

describe('D1 tenant-name-policy', () => {
  it('렌트롤에 실재하는 브랜드는 그대로 통과한다', () => {
    const md = '지하 1층에는 스타벅스 당산점이 입점해 있고 1층은 고은약국입니다.';
    const r = maskFabricatedBrands(md, leases);
    expect(r.text).toBe(md);
    expect(r.flagged).toEqual([]);
  });

  it('렌트롤에 없는 유명 브랜드만 치환한다 (날조 검증)', () => {
    const md = '1층 고은약국, 인근 올리브영 및 이마트 접근 용이';
    const r = maskFabricatedBrands(md, [{ floor: '1F', tenant_name: '고은약국' }]);
    expect(r.text).toContain('고은약국');
    expect(r.text).not.toContain('올리브영');
    expect(r.text).not.toContain('이마트');
    expect(r.text).toContain(FABRICATED_BRAND_REPLACEMENT);
    expect(r.flagged.sort()).toEqual(['올리브영', '이마트']);
  });

  it('렌트롤이 비어 있으면 유명 브랜드는 모두 근거 없는 상호로 치환한다', () => {
    expect(maskFabricatedBrands('스타벅스 입점', []).text).not.toContain('스타벅스');
    expect(maskFabricatedBrands('스타벅스 입점', null).text).not.toContain('스타벅스');
  });

  it('collectRentRollTenantNames 는 실제 상호만 모은다', () => {
    expect(collectRentRollTenantNames(leases)).toContain('고은약국');
  });

  it('stripLegacyNameMask 는 실제 임차인명을 건드리지 않는다', () => {
    expect(stripLegacyNameMask('고은약국, 로뎀나무내과')).toBe('고은약국, 로뎀나무내과');
  });

  it('runDisclosureGuard: 기본(공개 경로)은 상호 마스킹, allowFields:tenant_name(IM)은 실명 통과', () => {
    const text = '지하 1층 스타벅스 입점';
    const pub = runDisclosureGuard(text);
    expect(pub.safe_text).not.toContain('스타벅스');
    const im = runDisclosureGuard(text, { allowFields: ['tenant_name'] });
    expect(im.safe_text).toContain('스타벅스');
  });

  it('렌트롤 표는 임차인 열에 실명을 표기하고 요약에 NDA 행이 없다', () => {
    const norm = normalizeFloorLeases(leases as any);
    const md = formatRentRollMarkdown(norm);
    expect(md).toContain('| 임차인 |');
    expect(md).toContain('고은약국');
    expect(md).toContain('로뎀나무내과');
    expect(md).not.toMatch(/\[임차인[A-Z]\]/);
    const summary = formatRentRollSummary(norm);
    expect(summary).not.toContain('NDA');
  });

  it('G27: tenantNamesConsistent=false 면 차단, 미설정/true 면 통과', () => {
    expect(PUBLISH_GATES.some((g) => g.id === 'G27')).toBe(true);
    const g27 = PUBLISH_GATES.find((g) => g.id === 'G27')!;
    expect(g27.check({ tenantNamesConsistent: false } as any)).toBe(false);
    expect(g27.check({ tenantNamesConsistent: true } as any)).toBe(true);
    expect(g27.check({} as any)).toBe(true);
    expect(g27.check({ tenantMasked: false } as any)).toBe(false);
    expect(typeof runPublishGates).toBe('function');
  });
});
