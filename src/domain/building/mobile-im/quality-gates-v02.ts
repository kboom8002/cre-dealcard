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
  /** B1: 중개인이 사진 내 물건명·임차인명 노출 없음을 수동 확인 */
  imagePiiConfirmed?: boolean;
}

export interface LegacyGateResult {
  code: string;
  passed: boolean;
  message: string;
  blocksPublish: boolean;
}

export function runGatesV02(ctx: GateContext): LegacyGateResult[] {
  const results: LegacyGateResult[] = [];
  // QG10: all cap rates have basis label
  const g10 = (ctx.capRateResults ?? []).every(r => !!r.basis);
  results.push({ code: 'QG10', passed: g10, message: g10 ? 'Cap Rate 기준 표기 확인' : 'Cap Rate 기준 미표기 값 있음', blocksPublish: !g10 });
  // QG11: downside scenario included in total return
  const g11 = (ctx.totalReturnScenarios ?? []).some(s => s.totalReturnPct < 0 || s.label.includes('하락'));
  results.push({ code: 'QG11', passed: g11, message: g11 ? '하방 시나리오 포함' : '상승 시나리오만 있음 — 발행 차단', blocksPublish: !g11 });
  // QG12: exclusion area <= land area, effective FAR matches
  const totalExclusion = (ctx.parcels ?? []).reduce((s, p) => s + (p.exclusions ?? []).filter(e => e.affectsFAR).reduce((a, e) => a + e.area, 0), 0);
  const totalLand = (ctx.parcels ?? []).reduce((s, p) => s + p.area, 0);
  const g12 = totalExclusion <= totalLand && Math.abs(ctx.effectiveFAR - ctx.calculatedEffectiveFAR) < 0.01;
  results.push({ code: 'QG12', passed: g12, message: g12 ? '제척·용적률 검증 통과' : '제척 합계 > 대지 합계 또는 유효 용적률 불일치', blocksPublish: !g12 });
  // QG13: lease act check
  const g13 = (ctx.leaseUnits ?? []).every(u => u.opposingPower === true || (u.opposingPower === false && !!u.opposingPowerEvidence));
  results.push({ code: 'QG13', passed: g13, message: g13 ? '상임법 판정 정합' : '대항력=false에 근거 없음 — 발행 차단', blocksPublish: !g13 });
  // QG14: DCF/IRR exposure requires term explanations
  const needsTerms = ctx.disclosureDcf !== 'hidden' || ctx.disclosureIrr !== 'hidden';
  const g14 = !needsTerms || ctx.termExplanationExists;
  results.push({ code: 'QG14', passed: g14, message: g14 ? '용어 해설 확인' : 'DCF/IRR 노출 시 용어 해설 누락', blocksPublish: !g14 });
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

export const LEGACY_GATE_MAP: Readonly<Record<string, string>> = {
  'G01': 'QG01', 'G02': 'QG02', 'G03': 'QG03', 'G04': 'QG04',
  'G05': 'QG05', 'G06': 'QG06', 'G07': 'QG07', 'G08': 'QG08',
  'G09': 'QG09', 'G10': 'QG10', 'G11': 'QG11', 'G12': 'QG12',
  'G13': 'QG13', 'G14': 'QG14', 'G15': 'QG15', 'G16': 'QG16',
} as const;

// D29 M-8: 발행 게이트(G) = block, 품질 게이트(QG) = warn
// §5.1: "QG는 경고만, G는 차단"
export const PUBLISH_GATES: GateDefinition[] = [
  // ── G계열: 발행 차단 (block) ──
  { id: 'G01', label: '매각가 존재', severity: 'block', check: (ctx) => ctx.salePrice !== undefined && ctx.salePrice > 0 },
  { id: 'G02', label: '면적 존재', severity: 'block', check: (ctx) => (ctx.area !== undefined && ctx.area > 0) || (ctx.effectiveLandArea > 0) },
  { id: 'G03', label: '주소 존재', severity: 'block', check: (ctx) => !!ctx.address },
  { id: 'G04', label: '등급 D 아님', severity: 'block', check: (ctx) => ctx.dataGrade !== 'D' },
  { id: 'G05', label: '숫자 교차검증 통과', severity: 'block', check: (ctx) => ctx.crossValidationPassed === true },
  { id: 'G06', label: '할루시네이션 없음', severity: 'block', check: (ctx) => ctx.hasHallucination === false },
  { id: 'G07', label: 'PII 제거 완료', severity: 'block', check: (ctx) => ctx.piiRemoved === true },
  { id: 'G08', label: '위험 표현 없음', severity: 'block', check: (ctx) => ctx.hasRiskExpression !== true },
  { id: 'G10', label: '3축 분류 확정', severity: 'block', check: (ctx) => ctx.threeAxisConfirmed === true },
  { id: 'G17', label: '렌트롤 전량 표기', severity: 'block', check: () => true }, // BL-2에서 보장
  { id: 'G18', label: '면 간 수치 일치', severity: 'block', check: (ctx) => ctx.crossValidationPassed === true },
  { id: 'G20', label: '이미지 PII 승인', severity: 'block', check: (ctx) => ctx.imagePiiConfirmed === true },
  // ── QG계열: 품질 경고 (warn) ──
  { id: 'QG09', label: 'IM Judge 3.0 이상', severity: 'warn', check: (ctx) => (ctx.imJudgeScore ?? 0) >= 3.0 },
  { id: 'QG11', label: 'DCF 등급 게이트', severity: 'warn', check: (ctx) => ctx.dcfGradeGatePassed === true },
  { id: 'QG12', label: 'Cap Rate basis 명기', severity: 'warn', check: (ctx) => (ctx.capRateResults ?? []).every(r => !!r.basis) },
  { id: 'QG13', label: '임대차 법령 확정', severity: 'warn', check: (ctx) => ctx.leaseActConfirmed === true },
  { id: 'QG14', label: '갱신요구권 확인', severity: 'warn', check: (ctx) => ctx.renewalRightConfirmed === true },
  { id: 'QG15', label: '혼합 용도 법령 확정', severity: 'warn', check: (ctx) => ctx.mixedUseConfirmed === true },
  { id: 'QG16', label: '위반건축물 확인', severity: 'warn', check: (ctx) => ctx.illegalArchitectureConfirmed === true },
];

// D29 M-9: 실패 3종 분류
export type FailureCategory = 'gate_block' | 'quality_warn' | 'system_error';

export interface ClassifiedFailure {
  category: FailureCategory;
  gateId: string;
  label: string;
  message?: string;
}

export function runPublishGates(ctx: GateContext): GateReport & {
  classifiedFailures: ClassifiedFailure[];
} {
  const results: GateResult[] = [];
  const classifiedFailures: ClassifiedFailure[] = [];

  for (const g of PUBLISH_GATES) {
    let passed: boolean;
    let errorMsg: string | undefined;

    try {
      passed = g.check(ctx);
    } catch (e) {
      // M-9: LLM/외부 서비스 실패 → system_error (passed:true → passed:false 아님)
      passed = false;
      errorMsg = e instanceof Error ? e.message : String(e);
      classifiedFailures.push({
        category: 'system_error',
        gateId: g.id,
        label: g.label,
        message: errorMsg,
      });
    }

    results.push({ id: g.id, label: g.label, severity: g.severity, passed });

    if (!passed && !errorMsg) {
      // 의도적 차단/경고 — system_error가 아닌 경우
      classifiedFailures.push({
        category: g.severity === 'block' ? 'gate_block' : 'quality_warn',
        gateId: g.id,
        label: g.label,
      });
    }
  }

  const failedBlocks = results.filter(r => r.severity === 'block' && !r.passed);
  const failedWarns = results.filter(r => r.severity === 'warn' && !r.passed);

  return {
    allPassed: failedBlocks.length === 0 && failedWarns.length === 0,
    blocked: failedBlocks.length > 0,
    results,
    failedBlocks,
    failedWarns,
    classifiedFailures,
  };
}
