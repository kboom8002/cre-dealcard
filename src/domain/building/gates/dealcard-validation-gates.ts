/**
 * @file dealcard-validation-gates.ts
 * @description D29 M-7: 딜카드 단계 검증 게이트 X01~X05
 * 딜카드 ③ 직후 실행. X05 위반(필지 합 불일치)은 P01~P04를 무너뜨리므로 차단.
 */

export interface DealCardValidationResult {
  gateId: string;
  label: string;
  passed: boolean;
  severity: 'block' | 'warn';
  detail?: string;
}

export interface DealCardValidationInput {
  /** 주소 존재 여부 */
  hasAddress: boolean;
  /** PNU 유효성 */
  hasPnu: boolean;
  /** 3축 분류 (자산유형·권역·가격대) 확정 여부 */
  threeAxisConfirmed: boolean;
  /** 등기·대장 데이터 수신 완료 */
  registryDataReceived: boolean;
  /** 필지 합계 (m²) — 등기부상 */
  registryParcelAreaSqm: number;
  /** 필지 합계 (m²) — 입력/공공데이터 */
  inputParcelAreaSqm: number;
  /** 필지 합 허용 오차 (m², 기본 0.01) */
  parcelTolerance?: number;
}

/**
 * D29 M-7: X01~X05 딜카드 단계 검증 실행.
 * 딜카드 ③ 직후, IM 생성 시작 전에 호출합니다.
 */
export function runDealCardValidation(input: DealCardValidationInput): {
  allPassed: boolean;
  blocked: boolean;
  results: DealCardValidationResult[];
} {
  const tolerance = input.parcelTolerance ?? 0.01;

  const results: DealCardValidationResult[] = [
    {
      gateId: 'X01',
      label: '주소 존재',
      severity: 'block',
      passed: input.hasAddress,
      detail: input.hasAddress ? undefined : '주소 미입력',
    },
    {
      gateId: 'X02',
      label: 'PNU 유효',
      severity: 'block',
      passed: input.hasPnu,
      detail: input.hasPnu ? undefined : 'PNU 코드 미확인',
    },
    {
      gateId: 'X03',
      label: '3축 분류 확정',
      severity: 'warn',
      passed: input.threeAxisConfirmed,
      detail: input.threeAxisConfirmed ? undefined : '자산유형·권역·가격대 미확정',
    },
    {
      gateId: 'X04',
      label: '등기·대장 데이터 수신',
      severity: 'warn',
      passed: input.registryDataReceived,
      detail: input.registryDataReceived ? undefined : '공적 장부 데이터 미수신',
    },
    {
      gateId: 'X05',
      label: '필지 합 일치',
      severity: 'block',
      passed: Math.abs(input.registryParcelAreaSqm - input.inputParcelAreaSqm) <= tolerance,
      detail: Math.abs(input.registryParcelAreaSqm - input.inputParcelAreaSqm) > tolerance
        ? `필지 합 불일치: 등기 ${input.registryParcelAreaSqm}m² ≠ 입력 ${input.inputParcelAreaSqm}m² (허용 ${tolerance}m²)`
        : undefined,
    },
  ];

  const blocked = results.some(r => r.severity === 'block' && !r.passed);
  const allPassed = results.every(r => r.passed);

  return { allPassed, blocked, results };
}
