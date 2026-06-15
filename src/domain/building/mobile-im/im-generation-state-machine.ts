// src/domain/building/mobile-im/im-generation-state-machine.ts
// IM 생성 상태 머신 — Forward-only 전이 + 단계별 프롬프트 힌트
// 원본 참조: aihompyhub/conversationStateMachine.ts

import type { SectionContext } from "./narrative-prompt";

// ─── IM 생성 단계 ─────────────────────────────────────────────────────────────

export type IMGenStage =
  | 'data_collection'     // SSoT + 공공데이터 수집
  | 'property_overview'   // 섹션 1
  | 'location_analysis'   // 섹션 2
  | 'lease_status'        // 섹션 3
  | 'income_analysis'     // 섹션 4
  | 'risk_check'          // 섹션 5
  | 'investment_thesis'   // 섹션 6
  | 'next_steps'          // 섹션 7
  | 'cross_validation'    // 섹션 간 교차 검증
  | 'quality_gate'        // LLM Judge 종합 평가
  | 'pending_approval';   // 브로커 리뷰 대기

// Forward-only 전이 — 뒤로 돌아갈 수 없음
const IM_TRANSITIONS: Record<IMGenStage, IMGenStage[]> = {
  data_collection:   ['property_overview'],
  property_overview: ['location_analysis'],
  location_analysis: ['lease_status'],
  lease_status:      ['income_analysis'],
  income_analysis:   ['risk_check'],
  risk_check:        ['investment_thesis'],
  investment_thesis: ['next_steps'],
  next_steps:        ['cross_validation'],
  cross_validation:  ['quality_gate'],
  quality_gate:      ['pending_approval'],
  pending_approval:  [],
};

// ─── 단계별 프롬프트 힌트 ─────────────────────────────────────────────────────

const STAGE_HINTS: Record<IMGenStage, string> = {
  data_collection:   '데이터 수집 단계: SSoT와 공공데이터를 병합합니다.',
  property_overview: '자산 개요: 물리적 제원과 프리미엄 가치를 부각하세요.',
  location_analysis: '입지 분석: 교통 접근성과 주변 인프라를 생생하게 묘사하세요.',
  lease_status:      '임대차 현황: 공실률과 임차인 구성의 안정성을 스토리로 만드세요.',
  income_analysis:   '수익 분석: 사전 계산된 재무 지표를 활용하세요. 이전 섹션의 공실률과 일관되게 작성하세요.',
  risk_check:        '리스크 진단: 용적률 한도, 건물 연식, 공법 규제를 객관적으로 짚어주세요.',
  investment_thesis: '투자 논거: 이전 모든 섹션의 핵심 사실을 종합하여 가치제안을 도출하세요.',
  next_steps:        '다음 단계: 현장 방문, Full IM 열람 등 후속 액션을 안내하세요.',
  cross_validation:  '교차 검증: 모든 섹션 간 수치 일관성을 검증합니다.',
  quality_gate:      '품질 평가: LLM Judge가 종합 평가를 수행합니다.',
  pending_approval:  '브로커 승인 대기 중입니다.',
};

// ─── 상태 머신 컨텍스트 ─────────────────────────────────────────────────────

export interface IMStateMachine {
  stage: IMGenStage;
  context: SectionContext;
  transitions: typeof IM_TRANSITIONS;
}

/**
 * 상태 머신 초기화
 */
export function createIMStateMachine(initialContext: SectionContext): IMStateMachine {
  return {
    stage: 'data_collection',
    context: initialContext,
    transitions: IM_TRANSITIONS,
  };
}

/**
 * Forward-only 전이 — 현재 단계에서 다음 단계로만 이동 가능
 * 잘못된 전이 시도 시 false 반환
 */
export function transitionTo(machine: IMStateMachine, nextStage: IMGenStage): boolean {
  const allowed = machine.transitions[machine.stage];
  if (!allowed.includes(nextStage)) {
    console.warn(
      `[im-state-machine] Invalid transition: ${machine.stage} → ${nextStage}. ` +
      `Allowed: [${allowed.join(', ')}]`
    );
    return false;
  }
  machine.stage = nextStage;
  return true;
}

/**
 * 현재 단계에 맞는 프롬프트 힌트 반환
 */
export function getStageHint(stage: IMGenStage): string {
  return STAGE_HINTS[stage] || '';
}

/**
 * 섹션 타입 → 상태 머신 스테이지 매핑
 */
export function sectionTypeToStage(sectionType: string): IMGenStage | null {
  const mapping: Record<string, IMGenStage> = {
    property_overview: 'property_overview',
    location_access:   'location_analysis',
    lease_status:      'lease_status',
    income_analysis:   'income_analysis',
    risk_check:        'risk_check',
    investment_thesis: 'investment_thesis',
    next_steps:        'next_steps',
  };
  return mapping[sectionType] ?? null;
}

/**
 * 현재 단계가 생성 단계인지 (섹션 생성 중인지) 확인
 */
export function isGenerationStage(stage: IMGenStage): boolean {
  return [
    'property_overview',
    'location_analysis',
    'lease_status',
    'income_analysis',
    'risk_check',
    'investment_thesis',
    'next_steps',
  ].includes(stage);
}

/**
 * 모든 생성 단계가 완료되었는지 확인
 */
export function isGenerationComplete(stage: IMGenStage): boolean {
  return ['cross_validation', 'quality_gate', 'pending_approval'].includes(stage);
}
