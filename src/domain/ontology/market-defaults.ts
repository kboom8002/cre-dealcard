/**
 * @module Market Defaults Registry
 * @description 시장 기본값 레지스트리 — 위젯 하드코딩 매직넘버를 SSoT로 대체
 * 
 * 각 위젯(BudgetSlider, OwnerOccupied, Development, Operating, Trading)에서
 * 하드코딩된 금리, 공사비, Cap Rate 등의 기본값을 중앙 관리합니다.
 * 
 * 주기적으로 시장 환경에 맞게 갱신하세요.
 * Last updated: 2026-08 (한국은행 기준금리 3.25%, 시중은행 상업용 대출 평균 5.2%)
 */

// ── 상업용 대출 조건 ──
export const COMMERCIAL_MORTGAGE = {
  /** 시중은행 상업용 대출 평균 금리 (연, %) */
  interestRatePct: 5.2,
  /** 한국 상업용 대출 전형적 만기 (년) — 3~5년 만기일시 또는 분할상환 */
  typicalTermYears: 5,
  /** 일반 상업용 부동산 최대 LTV (%) */
  maxLtvPct: 70,
  /** LTV 슬라이더 기본값 (%) */
  defaultLtvPct: 60,
} as const;

// ── 취득 부대비용 ──
export const ACQUISITION_COSTS = {
  /** 취득세율 (%) — 2026 기준 상업용 4.6% */
  taxRatePct: 4.6,
  /** 중개수수료 상한 (%) */
  brokerageFeePct: 0.9,
  /** 법무사/등록 비용 개략 (%) */
  legalFeesPct: 0.3,
} as const;

// ── 건설 단가 (만원/평, 서울 기준 2026) ──
export const CONSTRUCTION_COST_PER_PYUNG = {
  /** RC (철근콘크리트) 구조 */
  RC: 750,
  /** SC (철골) 구조 */
  SC: 680,
  /** SRC (철골철근콘크리트) 구조 */
  SRC: 850,
  /** 일반/기본 (구조 미상) */
  default: 720,
} as const;

// ── 개발사업 기본값 ──
export const DEVELOPMENT_DEFAULTS = {
  /** 간접비율 (설계/인허가/금융/관리, %) */
  softCostRatioPct: 8,
  /** PF 금리 (연, %) */
  pfInterestRatePct: 8.5,
  /** 전형적 개발 사업기간 (년) */
  typicalProjectYears: 2.5,
} as const;

// ── 운영형 자산 기본값 ──
export const OPERATING_DEFAULTS = {
  /** 기본 ADR (만원/박) — 시장 중위값 참고 */
  defaultAdrManwon: 12,
  /** 기본 OCC (%) */
  defaultOccPct: 65,
  /** 기본 GOP 마진 (%) */
  defaultGopMarginPct: 25,
  /** FF&E 적립금 비율 (% of Revenue) */
  ffeReserveRatioPct: 4,
} as const;

// ── Cap Rate 벤치마크 (서울 주요 권역, 2026 Q3) ──
export const CAP_RATE_BENCHMARK: Record<string, number> = {
  강남구: 3.6,
  서초구: 3.8,
  중구: 4.0,
  종로구: 4.2,
  영등포구: 4.3,
  마포구: 4.5,
  성동구: 4.2,
  default: 4.5,
} as const;

// ── 시세 비교 임계값 ──
export const TRADING_THRESHOLDS = {
  /** 할인 판정 임계 (%, 음수) */
  discountThresholdPct: -5,
  /** 프리미엄 판정 임계 (%) */
  premiumThresholdPct: 10,
} as const;

// ── 자가사용 비교 기본값 ──
export const OWNER_OCCUPIED_DEFAULTS = {
  /** 기본 월 임차료 (만원) — 사옥 검토 시 비교 기준 */
  defaultMonthlyRentManwon: 500,
  /** 비교 기간 (년) */
  comparisonHorizonYears: 10,
} as const;

/**
 * 구조 유형 문자열로부터 건설 단가를 반환
 */
export function getConstructionCost(structureType?: string | null): number {
  if (!structureType) return CONSTRUCTION_COST_PER_PYUNG.default;
  const upper = structureType.toUpperCase();
  if (upper.includes('SRC')) return CONSTRUCTION_COST_PER_PYUNG.SRC;
  if (upper.includes('RC') || upper.includes('철근')) return CONSTRUCTION_COST_PER_PYUNG.RC;
  if (upper.includes('SC') || upper.includes('철골')) return CONSTRUCTION_COST_PER_PYUNG.SC;
  return CONSTRUCTION_COST_PER_PYUNG.default;
}

/**
 * 시군구명으로 Cap Rate 벤치마크를 반환
 */
export function getCapRateBenchmark(sigungu?: string | null): number {
  if (!sigungu) return CAP_RATE_BENCHMARK.default;
  for (const [key, value] of Object.entries(CAP_RATE_BENCHMARK)) {
    if (sigungu.includes(key)) return value;
  }
  return CAP_RATE_BENCHMARK.default;
}
