import { describe, test, expect } from 'vitest';
import { planImLiteSections, validateImLiteOutput } from '@/domain/building/im-lite-engine';

describe('B3: IM Lite Section Engine', () => {

  test('B3-01: 완성도 80점 미만 - IM Lite 섹션 플래닝 거부', () => {
    const result = planImLiteSections({ completenessScore: 55 });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('completeness_insufficient');
  });

  test('B3-02: 완성도 80점 이상 - 최소 8개 섹션 계획', () => {
    const result = planImLiteSections({ completenessScore: 80 });
    expect(result.eligible).toBe(true);
    expect(result.sections.length).toBeGreaterThanOrEqual(8);
  });

  test('B3-03: 임대차 현황 없을 시 섹션 05, 06 잠금', () => {
    const result = planImLiteSections({
      completenessScore: 80,
      availableLayers: ['building_register', 'registry_docs', 'land_use_plan', 'photos', 'floor_plan'],
    });
    const lockedSections = result.sections.filter(s => s.locked);
    const lockedIds = lockedSections.map(s => s.sectionId);
    expect(lockedIds).toContain('05_tenant_mix');
    expect(lockedIds).toContain('06_cash_flow');
  });

  test('B3-04: 섹션 10 (Disclaimer) 항상 포함 + 잠금 불가', () => {
    const result = planImLiteSections({ completenessScore: 100 });
    const disclaimer = result.sections.find(s => s.sectionId === '10_disclaimer');
    expect(disclaimer).toBeDefined();
    expect(disclaimer?.locked).toBe(false);
    expect(disclaimer?.required).toBe(true);
  });

  test('B3-05: 가격 확정 표현 검출', () => {
    const validation = validateImLiteOutput({
      sectionId: '06_cash_flow',
      content: '순영업소득(NOI)은 정확히 3.4억원입니다.',
    });
    expect(validation.passed).toBe(false);
    expect(validation.violations).toContain('definitive_financial_claim');
  });

  test('B3-06: 임차인명 검출', () => {
    const validation = validateImLiteOutput({
      sectionId: '05_tenant_mix',
      content: '1층에 스타벅스가 입점해 있습니다.',
    });
    expect(validation.passed).toBe(false);
    expect(validation.violations).toContain('tenant_name_detected');
  });
});
