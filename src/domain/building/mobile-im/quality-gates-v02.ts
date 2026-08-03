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
}

export interface GateResult {
  code: string;
  passed: boolean;
  message: string;
  blocksPublish: boolean;
}

export function runGatesV02(ctx: GateContext): GateResult[] {
  const results: GateResult[] = [];
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
