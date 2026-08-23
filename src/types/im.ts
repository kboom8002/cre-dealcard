// src/types/im.ts
// IM API & 타입 계약 정본 (D3)
// 엑셀 15개 입력 필드 ↔ DB 컬럼 ↔ TypeScript 타입 1:1 고정 매핑
// Spec: API_TYPE_CONTRACT.md (D3)

import type { Ontology, InvestmentPosture, PriceBand } from './ontology';

// ══════════════════════════════════════════════════════════════════════
// §1. 재무 계약
// ══════════════════════════════════════════════════════════════════════

export interface FinancialInput {
  priceKrw: number;                     // 필수
  depositKrw: number;                   // 필수 (0 허용)
  monthlyRentKrw: number;               // 필수
  opexKrw: number | null;               // ★ null이면 NOI 계열 미산출
  mgmtFeeKrw: number | null;
  loanKrw: number | null;
  loanRate: number | null;              // null이면 ASSUMPTIONS.loanRateDefault
  brokerFeeKrw: number | null;
  otherCostKrw: number | null;
}

/** 수익률 산출 기반 7종 전량 열거 */
export type CapRateBasis =
  | 'gross_price'          // 연 임대료 / 매매가
  | 'gross_price_deposit'  // 연 임대료 / (매매가 − 보증금)
  | 'noi_price'            // NOI / 매매가
  | 'noi_price_deposit'    // NOI / (매매가 − 보증금)
  | 'noi_equity'           // NOI / 실투자금
  | 'noi_total_cost'       // NOI / 총취득원가
  | 'gop_price';           // GOP / 매매가 (operating 전용)

export const BASIS_LABEL: Record<CapRateBasis, string> = {
  gross_price:         '총임대료 ÷ 매매가',
  gross_price_deposit: '총임대료 ÷ (매매가 − 보증금)',
  noi_price:           'NOI ÷ 매매가',
  noi_price_deposit:   'NOI ÷ (매매가 − 보증금)',
  noi_equity:          'NOI ÷ 실투자금',
  noi_total_cost:      'NOI ÷ 총취득원가',
  gop_price:           'GOP ÷ 매매가',
};

export const NET_BASES: readonly CapRateBasis[] = [
  'noi_price', 'noi_price_deposit', 'noi_equity', 'noi_total_cost',
] as const;

export interface YieldValue {
  value: number;
  basis: CapRateBasis;
}

/** 라벨 규칙: 순수익률 vs 수익률 엄격 분리 */
export function renderYield(y: YieldValue): string {
  const label = NET_BASES.includes(y.basis) ? '연 순수익률' : '연 수익률';
  return `${label} ${y.value.toFixed(2)}% (${BASIS_LABEL[y.basis]})`;
}

/** 취득원가 4줄 내역 (매매가·취득세·중개보수·기타) */
export interface EquityBreakdown {
  price: number;
  acquisitionTax: number;               // 매매가 × 0.046
  brokerFee: number;                    // 매매가 × 0.009 (또는 실입력)
  otherCost: number;
  totalAcquisitionCost: number;         // ★ 화면 필수 노출 (취득원가 합계)
  deposit: number;
  loan: number;
  equity: number;                       // 실투자금 (총취득원가 - 보증금 - 대출)
}

/** operating 포스처 — 실적 자료의 신뢰 수준 */
export type VerificationLevel = 'verified' | 'partial' | 'unverified';

/** 포스처별 최종 헤드라인 지표 (판별 유니온) */
export type Headline =
  | {
      posture: 'income';
      monthlyNetCashFlow: number;
      negativeLeverage: boolean;
    }
  | {
      posture: 'owner_occupied';
      effectiveBurden: number;
      savedRent: number | null;
      occupancyCostPerPyeongMonthly?: number | null;
    }
  | {
      posture: 'development';
      mode: 'sale' | 'hold';
      profitRate?: number;
      postDevYield?: YieldValue;
      startDate: Date | null;
      vacateResponsibility: 'seller' | 'buyer' | 'undecided';
      regulationExpiry: Date | null;
      requiredEquity: number | null;
    }
  | {
      posture: 'operating';
      gop: number | null;
      verificationLevel: VerificationLevel;
    }
  | {
      posture: 'trading';
      holdingCost: number;
      exitPrice: number | null;
      afterTaxGain: { years: number; gain: number }[];
    };

// ══════════════════════════════════════════════════════════════════════
// §2. 임대차 데이터 계층 — 3중 매핑 (입력 15 + 자동 6)
// ══════════════════════════════════════════════════════════════════════

export type LeaseState  = '임대중' | '공실' | '자가사용';
export type LegalBasis  = '상가' | '주택' | '미확인';
export type Renewal     = '있음' | '없음' | '모름';
export type Opposing    = '사업자등록' | '주민등록' | '미확인';

export interface LeaseRow {
  // R1 — 발행 최소선
  unitLabel: string;                    // 호실/층
  tenantBusiness: string | null;        // 원문 그대로 · 추론 금지
  depositKrw: number | null;            // 보증금
  monthlyRentKrw: number | null;        // 월세(VAT별도)
  currentExpiryDate: string | null;     // 현 계약 만료일 (YYYY-MM-DD)
  leaseState: LeaseState;               // 임대상태
  // R2
  contractGroup: string | null;         // 계약그룹
  leaseAreaSqm: number | null;          // 임대면적(㎡)
  legalBasis: LegalBasis | null;        // 적용법령 (상가/주택)
  mgmtFeeKrw: number | null;            // 관리비(원)
  currentStartDate: string | null;      // 현 계약 시작일 (YYYY-MM-DD)
  // R3
  firstContractDate: string | null;     // 최초 계약일 (YYYY-MM-DD)
  renewalExercised: Renewal | null;     // 갱신요구권 행사 이력
  opposingPower: Opposing | null;       // 대항력 요건
  // 공통
  note: string | null;                  // 비고
}

export type VacateVerdict =
  | { state: 'determined'; at: string; reason?: string }
  | { state: 'unknown';    reason: string };

// ─── 런타임 계산 파생값 6종 (DB 저장 안 함) ───

/** 16. 임대면적(평) */
export function sqmToPyeong(sqm: number | null): number | null {
  if (sqm == null || sqm <= 0) return null;
  return parseFloat((sqm * 0.3025).toFixed(2));
}

/** 17. 환산보증금(자동) = 보증금 + (월세 × 100) */
export function convertedDeposit(depositKrw: number | null, monthlyRentKrw: number | null): number | null {
  if (depositKrw == null && monthlyRentKrw == null) return null;
  return (depositKrw ?? 0) + ((monthlyRentKrw ?? 0) * 100);
}

/** 18. 상임법 전면적용 대상 여부 (서울 기준 환산보증금 9억 이하) */
export function isFullyCovered(depositKrw: number | null, monthlyRentKrw: number | null, thresholdKrw = 900_000_000): boolean | null {
  const cd = convertedDeposit(depositKrw, monthlyRentKrw);
  if (cd == null) return null;
  return cd <= thresholdKrw;
}

/** 19. 갱신권 잔여 명도 시점 판정 (임대차 수학 모듈로 위임) */
export function vacatePoint(row: LeaseRow, asOf: Date = new Date()): VacateVerdict {
  if (row.leaseState === '공실') {
    return { state: 'determined', at: asOf.toISOString().slice(0, 10), reason: '현재 공실' };
  }
  if (row.leaseState === '자가사용') {
    return { state: 'determined', at: asOf.toISOString().slice(0, 10), reason: '매도인 자가사용 (명도 협의)' };
  }
  if (row.legalBasis === '주택') {
    // 주택 산식
    if (row.renewalExercised == null || row.renewalExercised === '모름') {
      return { state: 'unknown', reason: '주택 갱신요구권 행사 이력 확인 필요' };
    }
    if (!row.currentExpiryDate) {
      return { state: 'unknown', reason: '현 계약 만료일 확인 필요' };
    }
    if (row.renewalExercised === '있음') {
      return { state: 'determined', at: row.currentExpiryDate, reason: '갱신요구권 소진 (1회)' };
    }
    const exp = new Date(row.currentExpiryDate);
    exp.setFullYear(exp.getFullYear() + 2);
    return { state: 'determined', at: exp.toISOString().slice(0, 10), reason: '갱신 청구 시 +2년' };
  }

  // 상가 산식: 최초계약일 기준 10년
  if (!row.firstContractDate) {
    return { state: 'unknown', reason: '상가 최초 계약일 확인 필요' };
  }
  const first = new Date(row.firstContractDate);
  const tenYears = new Date(first);
  tenYears.setFullYear(first.getFullYear() + 10);
  const elapsedYears = (asOf.getTime() - first.getTime()) / (365.25 * 24 * 3600 * 1000);
  const remainYears = Math.max(0, 10 - elapsedYears);
  return {
    state: 'determined',
    at: tenYears.toISOString().slice(0, 10),
    reason: `상임법 10년 보장 (잔여 ${remainYears.toFixed(1)}년)`,
  };
}

/** 20. 계약 상태(자동) */
export function contractStatus(expiryDate: string | null, asOf: Date = new Date()): '유효' | '만료임박' | '만료' | '미확인' {
  if (!expiryDate) return '미확인';
  const exp = new Date(expiryDate);
  const diffDays = (exp.getTime() - asOf.getTime()) / (24 * 3600 * 1000);
  if (diffDays < 0) return '만료';
  if (diffDays <= 90) return '만료임박';
  return '유효';
}

/** 21. 월 총수입(자동) = 월세 + 관리비 */
export function monthlyGross(monthlyRentKrw: number | null, mgmtFeeKrw: number | null): number | null {
  if (monthlyRentKrw == null && mgmtFeeKrw == null) return null;
  return (monthlyRentKrw ?? 0) + (mgmtFeeKrw ?? 0);
}

// ══════════════════════════════════════════════════════════════════════
// §3. 해상도 및 기능 판정
// ══════════════════════════════════════════════════════════════════════

export type Resolution = 'R0' | 'R1' | 'R2' | 'R3';

export type Capability =
  | 'yield_gross'
  | 'yield_noi'
  | 'vacate_schedule'
  | 'rent_normalization'
  | 'dev_feasibility'
  | 'saved_rent';

export interface CapabilitySpec {
  capability: Capability;
  requires: (keyof LeaseRow | string)[];
}
