/**
 * @module PitchWarmup
 * @description Generates structured pitch warmup messages for buyer outreach.
 * Creates personalized snippets based on deal archetype and buyer intent match.
 * @see SDD §6 S1-T13
 */

import type { DealArchetype } from './archetype-classifier';

export interface PitchContext {
  archetype: string;
  areaSignal: string;
  assetType: string;
  capRatePct?: number;
  noiKrw?: number;
  askingPriceKrw?: number;
  dataGrade?: string;
  buyerName?: string;
  buyerBudgetRange?: string;
}

export interface PitchSnippet {
  hook: string;        // Opening attention-getter
  body: string;        // Core value proposition
  callToAction: string; // Next step
  channel: 'kakao' | 'sms' | 'email';
}

const ARCHETYPE_HOOKS: Record<string, string> = {
  STABLE_INCOME: '안정적인 수익형 매물이 나왔습니다',
  VALUE_ADD: '밸류애드 기회가 있는 매물을 소개합니다',
  DEVELOPMENT_SITE: '개발 가능 부지를 안내드립니다',
  SAFE_EVICTION_DEV: '안전한 명도 후 개발 가능 매물입니다',
  INSTITUTIONAL_LOGI: '기관투자 적합 물류센터 매물입니다',
  NPL_AUCTION: '경매/NPL 투자 기회를 안내드립니다',
  RETAIL_STREET: '상가 스트릿 매물을 소개합니다',
  OFFICE_REPOSITIONING: '오피스 리포지셔닝 기회 매물입니다',
  MIXED_USE: '복합용도 매물을 안내드립니다',
  LAND_BANKING: '토지 뱅킹 기회를 소개합니다',
};

/**
 * Generates a pitch warmup snippet for buyer outreach.
 */
export function generatePitchSnippet(ctx: PitchContext): PitchSnippet {
  const hook = ARCHETYPE_HOOKS[ctx.archetype] || '새로운 매물을 안내드립니다';
  const buyerGreeting = ctx.buyerName ? `${ctx.buyerName}님, ` : '';
  const priceInfo = ctx.askingPriceKrw
    ? ` (${(ctx.askingPriceKrw / 100_000_000).toFixed(0)}억원대)`
    : '';
  const yieldInfo = ctx.capRatePct
    ? `, 수익률 ${ctx.capRatePct.toFixed(1)}%`
    : '';

  return {
    hook: `${buyerGreeting}${hook}`,
    body: `${ctx.areaSignal} ${ctx.assetType}${priceInfo}${yieldInfo}`,
    callToAction: '블라인드 티저를 확인해 보시겠습니까?',
    channel: 'kakao',
  };
}

/**
 * Formats a pitch snippet into a message string.
 */
export function formatPitchMessage(snippet: PitchSnippet): string {
  return `${snippet.hook}\n\n${snippet.body}\n\n${snippet.callToAction}`;
}
