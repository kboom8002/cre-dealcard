import { describe, it, expect } from 'vitest';
import { getActiveStagePlan, STAGE_PLANS } from '../stage-plans';
import { StageTimer } from '../stage-timer';
import { NumericalAnchors } from '../numerical-anchors';
import type { InvestmentPosture } from '@/domain/ontology';

describe('Stage Plans (S0-1)', () => {
  const postures: InvestmentPosture[] = [
    'income',
    'owner_occupied',
    'development',
    'operating',
    'trading',
  ];

  it('5종 포스처 전체에 대해 위상 정렬 스테이지 플랜이 정의되어 있어야 한다', () => {
    for (const p of postures) {
      const plan = STAGE_PLANS[p];
      expect(plan).toBeDefined();
      expect(plan.length).toBeGreaterThanOrEqual(3);
      // Stage 1은 병렬이어야 함
      expect(plan[0].parallel).toBe(true);
      expect(plan[0].sections.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('getActiveStagePlan은 활성 섹션에 맞춰 필터링된 스테이지 플랜을 반환해야 한다', () => {
    const active = ['property_overview', 'location_access', 'income_analysis', 'investment_thesis'];
    const plan = getActiveStagePlan('income', active);

    const flatSections = plan.flatMap(s => s.sections);
    expect(flatSections).toEqual(expect.arrayContaining(active));
    expect(flatSections.length).toBe(active.length);
  });
});

describe('Stage Timer (S0-1)', () => {
  it('타이머 기본 한계선(90s/105s/120s)이 올바르게 설정되어야 한다', () => {
    const timer = new StageTimer();
    expect(timer.softLimit).toBe(90_000);
    expect(timer.hardLimit).toBe(105_000);
    expect(timer.killLimit).toBe(120_000);
  });

  it('시간 경과에 따른 한계선 조건 판정이 정확해야 한다', () => {
    const timer = new StageTimer({
      softLimit: 50,
      hardLimit: 100,
      killLimit: 150,
    });

    expect(timer.shouldAbortOptional()).toBe(false);
    expect(timer.shouldForceRender()).toBe(false);
    expect(timer.shouldDiscard()).toBe(false);
  });
});

describe('Numerical Anchors (S0-1)', () => {
  it('초기 수치 등록 및 조회가 정확해야 한다', () => {
    const anchors = new NumericalAnchors({
      askingPriceKrw: 10_000_000_000,
      totalAreaSqm: 1500,
    });

    expect(anchors.get('askingPriceKrw')).toBe(10_000_000_000);
    expect(anchors.get('totalAreaSqm')).toBe(1500);
  });

  it('선행 확정값 유지 및 충돌 시 경고/보존 원칙을 지켜야 한다 (불변조건)', () => {
    const anchors = new NumericalAnchors();
    anchors.set('askingPriceKrw', 10_000_000_000, 'property_overview', 1);

    // 동일 수치(1% 오차 이내) 입력 시 충돌 없이 통과
    anchors.set('askingPriceKrw', 10_050_000_000, 'lease_status', 1);
    expect(anchors.conflictCount).toBe(0);
    expect(anchors.get('askingPriceKrw')).toBe(10_000_000_000);

    // 오차 1% 초과 충돌 발생 시 기존값 유지 및 conflictCount 증가
    anchors.set('askingPriceKrw', 12_000_000_000, 'income_analysis', 2);
    expect(anchors.conflictCount).toBe(1);
    expect(anchors.get('askingPriceKrw')).toBe(10_000_000_000); // 선행 확정값 보존
  });

  it('toPromptContext 텍스트 블록이 올바르게 생성되어야 한다', () => {
    const anchors = new NumericalAnchors({
      askingPriceKrw: 5_000_000_000,
    });
    const ctxText = anchors.toPromptContext();
    expect(ctxText).toContain('[확정 수치 앵커');
    expect(ctxText).toContain('askingPriceKrw: 5000000000');
  });
});
