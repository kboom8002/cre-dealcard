/**
 * @file section-catalog.ts
 * @description investmentPosture별 IM 섹션 편성 카탈로그
 * Phase 1: 5 posture × 7 섹션 매핑
 */
import type { InvestmentPosture } from '@/domain/ontology';

export interface SectionPlan {
  posture: InvestmentPosture;
  sections: string[];
  suppress: string[];       // 해당 posture에서 비노출 섹션
  emphasize: string[];      // 상세 프롬프트 적용 섹션
}

export const SECTION_CATALOG: Record<InvestmentPosture, SectionPlan> = {
  income: {
    posture: 'income',
    sections: ['property_overview', 'location_access', 'lease_status',
               'income_analysis', 'risk_check', 'investment_thesis', 'next_steps'],
    suppress: [],
    emphasize: ['lease_status', 'income_analysis'],
  },
  owner_occupied: {
    posture: 'owner_occupied',
    sections: ['property_overview', 'location_access', 'occupancy_fit',
               'cost_comparison', 'risk_check', 'investment_thesis', 'next_steps'],
    suppress: ['lease_status'],
    emphasize: ['occupancy_fit', 'cost_comparison'],
  },
  development: {
    posture: 'development',
    sections: ['property_overview', 'location_access', 'site_analysis',
               'development_feasibility', 'risk_check', 'investment_thesis', 'next_steps'],
    suppress: ['lease_status', 'income_analysis'],
    emphasize: ['site_analysis', 'development_feasibility'],
  },
  operating: {
    posture: 'operating',
    sections: ['property_overview', 'location_access', 'operation_overview',
               'gop_analysis', 'risk_check', 'investment_thesis', 'next_steps'],
    suppress: ['lease_status'],
    emphasize: ['operation_overview', 'gop_analysis'],
  },
  trading: {
    posture: 'trading',
    sections: ['property_overview', 'location_access', 'market_position',
               'comparable_analysis', 'risk_check', 'investment_thesis', 'next_steps'],
    suppress: [],
    emphasize: ['market_position', 'comparable_analysis'],
  },
};

/** posture에 따른 섹션 계획 조회 (기본값: income) */
export function getSectionPlan(posture?: InvestmentPosture): SectionPlan {
  return SECTION_CATALOG[posture ?? 'income'];
}
