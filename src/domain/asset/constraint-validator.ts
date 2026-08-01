/**
 * @module ConstraintValidator
 * @description Validates asset attributes against SHACL-style domain rules.
 * Enforces ontology constraints C01-C13.
 * @see SDD §5 S0-T4
 */

/**
 * Represents a single constraint violation rule match.
 */
export interface ConstraintViolation {
  /** The specific rule ID that was violated (e.g., C01, C02) */
  ruleId: string;       // C01, C02, etc.
  /** Severity level of the violation */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable message explaining the violation */
  message: string;
  /** The attribute field that caused the violation */
  field: string;
}

/**
 * Result of the constraint validation process.
 */
export interface ConstraintValidationResult {
  /** True if no errors were found (warnings are allowed) */
  isValid: boolean;
  /** List of all constraint violations */
  violations: ConstraintViolation[];
  /** Total count of error severity violations */
  errorsCount: number;
  /** Total count of warning severity violations */
  warningsCount: number;
}

const ZONING_MAX_FAR: Record<string, number> = {
  '제1종전용주거지역': 100,
  '제2종전용주거지역': 150,
  '제1종일반주거지역': 200,
  '제2종일반주거지역': 250,
  '제3종일반주거지역': 300,
  '준주거지역': 500,
  '중심상업지역': 1500,
  '일반상업지역': 1300,
  '근린상업지역': 900,
  '유통상업지역': 1100,
  '전용공업지역': 200,
  '일반공업지역': 350,
  '준공업지역': 400,
};

/**
 * Validates asset attributes against domain constraint rules.
 * Validates rules:
 * - C01: Floor Area must be positive
 * - C02: FAR must be within zoning limits
 * - C03: Asking Price must be positive
 * - C04: Gross Annual Income cannot exceed Asking Price
 * - C12: Leverage Over-limit (Loan + Deposit > Price * 1.1)
 * 
 * @param attrs - The key-value map of asset attributes to validate
 * @returns Validation result with lists of violations and status
 * @see SDD §5 S0-T4
 */
export function validateAssetConstraints(attrs: Record<string, unknown>): ConstraintValidationResult {
  const violations: ConstraintViolation[] = [];

  // C01: Floor Area positive check
  const floorArea = Number(attrs.totalFloorAreaPyung || 0);
  if (attrs.totalFloorAreaPyung != null && floorArea <= 0) {
    violations.push({
      ruleId: 'C01',
      severity: 'error',
      message: '연면적은 0보다 커야 합니다.',
      field: 'totalFloorAreaPyung',
    });
  }

  // C02: FAR within zoning limit
  const zoning = String(attrs.zoningRegion || '');
  const far = Number(attrs.farPct || 0);
  const maxFar = ZONING_MAX_FAR[zoning];
  if (maxFar && far > maxFar) {
    violations.push({
      ruleId: 'C02',
      severity: 'warning',
      message: `${zoning} 법정 용적률(${maxFar}%)을 초과(${far}%)하였습니다.`,
      field: 'farPct',
    });
  }

  // C03: Asking Price positive check
  const askingPrice = Number(attrs.askingPriceKrw || 0);
  if (attrs.askingPriceKrw != null && askingPrice <= 0) {
    violations.push({
      ruleId: 'C03',
      severity: 'error',
      message: '매각 희망가는 0원보다 커야 합니다.',
      field: 'askingPriceKrw',
    });
  }

  // C04: Annual Income <= Asking Price
  const grossIncome = Number(attrs.grossAnnualIncomeKrw || 0);
  if (askingPrice > 0 && grossIncome > askingPrice) {
    violations.push({
      ruleId: 'C04',
      severity: 'error',
      message: '연간 임대 수입이 매매가를 초과할 수 없습니다.',
      field: 'grossAnnualIncomeKrw',
    });
  }

  // C05: Cap Rate reasonability check (not negative, not absurdly high)
  if (askingPrice > 0 && grossIncome > 0) {
    const impliedCapRate = (grossIncome / askingPrice) * 100;
    if (impliedCapRate > 30) {
      violations.push({
        ruleId: 'C05',
        severity: 'warning',
        message: `산출 수익률(${impliedCapRate.toFixed(1)}%)이 비정상적으로 높습니다. 입력값을 확인해 주세요.`,
        field: 'grossAnnualIncomeKrw',
      });
    }
  }

  // C06: Building Age sanity check
  const buildYear = Number(attrs.buildYear || 0);
  const currentYear = new Date().getFullYear();
  if (buildYear > 0 && (buildYear > currentYear + 2 || buildYear < 1900)) {
    violations.push({
      ruleId: 'C06',
      severity: 'error',
      message: `건축년도(${buildYear})가 유효 범위를 벗어났습니다.`,
      field: 'buildYear',
    });
  }

  // C07: Floors count sanity check
  const floors = Number(attrs.floorsAboveGround || 0);
  if (floors > 0 && floors > 200) {
    violations.push({
      ruleId: 'C07',
      severity: 'warning',
      message: `지상 층수(${floors}층)가 비정상적으로 높습니다.`,
      field: 'floorsAboveGround',
    });
  }

  // C08: Deposit exceeds asking price
  const totalDep = Number(attrs.totalDepositKrw || 0);
  if (askingPrice > 0 && totalDep > askingPrice) {
    violations.push({
      ruleId: 'C08',
      severity: 'error',
      message: '보증금 합계가 매매가를 초과합니다.',
      field: 'totalDepositKrw',
    });
  }

  // C09: Vacancy rate out of range (0-100%)
  const vacancy = Number(attrs.vacancyRatePct ?? -1);
  if (vacancy >= 0 && vacancy > 100) {
    violations.push({
      ruleId: 'C09',
      severity: 'error',
      message: `공실률(${vacancy}%)이 100%를 초과합니다.`,
      field: 'vacancyRatePct',
    });
  }

  // C10: OPEX ratio out of range (0-100%)
  const opex = Number(attrs.opexRatioPct ?? -1);
  if (opex >= 0 && opex > 80) {
    violations.push({
      ruleId: 'C10',
      severity: 'warning',
      message: `운영비율(${opex}%)이 비정상적으로 높습니다 (80% 초과).`,
      field: 'opexRatioPct',
    });
  }

  // C11: DCF eligibility (Grade A only) — cross-ref with grade-engine
  const dataGrade = String(attrs.dataGrade || '');
  if (dataGrade && dataGrade !== 'A' && attrs.dcfRequested) {
    violations.push({
      ruleId: 'C11',
      severity: 'error',
      message: `DCF 분석은 데이터 등급 A인 자산만 가능합니다. 현재 등급: ${dataGrade}`,
      field: 'dataGrade',
    });
  }

  // C12: Leverage Over-limit Check (Loan + Deposit > Price * 1.1)
  const loan = Number(attrs.loanAmountKrw || 0);
  const deposit = Number(attrs.totalDepositKrw || 0);
  if (askingPrice > 0 && loan + deposit > askingPrice * 1.1) {
    violations.push({
      ruleId: 'C12',
      severity: 'warning',
      message: '선순위 대출 및 보증금 합계가 매매가의 110%를 초과하는 과도 레버리지 상태입니다.',
      field: 'loanAmountKrw',
    });
  }

  // C13: Address fallback reliability guard (S1-T15)
  const addrSource = String(attrs.addressSource || '');
  const addrConfidence = Number(attrs.addressConfidence || 1);
  if (addrSource === 'fallback' || addrSource === 'manual_input') {
    if (addrConfidence < 0.8) {
      violations.push({
        ruleId: 'C13',
        severity: 'warning',
        message: `주소 신뢰도(${(addrConfidence * 100).toFixed(0)}%)가 낮습니다. 주소를 재확인해 주세요.`,
        field: 'address',
      });
    }
  }

  const errorsCount = violations.filter((v) => v.severity === 'error').length;
  const warningsCount = violations.filter((v) => v.severity === 'warning').length;

  return {
    isValid: errorsCount === 0,
    violations,
    errorsCount,
    warningsCount,
  };
}
