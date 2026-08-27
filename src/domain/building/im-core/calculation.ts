/**
 * D37 P0-1: Calculation 타입 정의
 *
 * 계산은 코드에서, LLM은 설명만 (07 §12.1).
 * 모든 계산 결과는 Calculation 객체를 통해 추적됩니다.
 *
 * @see docs/impipe/D37_P0_IMPLEMENTATION_PLAN.md §P0-2
 * @see docs/impipe/IM_BROKER_SPEC_UPGRADE.md §1.3
 */

// ── 수익률 기준 ──

/**
 * 수익률 계산의 기준 (basis).
 * 🔴 라벨은 여기서 파생됩니다. 문자열 교정 금지.
 *
 * - GPI: 총임대수입 기준 → "총임대수입 기준 수익률" (Gross Yield)
 * - EGI: 유효총수입 기준 (공실 차감)
 * - NOI: 순영업소득 기준 → "순수익률" 표시에는 반드시 NOI 기준이어야 함
 */
export type YieldBasis = 'GPI' | 'EGI' | 'NOI';

/** YieldBasis에 대응하는 외부 표시 라벨 */
export const YIELD_BASIS_LABEL: Record<YieldBasis, string> = {
  GPI: '총임대수입 기준 수익률',
  EGI: '유효총수입 기준 수익률',
  NOI: '순영업소득 기준 수익률 (Cap Rate)',
};

// ── 공제 항목 ──

/** NOI 산출 시의 개별 공제 항목 */
export interface Deduction {
  /** 공제 항목 이름 (예: '운영비', '관리비', '보험료') */
  name: string;
  /** 공제 금액 (원) */
  amount: number;
}

// ── Calculation ──

/**
 * 하나의 결정론적 계산.
 *
 * 🔴 불변조건:
 * - basis='NOI'인데 deductions.length===0 → G38 차단
 *   (운영비 없이 NOI를 산출할 수 없습니다)
 * - 전 면이 같은 Calculation.id를 참조하면 V4 4면/10면 모순이 구조적으로 불가능
 * - 07 §12.1: "계산에 사용한 입력, 단위, 기준일, 공식 버전을 저장한다"
 */
export interface Calculation {
  /** UUID v4 */
  id: string;
  /** 수식 표현 (예: 'noi / asking_price', 'deposit + monthly_rent * 100') */
  formula: string;
  /** 수식 버전. 계산 로직 변경 시 버전업 (예: 'v1.0.0') */
  formulaVersion: string;
  /** 입력 Claim 참조 — { 역할: claim_id } */
  inputs: Record<string, string>;
  /** 계산 결과 */
  result: number;
  /** 수익률 기준. NOI인데 공제 없으면 G38 차단 */
  basis?: YieldBasis;
  /** NOI 산출 시 공제 항목 목록 */
  deductions?: Deduction[];
}

// ── 검증 ──

/**
 * Calculation의 불변조건을 검사합니다.
 * @returns 위반 사유 배열
 */
export function validateCalculation(calc: Calculation): string[] {
  const violations: string[] = [];

  if (calc.basis === 'NOI' && (!calc.deductions || calc.deductions.length === 0)) {
    violations.push(
      `[G38] Calculation '${calc.id}': basis='NOI'인데 공제 항목이 없습니다. ` +
      `운영비 없이 NOI를 산출할 수 없습니다.`,
    );
  }

  if (Object.keys(calc.inputs).length === 0) {
    violations.push(
      `[B11/G51] Calculation '${calc.id}': 입력 Claim이 없습니다. 계산식 재현이 불가합니다.`,
    );
  }

  return violations;
}
