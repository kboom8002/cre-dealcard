export interface GateContext {
  imContent: string;
  data: any;
}

export interface GateResult {
  gateId: string;
  passed: boolean;
  message?: string;
}

export function runGatesV02(ctx: GateContext): GateResult[] {
  const results: GateResult[] = [];
  
  // G10: Check if location section is complete
  results.push({
    gateId: 'G10',
    passed: ctx.imContent.includes('입지 분석'),
    message: ctx.imContent.includes('입지 분석') ? undefined : '입지 분석 섹션이 누락되었습니다.'
  });
  
  // G11: Check if lease details are present
  results.push({
    gateId: 'G11',
    passed: ctx.imContent.includes('임대차'),
    message: ctx.imContent.includes('임대차') ? undefined : '임대차 정보가 누락되었습니다.'
  });
  
  // G12: Check if yield/financials are present
  results.push({
    gateId: 'G12',
    passed: ctx.imContent.includes('%') || ctx.imContent.includes('수익률'),
    message: (ctx.imContent.includes('%') || ctx.imContent.includes('수익률')) ? undefined : '수익률 지표가 누락되었습니다.'
  });
  
  // G13: Check zoning/regulatory mention
  results.push({
    gateId: 'G13',
    passed: ctx.imContent.includes('용도지역'),
    message: ctx.imContent.includes('용도지역') ? undefined : '용도지역 정보가 누락되었습니다.'
  });
  
  // G14: Check risk factors mention
  results.push({
    gateId: 'G14',
    passed: ctx.imContent.includes('리스크') || ctx.imContent.includes('위험'),
    message: (ctx.imContent.includes('리스크') || ctx.imContent.includes('위험')) ? undefined : '리스크/위험 요인 분석이 누락되었습니다.'
  });
  
  return results;
}
