export interface GateContext {
  capRateResults: Array<{ basis: string }>;
  totalReturnScenarios: Array<{ label: string; totalReturnPct: number }>;
  parcels: Array<{ exclusions: Array<{ area: number; affectsFAR: boolean }>; area: number }>;
  leaseUnits: Array<{ convertedDeposit: number; opposingPower: boolean; opposingPowerEvidence?: string }>;
  disclosureDcf: string;
  disclosureIrr: string;
  termExplanationExists: boolean;
  effectiveLandArea: number;
  effectiveFAR: number;
  calculatedEffectiveFAR: number;
  
  // Phase 4 Additional Fields
  salePrice?: number;
  area?: number;
  address?: string;
  dataGrade?: string;
  crossValidationPassed?: boolean;
  hasHallucination?: boolean;
  piiRemoved?: boolean;
  hasRiskExpression?: boolean;
  imJudgeScore?: number;
  threeAxisConfirmed?: boolean;
  dcfGradeGatePassed?: boolean;
  leaseActConfirmed?: boolean;
  renewalRightConfirmed?: boolean;
  mixedUseConfirmed?: boolean;
  illegalArchitectureConfirmed?: boolean;
}

export interface LegacyGateResult {
  code: string;
  passed: boolean;
  message: string;
  blocksPublish: boolean;
}

export function runGatesV02(ctx: GateContext): LegacyGateResult[] {
  const results: LegacyGateResult[] = [];
  // G10: all cap rates have basis label
  const g10 = ctx.capRateResults.every(r => !!r.basis);
  results.push({ code: 'G10', passed: g10, message: g10 ? 'Cap Rate 기준 표기 확인' : 'Cap Rate 기준 미표기 값 있음', blocksPublish: !g10 });
  // G11: downside scenario included in total return
  const g11 = ctx.totalReturnScenarios.some(s => s.totalReturnPct < 0 || s.label.includes('하락'));
  results.push({ code: 'G11', passed: g11, message: g11 ? '하방 시나리오 포함' : '상승 시나리오만 있음 — 발행 차단', blocksPublish: !g11 });
  // G12: exclusion area <= land area, effective FAR matches
  const totalExclusion = ctx.parcels.reduce((s, p) => s + p.exclusions.filter(e => e.affectsFAR).reduce((a, e) => a + e.area, 0), 0);
  const totalLand = ctx.parcels.reduce((s, p) => s + p.area, 0);
  const g12 = totalExclusion <= totalLand && Math.abs(ctx.effectiveFAR - ctx.calculatedEffectiveFAR) < 0.01;
  results.push({ code: 'G12', passed: g12, message: g12 ? '제척·용적률 검증 통과' : '제척 합계 > 대지 합계 또는 유효 용적률 불일치', blocksPublish: !g12 });
  // G13: lease act check
  const g13 = ctx.leaseUnits.every(u => u.opposingPower === true || (u.opposingPower === false && !!u.opposingPowerEvidence));
  results.push({ code: 'G13', passed: g13, message: g13 ? '상임법 판정 정합' : '대항력=false에 근거 없음 — 발행 차단', blocksPublish: !g13 });
  // G14: DCF/IRR exposure requires term explanations
  const needsTerms = ctx.disclosureDcf !== 'hidden' || ctx.disclosureIrr !== 'hidden';
  const g14 = !needsTerms || ctx.termExplanationExists;
  results.push({ code: 'G14', passed: g14, message: g14 ? '용어 해설 확인' : 'DCF/IRR 노출 시 용어 해설 누락', blocksPublish: !g14 });
  return results;
}

// Phase 4 New Gates
export interface GateDefinition {
  id: string;
  label: string;
  severity: 'block' | 'warn';
  check: (ctx: GateContext) => boolean;
}

export interface GateResult {
  id: string;
  label: string;
  severity: 'block' | 'warn';
  passed: boolean;
}

export interface GateReport {
  allPassed: boolean;
  blocked: boolean;
  results: GateResult[];
  failedBlocks: GateResult[];
  failedWarns: GateResult[];
}

export const PUBLISH_GATES: GateDefinition[] = [
  { id: 'G01', label: '매각가 존재', severity: 'block', check: (ctx) => ctx.salePrice !== undefined && ctx.salePrice > 0 },
  { id: 'G02', label: '면적 존재', severity: 'block', check: (ctx) => ctx.area !== undefined && ctx.area > 0 },
  { id: 'G03', label: '주소 존재', severity: 'block', check: (ctx) => !!ctx.address },
  { id: 'G04', label: '등급 D 아님', severity: 'block', check: (ctx) => ctx.dataGrade !== 'D' },
  { id: 'G05', label: '숫자 교차검증 통과', severity: 'block', check: (ctx) => ctx.crossValidationPassed === true },
  { id: 'G06', label: '할루시네이션 없음', severity: 'block', check: (ctx) => ctx.hasHallucination === false },
  { id: 'G07', label: 'PII 제거 완료', severity: 'block', check: (ctx) => ctx.piiRemoved === true },
  { id: 'G08', label: '위험 표현 없음', severity: 'block', check: (ctx) => ctx.hasRiskExpression === false },
  { id: 'G09', label: 'IM Judge 3.0 이상', severity: 'warn', check: (ctx) => (ctx.imJudgeScore ?? 0) >= 3.0 },
  { id: 'G10', label: '3축 분류 확정', severity: 'block', check: (ctx) => ctx.threeAxisConfirmed === true },
  { id: 'G11', label: 'DCF 등급 게이트', severity: 'warn', check: (ctx) => ctx.dcfGradeGatePassed === true },
  { id: 'G12', label: 'Cap Rate basis 명기', severity: 'warn', check: (ctx) => ctx.capRateResults.every(r => !!r.basis) },
  { id: 'G13', label: '임대차 법령 확정', severity: 'warn', check: (ctx) => ctx.leaseActConfirmed === true },
  { id: 'G14', label: '갱신요구권 확인', severity: 'warn', check: (ctx) => ctx.renewalRightConfirmed === true },
  { id: 'G15', label: '혼합 용도 법령 확정', severity: 'warn', check: (ctx) => ctx.mixedUseConfirmed === true },
  { id: 'G16', label: '위반건축물 확인', severity: 'warn', check: (ctx) => ctx.illegalArchitectureConfirmed === true }
];

export function runPublishGates(ctx: GateContext): GateReport {
  const results = PUBLISH_GATES.map(g => ({
    id: g.id,
    label: g.label,
    severity: g.severity,
    passed: g.check(ctx)
  }));
  const failedBlocks = results.filter(r => r.severity === 'block' && !r.passed);
  const failedWarns = results.filter(r => r.severity === 'warn' && !r.passed);

  return {
    allPassed: failedBlocks.length === 0 && failedWarns.length === 0,
    blocked: failedBlocks.length > 0,
    results,
    failedBlocks,
    failedWarns
  };
}
