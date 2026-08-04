/**
 * @file performance-budget.ts
 * @description IM 생성 파이프라인 성능 예산 상수
 * PIPE-08 반영
 */

/** 각 단계별 최대 허용 시간 (ms) */
export const PERFORMANCE_BUDGET = {
  /** 주소 → PNU 변환 */
  addressResolve: 3_000,
  /** 공부 API 전체 조회 (병렬) */
  publicDataFetch: 15_000,
  /** 등급 산정 */
  gradeCompute: 200,
  /** OCR 건당 파싱 (비동기) */
  ocrParse: 20_000,
  /** 단일 섹션 AI 생성 (LLM 호출 포함) */
  sectionGenerate: 12_000,
  /** 최초 페이지 로드 체감 시간 (전체) */
  totalFirstLoad: 30_000,
  /** Vercel Pro 함수 타임아웃 */
  vercelTimeout: 60_000,
} as const;

/** 성능 예산 초과 여부 검사 */
export function isOverBudget(stage: keyof typeof PERFORMANCE_BUDGET, elapsedMs: number): boolean {
  return elapsedMs > PERFORMANCE_BUDGET[stage];
}

/** 성능 예산 로그 (비차단) */
export function logPerformance(stage: keyof typeof PERFORMANCE_BUDGET, elapsedMs: number): void {
  const budget = PERFORMANCE_BUDGET[stage];
  const pct = Math.round((elapsedMs / budget) * 100);
  if (pct > 80) {
    console.warn(`[perf-budget] ${stage}: ${elapsedMs}ms / ${budget}ms (${pct}%) — ⚠️ NEAR BUDGET`);
  }
}
