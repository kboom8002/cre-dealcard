/**
 * @file section-catalog.ts
 * @description investmentPosture별 IM 섹션 편성 카탈로그
 * D29 m-2: 포스처별 분화 (수익 12 · 사옥 9 · 개발 10 · 운영 10 · 단기매매 8)
 * D29 m-4: checklist 강조 포스처별 2종으로 제한
 * D29 m-5: checklist → next_steps 바로 앞
 */
import type { InvestmentPosture } from '@/domain/ontology';

export interface SectionPlan {
  posture: InvestmentPosture;
  sections: string[];
  suppress: string[];       // 해당 posture에서 비노출 섹션
  emphasize: string[];      // 상세 프롬프트 적용 섹션 (D29 m-4: 포스처별 2종)
}

// D29 m-2: 포스처별 섹션 수 분화
// D29 m-3: land_detail/comparables 포스처별 조건부
// D29 m-5: checklist는 next_steps 바로 앞
export const SECTION_CATALOG: Record<InvestmentPosture, SectionPlan> = {
  // 수익형: 12섹션
  income: {
    posture: 'income',
    sections: ['property_overview', 'location_access', 'title_rights', 'land_detail',
               'lease_status', 'income_analysis', 'risk_check', 'comparables',
               'investment_thesis', 'checklist', 'next_steps', 'closing'],
    suppress: [],
    emphasize: ['lease_status', 'income_analysis'],  // m-4: 2종
  },
  // 사옥형: 9섹션
  owner_occupied: {
    posture: 'owner_occupied',
    sections: ['property_overview', 'location_access', 'title_rights',
               'occupancy_fit', 'cost_comparison', 'risk_check',
               'investment_thesis', 'checklist', 'next_steps'],
    suppress: ['lease_status', 'land_detail', 'comparables'],  // m-3: 불필요 섹션 억제
    emphasize: ['occupancy_fit', 'cost_comparison'],  // m-4: 2종
  },
  // 개발형: 10섹션
  development: {
    posture: 'development',
    sections: ['property_overview', 'location_access', 'title_rights', 'land_detail',
               'site_analysis', 'development_feasibility', 'risk_check',
               'investment_thesis', 'checklist', 'next_steps'],
    suppress: ['lease_status', 'income_analysis', 'comparables'],
    emphasize: ['site_analysis', 'development_feasibility'],  // m-4: 2종
  },
  // 운영형: 10섹션
  operating: {
    posture: 'operating',
    sections: ['property_overview', 'location_access', 'title_rights', 'land_detail',
               'operation_overview', 'gop_analysis', 'risk_check',
               'investment_thesis', 'checklist', 'next_steps'],
    suppress: ['lease_status'],
    emphasize: ['operation_overview', 'gop_analysis'],  // m-4: 2종
  },
  // 단기매매형: 8섹션
  trading: {
    posture: 'trading',
    sections: ['property_overview', 'location_access', 'title_rights',
               'market_position', 'comparable_analysis', 'risk_check',
               'checklist', 'next_steps'],
    suppress: ['lease_status', 'land_detail'],
    emphasize: ['market_position', 'comparable_analysis'],  // m-4: 2종
  },
};

/** posture에 따른 섹션 계획 조회 — posture 필수 (A-1) */
export function getSectionPlan(posture: InvestmentPosture): SectionPlan {
  return SECTION_CATALOG[posture];
}
