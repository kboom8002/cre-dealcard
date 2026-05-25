import { describe, test, expect } from 'vitest';
import { buildLeaseSummaryFromInput, computeWALT } from '@/domain/building/lease-normalizer';

describe('A3: Rent Roll Normalizer', () => {

  const sampleTenants = [
    { floor: '1F', area_sqm: 100, tenant_type: 'retail', monthly_rent: 5000000, deposit: 50000000, contract_end: '2026-06', is_anchor: true, tenant_name: '스타벅스' },
    { floor: '2F', area_sqm: 200, tenant_type: 'office', monthly_rent: 3000000, deposit: 30000000, contract_end: '2025-12', is_anchor: false, tenant_name: '테크스타트업A' },
  ];

  test('A3-01: WALT 계산 (잔여 계약 가중 평균 개월수)', () => {
    const walt = computeWALT(sampleTenants, new Date('2025-06-01'));
    // 1F: 12개월 * 100sqm = 1200
    // 2F: 6개월 * 200sqm = 1200
    // Total Area: 300sqm
    // Weighted Average Remaining Months = 2400 / 300 = 8.0개월
    expect(typeof walt).toBe('number');
    expect(walt).toBe(8.0);
  });

  test('A3-02: publicLayer에 tenant_name 미포함', () => {
    const summary = buildLeaseSummaryFromInput(sampleTenants);
    const publicTenants = summary.publicLayer.tenants;
    expect(publicTenants.every((t: Record<string, unknown>) => !('tenant_name' in t))).toBe(true);
  });

  test('A3-03: publicLayer에 monthly_rent 및 deposit 미포함', () => {
    const summary = buildLeaseSummaryFromInput(sampleTenants);
    const publicTenants = summary.publicLayer.tenants;
    expect(publicTenants.every((t: Record<string, unknown>) => !('monthly_rent' in t))).toBe(true);
    expect(publicTenants.every((t: Record<string, unknown>) => !('deposit' in t))).toBe(true);
  });

  test('A3-04: privateLayer에 전체 필드 보존', () => {
    const summary = buildLeaseSummaryFromInput(sampleTenants);
    expect(summary.privateLayer.tenants[0].tenant_name).toBe('스타벅스');
    expect(summary.privateLayer.tenants[0].monthly_rent).toBe(5000000);
    expect(summary.privateLayer.tenants[1].tenant_name).toBe('테크스타트업A');
    expect(summary.privateLayer.tenants[1].monthly_rent).toBe(3000000);
  });

  test('A3-05: 공실률 계산 (vacancy_rate)', () => {
    const tenantsWithVacancy = [
      ...sampleTenants,
      { floor: '3F', area_sqm: 150, tenant_type: 'vacant', monthly_rent: null, deposit: null, contract_end: null, is_anchor: false, tenant_name: null },
    ];
    const summary = buildLeaseSummaryFromInput(tenantsWithVacancy);
    // 공실 면적: 150sqm
    // 전체 면적: 100 + 200 + 150 = 450sqm
    // 공실률: 150 / 450 = 33.3%
    expect(summary.publicLayer.vacancy_rate).toBeCloseTo(33.3, 0);
  });
});
