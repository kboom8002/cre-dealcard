/**
 * Stage SLA Time Budgets
 * @see CREDEAL_IM_MODERNIZATION/references/upstream/pipeline/04_STAGE_CONTRACTS.md §11
 */

export interface StageBudget {
  warnMs: number;
  cancelMs: number;
}

export const STAGE_SLA_BUDGETS: Record<string, StageBudget> = {
  P00: { warnMs: 1000, cancelMs: 5000 },
  P10: { warnMs: 8000, cancelMs: 20000 },   // 외부 공급자 수집
  P20: { warnMs: 2000, cancelMs: 10000 },   // 결정론 불일치 조정
  P30: { warnMs: 2000, cancelMs: 10000 },   // 유효기준본 생성
  P40: { warnMs: 5000, cancelMs: 20000 },   // 산출항목 계산
  P50: { warnMs: 3000, cancelMs: 15000 },   // CORE 검사
  P60: { warnMs: 3000, cancelMs: 15000 },   // 공통 발행묶음 조립
  M00: { warnMs: 1000, cancelMs: 5000 },
  M10: { warnMs: 2000, cancelMs: 10000 },
  M20: { warnMs: 20000, cancelMs: 60000 },  // 모바일 AI 문안
  M30: { warnMs: 3000, cancelMs: 15000 },
  M40: { warnMs: 2000, cancelMs: 10000 },
  M50: { warnMs: 1000, cancelMs: 5000 },
  S00: { warnMs: 1000, cancelMs: 5000 },
  S10: { warnMs: 30000, cancelMs: 90000 },  // PPTX AI 제안
  S20: { warnMs: 30000, cancelMs: 90000 },
  S30: { warnMs: 5000, cancelMs: 20000 },
  S40: { warnMs: 60000, cancelMs: 180000 }, // PPTX 렌더 미리보기
  S50: { warnMs: 10000, cancelMs: 30000 },
  S60: { warnMs: 2000, cancelMs: 10000 },
  S70: { warnMs: 60000, cancelMs: 180000 }, // PPTX 최종 렌더
};

export function getStageBudget(stage: string): StageBudget {
  return STAGE_SLA_BUDGETS[stage] ?? { warnMs: 5000, cancelMs: 30000 };
}
