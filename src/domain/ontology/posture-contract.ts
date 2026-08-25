/**
 * @file posture-contract.ts
 * @description 온톨로지 v0.5 포스처 확장 계약 13칸 정의 (ONTOLOGY_V0.5_SPEC.md §4.2, POSTURE_IMPL_GUIDE.md)
 * 5종 포스처(income, owner_occupied, development, operating, trading)의 메타 규격 및 상용화 기준
 */

import type { InvestmentPosture, CapRateBasis } from './enums';

export type Resolution = 'R0' | 'R1' | 'R2' | 'R3';
export type PropertyResolution = 'P0' | 'P1' | 'P2' | 'P3';
export type PostureStatus = 'commercial' | 'beta' | 'internal_only';

export interface PostureContract {
  posture: InvestmentPosture;
  archetypes: string[];              // ≥ 3 아키타입 코드 목록
  sections: string[];                // ≥ 7 섹션 목록
  emphasisSections: string[];        // ≥ 2 강조 섹션 목록
  requiredSlots: string[];           // 필수 슬롯군
  valueMetric: string;               // 핵심 가치 지표 ID
  yieldBasis: CapRateBasis | 'none'; // 수익률 산정 기준
  lAxisSlots: string[];              // L축 슬롯군 (중개인 입력 주축)
  minResolution: { L: Resolution; P: PropertyResolution }; // 최소 해상도 기준
  gradeAdjustment: Record<string, number>; // 등급 가중치 배율
  layoutRules: string[];             // ≥ 1 레이아웃 조판 규칙
  constraints: string[];             // ≥ 1 도메인 제약조건
  gates: string[];                   // 필수 통과 품질 게이트
  nlgMasks: string[];                // ≥ 2 자연어 마스킹 규칙
  status: PostureStatus;             // 상용화 상태
}

export const POSTURE_CONTRACTS: Record<InvestmentPosture, PostureContract> = {
  income: {
    posture: 'income',
    archetypes: ['R-INC-01', 'R-INC-02', 'R-INC-03', 'R-INC-04', 'R-INC-05', 'R-INC-06'],
    sections: [
      'property_overview',
      'location_access',
      'lease_status',
      'income_analysis',
      'risk_check',
      'checklist',
      'investment_thesis',
      'next_steps',
    ],
    emphasisSections: ['lease_status', 'income_analysis'],
    requiredSlots: ['lease_roll', 'financial_input'],
    valueMetric: 'cap_rate_standard',
    yieldBasis: 'gross_price_deposit',
    lAxisSlots: ['lease_roll', 'financial_input'],
    minResolution: { L: 'R2', P: 'P2' },
    gradeAdjustment: { lease_roll: 1.0, financial_input: 1.0 },
    layoutRules: ['L26'],
    constraints: ['C01', 'C04', 'C16', 'C20'],
    gates: ['QG01', 'QG10', 'QG13', 'QG19', 'QG28'],
    nlgMasks: ['M24', 'M25'],
    status: 'commercial',
  },
  owner_occupied: {
    posture: 'owner_occupied',
    archetypes: ['R-OWN-01', 'R-OWN-02', 'R-OWN-03', 'R-OWN-04'],
    sections: [
      'property_overview',
      'location_access',
      'occupancy_fit',
      'cost_comparison',
      'risk_check',
      'checklist',
      'investment_thesis',
      'next_steps',
    ],
    emphasisSections: ['occupancy_fit', 'cost_comparison'],
    requiredSlots: ['occupancy_plan', 'physical_spec'],
    valueMetric: 'own_vs_lease',
    yieldBasis: 'none',
    lAxisSlots: ['occupancy_plan', 'physical_spec'],
    minResolution: { L: 'R1', P: 'P2' },
    gradeAdjustment: { occupancy_plan: 1.2, physical_spec: 1.1 },
    layoutRules: ['L22'],
    constraints: ['C01', 'C08', 'C18'],
    gates: ['QG01', 'QG02', 'QG03', 'QG10'],
    nlgMasks: ['M24', 'M25'],
    status: 'beta',
  },
  development: {
    posture: 'development',
    archetypes: ['R-DEV-01', 'R-DEV-02', 'R-DEV-03', 'R-DEV-04'],
    sections: [
      'property_overview',
      'location_access',
      'site_analysis',
      'development_feasibility',
      'risk_check',
      'checklist',
      'investment_thesis',
      'next_steps',
    ],
    emphasisSections: ['site_analysis', 'development_feasibility'],
    requiredSlots: ['vacate_plan', 'permit_risk', 'development_plan'],
    valueMetric: 'project_feasibility',
    yieldBasis: 'none',
    lAxisSlots: ['vacate_plan', 'permit_risk', 'development_plan'],
    minResolution: { L: 'R1', P: 'P3' },  // D29 M-3: 개발형 P≥P3 (§6.4)
    gradeAdjustment: { development_plan: 1.3, vacate_plan: 1.2 },
    layoutRules: ['L21'],
    constraints: ['C01', 'C04', 'C27', 'C28'],
    gates: ['QG01', 'QG02', 'QG10', 'QG27'],
    nlgMasks: ['M24', 'M25'],
    status: 'beta',
  },
  operating: {
    posture: 'operating',
    archetypes: ['R-OPR-01', 'R-OPR-02', 'R-OPR-03', 'R-OPR-04'],
    sections: [
      'property_overview',
      'location_access',
      'operation_overview',
      'gop_analysis',
      'risk_check',
      'checklist',
      'investment_thesis',
      'next_steps',
    ],
    emphasisSections: ['operation_overview', 'gop_analysis'],
    requiredSlots: ['operating_performance', 'hospitality_spec'],
    valueMetric: 'gop_cap_rate',
    yieldBasis: 'gop_price',
    lAxisSlots: ['operating_performance', 'hospitality_spec'],
    minResolution: { L: 'R1', P: 'P2' },
    gradeAdjustment: { operating_performance: 1.4, hospitality_spec: 1.1 },
    layoutRules: ['L23'],
    constraints: ['C01', 'C31'],
    gates: ['QG01', 'QG02', 'QG10'],
    nlgMasks: ['M24', 'M25'],
    status: 'beta',
  },
  trading: {
    posture: 'trading',
    archetypes: ['R-TRD-01', 'R-TRD-02', 'R-TRD-03', 'R-TRD-04'],
    sections: [
      'property_overview',
      'location_access',
      'market_position',
      'comparable_analysis',
      'risk_check',
      'checklist',
      'investment_thesis',
      'next_steps',
    ],
    emphasisSections: ['market_position', 'comparable_analysis'],
    requiredSlots: ['market_comp', 'holding_history'],
    valueMetric: 'unit_price',
    yieldBasis: 'none',
    lAxisSlots: ['market_comp', 'holding_history'],
    minResolution: { L: 'R1', P: 'P1' },
    gradeAdjustment: { market_comp: 1.2, holding_history: 1.2 },
    layoutRules: ['L24'],
    constraints: ['C01', 'C05'],
    gates: ['QG01', 'QG02', 'QG10'],
    nlgMasks: ['M24', 'M25'],
    status: 'internal_only',
  },
};

/**
 * 포스처 계약 조회
 */
export function getPostureContract(posture: InvestmentPosture): PostureContract {
  const contract = POSTURE_CONTRACTS[posture];
  if (!contract) {
    throw new Error(`[PostureContract] 미등록 포스처 계약: ${posture}`);
  }
  return contract;
}

/**
 * 포스처가 상용화 수준(commercial / beta)인지 검사
 */
export function isPostureReady(posture: InvestmentPosture): boolean {
  const contract = POSTURE_CONTRACTS[posture];
  return contract ? contract.status !== 'internal_only' : false;
}
