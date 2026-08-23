// src/domain/building/gates/deterministic-gates.ts
// 5대 결정적 품질 게이트 (Deterministic Hard Gates)
// Spec: Phase 5.1 (G19, C19, G21, G15, G16)

import type { IMCore } from '@/types/im-core';
import type { GateCode } from '@/types/im-core';
import { assertBounds, validateTextBudgets, TEXT_LIMITS } from '../mobile-im/pptx/text-budget';

export interface GateEvaluationContext {
  core: IMCore;
  renderedElements?: Array<{ x: number; y: number; w: number; h: number }>;
  textSnippets?: Array<{ type: string; text: string }>;
}

export interface GateCheckResult {
  code: GateCode;
  label: string;
  passed: boolean;
  severity: 'block' | 'warn';
  message: string;
  diff?: Record<string, any>;
}

export interface GateEvaluationReport {
  allPassed: boolean;
  blocked: boolean;
  strictMode: boolean;
  results: GateCheckResult[];
  failedBlocks: GateCheckResult[];
  failedWarns: GateCheckResult[];
}

/**
 * G19: 표지/요약표 합계 = 상세 원장(Ledger) 합산 검증 (오차 0원 일치)
 */
export function checkG19(core: IMCore): GateCheckResult {
  const isStrict = process.env.GATE_STRICT_MODE !== 'false';
  const summaryDeposit = core.equity.deposit ?? 0;
  const ledgerDeposit = core.leases.reduce((acc, l) => acc + (l.depositKrw ?? 0), 0);

  const summaryMonthly = (core.anchors?.monthlyRentTotalManwon ?? 0) * 10000;
  const ledgerMonthly = core.leases.reduce((acc, l) => acc + (l.monthlyRentKrw ?? 0), 0);

  // 렌트롤이 있는 경우에만 합산 일치 검증
  if (core.leases.length > 0) {
    const depositDiff = Math.abs(summaryDeposit - ledgerDeposit);
    const monthlyDiff = Math.abs(summaryMonthly - ledgerMonthly);

    const depositMatches = summaryDeposit === 0 || depositDiff === 0;
    const monthlyMatches = summaryMonthly === 0 || monthlyDiff === 0;

    const passed = depositMatches && monthlyMatches;
    return {
      code: 'G19',
      label: '표지/요약표와 임대차 원장 금액 합계 일치',
      passed,
      severity: isStrict ? 'block' : 'warn',
      message: passed
        ? '표지 금액과 원장 합계가 정확히 일치합니다.'
        : `표지 금액과 원장 합계 불일치 (보증금 차이: ${depositDiff.toLocaleString()}원, 월세 차이: ${monthlyDiff.toLocaleString()}원)`,
      diff: { summaryDeposit, ledgerDeposit, depositDiff, summaryMonthly, ledgerMonthly, monthlyDiff },
    };
  }

  return {
    code: 'G19',
    label: '표지/요약표와 임대차 원장 금액 합계 일치',
    passed: true,
    severity: isStrict ? 'block' : 'warn',
    message: '원장 데이터 없음 (검증 스킵)',
  };
}

/**
 * C19: 대장 연면적 vs 호실 임대면적 합계 (±2% 오차 허용치 검증)
 */
export function checkC19(core: IMCore): GateCheckResult {
  const isStrict = process.env.GATE_STRICT_MODE !== 'false';
  const totalGrossSqm = core.physical.totalGrossAreaSqm;
  const ledgerTotalAreaSqm = core.leases.reduce((acc, l) => acc + (l.leaseAreaSqm ?? 0), 0);

  if (totalGrossSqm && totalGrossSqm > 0 && ledgerTotalAreaSqm > 0) {
    const ratio = Math.abs(ledgerTotalAreaSqm - totalGrossSqm) / totalGrossSqm;
    // 임대면적은 전용면적 합계일 수 있으므로, 임대면적 > 연면적 * 1.02 초과 시 오류
    const passed = ledgerTotalAreaSqm <= totalGrossSqm * 1.02;

    return {
      code: 'C19',
      label: '대장 연면적 대비 임대면적 무결성 (±2% 한도)',
      passed,
      severity: isStrict ? 'block' : 'warn',
      message: passed
        ? `대장 연면적(${totalGrossSqm}㎡) 대비 임대면적 합계(${ledgerTotalAreaSqm.toFixed(1)}㎡) 정합`
        : `임대면적 합계(${ledgerTotalAreaSqm.toFixed(1)}㎡)가 대장 연면적(${totalGrossSqm}㎡)을 2% 이상 초과합니다.`,
      diff: { totalGrossSqm, ledgerTotalAreaSqm, discrepancyRatioPct: (ratio * 100).toFixed(2) },
    };
  }

  return {
    code: 'C19',
    label: '대장 연면적 대비 임대면적 무결성 (±2% 한도)',
    passed: true,
    severity: isStrict ? 'block' : 'warn',
    message: '면적 비교 데이터 불충분 (검증 스킵)',
  };
}

/**
 * G21: 첨부 문서/도면 참조 위치 유효성 검증
 */
export function checkG21(core: IMCore): GateCheckResult {
  const isStrict = process.env.GATE_STRICT_MODE !== 'false';
  const docs = core.attachedDocs || [];

  if (docs.length > 0) {
    const allVerified = docs.every(d => d.verified === true && !!d.fileUrl);
    return {
      code: 'G21',
      label: '첨부 공부/문서 위치 및 검증 상태 확인',
      passed: allVerified,
      severity: isStrict ? 'block' : 'warn',
      message: allVerified
        ? `첨부 문서 ${docs.length}건 검증 완료`
        : `미검증되거나 URL이 누락된 첨부 문서가 존재합니다.`,
      diff: { docCount: docs.length, unverifiedCount: docs.filter(d => !d.verified).length },
    };
  }

  return {
    code: 'G21',
    label: '첨부 공부/문서 위치 및 검증 상태 확인',
    passed: true,
    severity: isStrict ? 'block' : 'warn',
    message: '첨부 문서 없음',
  };
}

/**
 * G15: 텍스트 예산 및 필수 섹션 누락 검증
 */
export function checkG15(context: GateEvaluationContext): GateCheckResult {
  const isStrict = process.env.GATE_STRICT_MODE !== 'false';
  const texts = context.textSnippets || [];
  const warnings = validateTextBudgets(texts);

  const passed = warnings.length === 0;
  return {
    code: 'G15' as GateCode,
    label: '텍스트 예산 한도 및 필수 섹션 누락 검증',
    passed,
    severity: isStrict ? 'block' : 'warn',
    message: passed
      ? '모든 텍스트가 예산 범위 내에 있습니다.'
      : `텍스트 예산 초과 항목 ${warnings.length}건: ${warnings.slice(0, 2).join('; ')}`,
    diff: { warnings },
  };
}

/**
 * G16: 좌표 무결성 검증 (인쇄 안전 마진 12.713 x 6.75 초과 여부)
 */
export function checkG16(context: GateEvaluationContext): GateCheckResult {
  const isStrict = process.env.GATE_STRICT_MODE !== 'false';
  const elements = context.renderedElements || [];

  const violations: string[] = [];
  for (let i = 0; i < elements.length; i++) {
    const verdict = assertBounds(elements[i]);
    if (!verdict.valid && verdict.error) {
      violations.push(`Element #${i}: ${verdict.error}`);
    }
  }

  const passed = violations.length === 0;
  return {
    code: 'G16' as GateCode,
    label: 'PPTX 슬라이드 인쇄 안전 좌표 무결성 검증 (12.713 × 6.75)',
    passed,
    severity: isStrict ? 'block' : 'warn',
    message: passed
      ? '모든 슬라이드 객체가 안전 바운더리 내에 위치합니다.'
      : `좌표 경계 초과 객체 ${violations.length}건: ${violations.slice(0, 2).join('; ')}`,
    diff: { violations },
  };
}

/**
 * 5대 결정적 품질 게이트 종합 실행기
 */
export function runDeterministicGates(context: GateEvaluationContext): GateEvaluationReport {
  const isStrict = process.env.GATE_STRICT_MODE !== 'false';

  const results: GateCheckResult[] = [
    checkG19(context.core),
    checkC19(context.core),
    checkG21(context.core),
    checkG15(context),
    checkG16(context),
  ];

  const failedBlocks = results.filter(r => r.severity === 'block' && !r.passed);
  const failedWarns = results.filter(r => r.severity === 'warn' && !r.passed);

  return {
    allPassed: failedBlocks.length === 0 && failedWarns.length === 0,
    blocked: failedBlocks.length > 0,
    strictMode: isStrict,
    results,
    failedBlocks,
    failedWarns,
  };
}
