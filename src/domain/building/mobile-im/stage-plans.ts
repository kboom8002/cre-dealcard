/**
 * @file stage-plans.ts
 * @description 포스처별 위상 정렬 스테이지 플랜 정의 (GENERATION_PERF_SPEC.md §4)
 * 의존성에 따라 Stage 1(독립 병렬) → Stage 2(재무/특화) → Stage 3(리스크) → Stage 4(투자논거)로 분할
 */

import type { InvestmentPosture } from '@/domain/ontology';

export interface SectionStage {
  stage: number;
  sections: string[];
  parallel: boolean;
  dependsOn?: string[]; // 앵커 의존성 키
}

export const STAGE_PLANS: Record<InvestmentPosture, SectionStage[]> = {
  income: [
    // D37 P1-1: D36 §4.2 income 15면 반영
    {
      stage: 1,
      sections: ['property_overview', 'decision_snapshot', 'location_access', 'next_steps'],
      parallel: true,
    },
    // [앵커 확정] askingPriceKrw, totalAreaSqm, vacancyPct, monthlyRentTotalKrw
    {
      stage: 2,
      sections: ['lease_status', 'income_analysis'],
      parallel: false,
      dependsOn: ['askingPriceKrw', 'totalAreaSqm'],
    },
    // BG 전용면 — releaseTier에 따라 조건부 포함
    {
      stage: 3,
      sections: ['market_rent_gap', 'value_add_plan', 'stabilized_scenario'],
      parallel: false,
    },
    {
      stage: 4,
      sections: ['risk_check'],
      parallel: false,
    },
    {
      stage: 5,
      sections: ['investment_thesis'],
      parallel: false,
    },
  ],
  development: [
    {
      stage: 1,
      sections: ['property_overview', 'location_access', 'next_steps'],
      parallel: true,
    },
    {
      stage: 2,
      sections: ['site_analysis', 'development_feasibility'],
      parallel: false,
      dependsOn: ['askingPriceKrw', 'landAreaSqm'],
    },
    {
      stage: 3,
      sections: ['risk_check'],
      parallel: false,
    },
    {
      stage: 4,
      sections: ['investment_thesis'],
      parallel: false,
    },
  ],
  operating: [
    {
      stage: 1,
      sections: ['property_overview', 'location_access', 'next_steps'],
      parallel: true,
    },
    {
      stage: 2,
      sections: ['operation_overview', 'gop_analysis'],
      parallel: false,
      dependsOn: ['askingPriceKrw', 'totalAreaSqm'],
    },
    {
      stage: 3,
      sections: ['risk_check'],
      parallel: false,
    },
    {
      stage: 4,
      sections: ['investment_thesis'],
      parallel: false,
    },
  ],
  owner_occupied: [
    {
      stage: 1,
      sections: ['property_overview', 'location_access', 'next_steps'],
      parallel: true,
    },
    {
      stage: 2,
      sections: ['occupancy_fit', 'cost_comparison'],
      parallel: false,
      dependsOn: ['askingPriceKrw', 'totalAreaSqm'],
    },
    {
      stage: 3,
      sections: ['risk_check'],
      parallel: false,
    },
    {
      stage: 4,
      sections: ['investment_thesis'],
      parallel: false,
    },
  ],
  trading: [
    {
      stage: 1,
      sections: ['property_overview', 'location_access', 'next_steps'],
      parallel: true,
    },
    {
      stage: 2,
      sections: ['market_position', 'comparable_analysis'],
      parallel: false,
      dependsOn: ['askingPriceKrw', 'totalAreaSqm'],
    },
    {
      stage: 3,
      sections: ['risk_check'],
      parallel: false,
    },
    {
      stage: 4,
      sections: ['investment_thesis'],
      parallel: false,
    },
  ],
};

/**
 * 포스처와 현재 섹션 목록에 맞춰 활성화할 스테이지 플랜을 반환합니다.
 */
export function getActiveStagePlan(
  posture: InvestmentPosture = 'income',
  activeSections?: string[]
): SectionStage[] {
  const plan = STAGE_PLANS[posture] || STAGE_PLANS.income;
  if (!activeSections || activeSections.length === 0) {
    return plan;
  }

  const activeSet = new Set(activeSections);
  const filtered: SectionStage[] = [];

  for (const stage of plan) {
    const included = stage.sections.filter(s => activeSet.has(s));
    if (included.length > 0) {
      filtered.push({
        ...stage,
        sections: included,
      });
    }
  }

  // 정의된 스테이지에 포함되지 않은 기타 섹션 처리
  const plannedSections = new Set(plan.flatMap(p => p.sections));
  const remaining = activeSections.filter(s => !plannedSections.has(s));
  if (remaining.length > 0) {
    if (filtered.length > 0 && filtered[0].stage === 1) {
      filtered[0].sections.push(...remaining);
    } else {
      filtered.unshift({
        stage: 1,
        sections: remaining,
        parallel: true,
      });
    }
  }

  return filtered;
}
