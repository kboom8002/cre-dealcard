/**
 * D37 P0-2: FinancialCalculator — 계산 엔진을 LLM 밖으로
 *
 * 기존 financials.ts의 결정론적 Strategy 계산을 Claim 기반으로 감싸는 어댑터.
 * 모든 계산 결과가 ClaimRegistry에 등록되므로:
 * - 전 면이 같은 Claim 참조 → V4 4면/10면 모순 불가
 * - LLM은 Claim 참조 설명만 → 새 숫자 생성 불가
 * - basis='NOI' + deductions=0 → G38 구조적 차단
 *
 * @see docs/impipe/D37_P0_IMPLEMENTATION_PLAN.md §P0-2
 */

import { randomUUID } from 'crypto';
import type { FinancialInputs, FinancialOutputs } from '../mobile-im/financials';
import { calculateFinancials } from '../mobile-im/financials';
import { ClaimRegistry, type CreateClaimOptions } from './claim-registry';
import { validateCalculation, type Calculation, type Deduction, type YieldBasis } from './calculation';
import type { Claim } from './claim';

// ── 계산 결과를 Claim으로 변환하는 매핑 ──

interface FinancialClaimSpec {
  subject: string;
  unit: string;
  extract: (out: FinancialOutputs) => number | null;
  /** 이 Claim이 계산 파생이면 수식 정보 */
  formula?: string;
  basis?: YieldBasis;
  /** NOI 기반 계산이면 deductions 추출 함수 */
  deductionsExtract?: (out: FinancialOutputs, inputs: FinancialInputs) => Deduction[];
}

const INCOME_CLAIM_SPECS: FinancialClaimSpec[] = [
  { subject: 'noi_base', unit: '원', extract: o => o.annualNoi?.base ?? null, formula: 'annual_gross * (1 - vacancy) - opex', basis: 'NOI',
    deductionsExtract: (o, i) => {
      const deductions: Deduction[] = [];
      if (i.mgmtFeeTotalManwon && i.mgmtFeeTotalManwon > 0) {
        deductions.push({ name: '관리비', amount: i.mgmtFeeTotalManwon * 10000 * 12 });
      }
      if (i.opexRatioPct != null) {
        const annualGross = (i.monthlyRentKrw ?? 0) * 12;
        deductions.push({ name: '운영비 (비율)', amount: annualGross * (i.opexRatioPct / 100) });
      }
      return deductions;
    },
  },
  { subject: 'noi_best', unit: '원', extract: o => o.annualNoi?.best ?? null, formula: 'annual_gross - opex_low', basis: 'NOI' },
  { subject: 'noi_worst', unit: '원', extract: o => o.annualNoi?.worst ?? null, formula: 'annual_gross * (1 - vacancy_high) - opex_high', basis: 'NOI' },
  { subject: 'cap_rate_base', unit: '%', extract: o => o.capRate?.base ?? null, formula: 'noi_base / asking_price * 100', basis: 'NOI' },
  { subject: 'cap_rate_best', unit: '%', extract: o => o.capRate?.best ?? null, formula: 'noi_best / asking_price * 100', basis: 'NOI' },
  { subject: 'cap_rate_worst', unit: '%', extract: o => o.capRate?.worst ?? null, formula: 'noi_worst / asking_price * 100', basis: 'NOI' },
  { subject: 'irr_5y_base', unit: '%', extract: o => o.irr5Year?.base ?? null, formula: 'irr(cfs, hold=5)' },
  { subject: 'irr_5y_best', unit: '%', extract: o => o.irr5Year?.best ?? null, formula: 'irr(cfs_best, hold=5)' },
  { subject: 'irr_5y_worst', unit: '%', extract: o => o.irr5Year?.worst ?? null, formula: 'irr(cfs_worst, hold=5)' },
  { subject: 'yield_on_cost', unit: '%', extract: o => o.yieldOnCost ?? null, formula: 'annual_gross / asking_price * 100', basis: 'GPI' },
  { subject: 'price_per_sqm', unit: '원/㎡', extract: o => o.pricePerSqm ?? null, formula: 'asking_price / total_area' },
  { subject: 'price_per_pyeong', unit: '원/평', extract: o => o.pricePerPyeong ?? null, formula: 'price_per_sqm * 3.30578' },
  { subject: 'equity_required', unit: '억원', extract: o => o.equityRequired ?? null, formula: 'total_cost - deposit - loan' },
  { subject: 'leveraged_yield', unit: '%', extract: o => o.leveragedYield ?? null, formula: '(noi - interest) / equity * 100' },
  { subject: 'land_value_ratio', unit: '%', extract: o => o.landValueRatio ?? null, formula: 'land_price_total / asking_price * 100' },
  { subject: 'total_acquisition_cost', unit: '억원', extract: o => o.totalAcquisitionCostBil ?? null, formula: 'asking + tax + broker_fee' },
  { subject: 'negative_leverage', unit: '', extract: o => o.negativeLeverage === true ? 1 : o.negativeLeverage === false ? 0 : null },
];

const FORMULA_VERSION = 'v1.0.0';

export interface FinancialCalcOutput {
  claims: Claim[];
  outputs: FinancialOutputs;
  violations: string[];
}

// ── FinancialCalculator ──

export class FinancialCalculator {
  private registry: ClaimRegistry;
  private asOfDate: string;

  constructor(registry: ClaimRegistry, asOfDate?: string) {
    this.registry = registry;
    this.asOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);
  }

  /**
   * financials.ts의 결정론적 계산을 실행하고, 결과를 Claim으로 등록합니다.
   *
   * @returns 등록된 Claim 배열 + 원본 FinancialOutputs + 위반 목록
   */
  calculate(inputs: FinancialInputs): FinancialCalcOutput {
    // 1. 기존 결정론적 계산 실행
    const outputs = calculateFinancials(inputs);
    const posture = inputs.posture ?? 'income';

    // 2. 결과를 Claim으로 변환·등록
    const specs = this.getSpecsForPosture(posture);
    const claims: Claim[] = [];
    const allViolations: string[] = [];

    // 입력값도 Claim으로 등록 (역추적 가능하게)
    const inputClaims = this.registerInputClaims(inputs);
    claims.push(...inputClaims);

    for (const spec of specs) {
      const value = spec.extract(outputs);
      if (value === null) continue;

      const inputClaimIds: Record<string, string> = {};
      // 입력 Claim 중 관련 항목 연결
      for (const ic of inputClaims) {
        inputClaimIds[ic.subject] = ic.id;
      }

      const deductions = spec.deductionsExtract?.(outputs, inputs);

      const calc: Calculation | undefined = spec.formula ? {
        id: randomUUID(),
        formula: spec.formula,
        formulaVersion: FORMULA_VERSION,
        inputs: inputClaimIds,
        result: value,
        basis: spec.basis,
        deductions: deductions,
      } : undefined;

      if (calc) {
        const calcViolations = validateCalculation(calc);
        allViolations.push(...calcViolations);
      }

      const hasUserOpex = inputs.opexRatioPct != null || (inputs.mgmtFeeTotalManwon ?? 0) > 0;

      const claimOpts: CreateClaimOptions = {
        subject: spec.subject,
        value: value,
        unit: spec.unit,
        evidence: [{
          sourceId: 'derived',
          asOf: this.asOfDate,
          excerpt: `${spec.formula ?? spec.subject} = ${value}`,
        }],
        provenance: 'derived',
        asOf: this.asOfDate,
        status: 'reconciled', // 결정론적 계산 → 자동 reconciled
        calculation: calc,
      };

      // G38: NOI 기반인데 운영비 없으면 차단
      if (spec.basis === 'NOI' && !hasUserOpex && spec.subject.startsWith('cap_rate')) {
        claimOpts.status = 'unverified';
        claimOpts.evidence[0].excerpt = '운영비 미입력 — 가정치 기반 계산';
      }

      const { claim, violations } = this.registry.register(claimOpts);
      claims.push(claim);
      allViolations.push(...violations);
    }

    return { claims, outputs, violations: allViolations };
  }

  /** 입력값을 Claim으로 등록 — 역추적 기반 */
  private registerInputClaims(inputs: FinancialInputs): Claim[] {
    const claims: Claim[] = [];
    const register = (subject: string, value: number | null, unit: string, provenance: 'broker' | 'public_api' | 'assumed') => {
      if (value === null || value === undefined) return;
      const { claim } = this.registry.register({
        subject,
        value,
        unit,
        evidence: [{ sourceId: provenance, asOf: this.asOfDate }],
        provenance,
        asOf: this.asOfDate,
        status: 'unverified',
      });
      claims.push(claim);
    };

    register('asking_price', inputs.purchasePriceKrw, '원', 'broker');
    register('monthly_rent_total', inputs.monthlyRentKrw ?? null, '원/월', 'broker');
    register('total_area_sqm', inputs.totalAreaSqm ?? null, '㎡', 'public_api');
    register('land_area_sqm', inputs.platAreaSqm ?? null, '㎡', 'public_api');
    register('opex_ratio_pct', inputs.opexRatioPct ?? null, '%', inputs.opexRatioPct != null ? 'broker' : 'assumed');
    register('vacancy_rate_pct', inputs.vacancyRatePct ?? null, '%', 'assumed');
    register('total_deposit', inputs.totalDepositManwon ? inputs.totalDepositManwon * 10000 : null, '원', 'broker');
    register('loan_amount', inputs.loanAmountManwon ? inputs.loanAmountManwon * 10000 : null, '원', 'broker');

    return claims;
  }

  /** 포스처별 Claim 스펙 반환 */
  private getSpecsForPosture(_posture: string): FinancialClaimSpec[] {
    // Phase 1: income 전용. 나머지 포스처는 P1에서 확장
    return INCOME_CLAIM_SPECS;
  }
}
