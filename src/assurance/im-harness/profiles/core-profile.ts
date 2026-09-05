import type { HarnessEvaluator } from '../evaluator';

export function registerCorePackageProfile(evaluator: HarnessEvaluator): void {
  evaluator.registerRule('P-CORE-PACKAGE', {
    gateId: 'GATE-CORE-NON-NEGATIVE',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: '매매가 및 연면적 양수 검증',
    check: async (ctx: any) => {
      const isValid = ctx.commercial?.askingPriceKrw > 0 && ctx.physical?.grossFloorAreaSqm > 0;
      return {
        status: isValid ? 'PASS' : 'FAIL',
        observed: { price: ctx.commercial?.askingPriceKrw, area: ctx.physical?.grossFloorAreaSqm },
        expected: '양수(Positive number)',
        reason: isValid ? '수치 정상 범위' : '매매가 또는 연면적이 0 이하',
      };
    },
  });

  evaluator.registerRule('P-CORE-PACKAGE', {
    gateId: 'GATE-DENOMINATOR-CONSISTENCY',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: 'G37: 4대 면적 분모 일관성 검사',
    check: async (ctx: any) => {
      const isConsistent = ctx.unitPrices?.pricePerPyeongLand !== ctx.unitPrices?.pricePerPyeongGross;
      return {
        status: isConsistent ? 'PASS' : 'WARN',
        observed: ctx.unitPrices,
        expected: '대지 및 연면적 단가 독립 산출',
        reason: isConsistent ? '단가 분모 일치' : '대지면적과 연면적 단가 동일 의심 (단층 건물 제외)',
      };
    },
  });

  evaluator.registerRule('P-CORE-PACKAGE', {
    gateId: 'GATE-RENTROLL-DISCREPANCY',
    version: '1.0.0',
    severity: 'BLOCKER',
    description: 'G35: 렌트롤과 마스터 총액 불일치 검사',
    check: async (ctx: any) => {
      const hasDiscrepancy = ctx.rentroll?.hasG35Discrepancy === true;
      return {
        status: hasDiscrepancy ? 'FAIL' : 'PASS',
        observed: ctx.rentroll?.discrepancyNote ?? '일치',
        expected: '1% 이내 일치',
        reason: hasDiscrepancy ? ctx.rentroll?.discrepancyNote : '렌트롤 총액 검증 통과',
      };
    },
  });
}
