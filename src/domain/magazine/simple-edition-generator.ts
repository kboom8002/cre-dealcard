/**
 * src/domain/magazine/simple-edition-generator.ts — 간단 모드(골디락스 미니멈 포맷) 1회 요약 생성기
 *
 * 원칙:
 *  1. 중개인이 작성한 '이번 주 한마디(comment)'와 선택된 매물·뉴스·시장 지표를 바탕으로
 *     callMagazineLlm 1회 호출로 { headline, briefing, marketTemp, keywords } 를 생성한다.
 *  2. 프롬프트에 "입력에 없는 수치·기관명·법령·사례는 절대 만들지 말 것" 규칙을 강제한다.
 *  3. 생성된 헤드라인·브리핑을 runMagazineQualityGate 로 검증하여 미출처 수치가 있거나,
 *     LLM 호출 실패 / Mock 응답 / 스키마 불일치 시 예외를 던져 발행을 막지 않고
 *     deriveFallbackHeadline + deriveFallbackBriefing 결정론적 폴백을 반환한다 (사용자 결정 #2).
 */

import { z } from 'zod';
import {
  callMagazineLlm,
  parseLlmJson,
  sanitizeReaderText,
  zReaderText,
} from '@/lib/magazine/llm-guard';
import {
  deriveFallbackBriefing,
  deriveFallbackHeadline,
  SIMPLE_DEAL_LIMIT,
  SIMPLE_NEWS_LIMIT,
} from '@/lib/magazine/simple-format';
import { runMagazineQualityGate } from './quality-gate';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('simple-edition-generator');

const VALID_MARKET_TEMPS = ['적극 매수', '선별 매수', '관망', '조정 대기', '위기 경계'] as const;

export interface SimpleDealInput {
  title?: string;
  assetType?: string;
  address?: string;
  price?: string | number;
}

export interface SimpleKeyStatInput {
  label: string;
  value: string;
}

export interface SimpleEditionSummaryInput {
  comment: string;
  brokerName?: string | null;
  marketTemp?: string | null;
  deals?: SimpleDealInput[];
  newsTitles?: string[];
  keyStats?: SimpleKeyStatInput[];
}

export interface SimpleEditionSummaryResult {
  headline: string;
  briefing: string;
  marketTemp: string | null;
  keywords: string[];
  usedFallback: boolean;
  reason?: string;
}

const simpleLlmOutputSchema = z.object({
  headline: zReaderText(4, 80),
  briefing: zReaderText(10, 1500),
  marketTemp: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional(),
});

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeMarketTemp(v: unknown, fallback?: string | null): string | null {
  const s = str(v);
  if ((VALID_MARKET_TEMPS as readonly string[]).includes(s)) return s;
  const fb = str(fallback);
  if ((VALID_MARKET_TEMPS as readonly string[]).includes(fb)) return fb;
  return fb || null;
}

function deriveFallbackKeywords(input: SimpleEditionSummaryInput): string[] {
  const out: string[] = [];
  const temp = str(input.marketTemp);
  if (temp) out.push(temp);
  for (const d of (input.deals ?? []).slice(0, SIMPLE_DEAL_LIMIT)) {
    const asset = str(d?.assetType);
    if (asset && !out.includes(asset)) out.push(asset);
  }
  return out.slice(0, 3);
}

function buildFallbackResult(
  input: SimpleEditionSummaryInput,
  reason: string,
): SimpleEditionSummaryResult {
  const deals = Array.isArray(input.deals) ? input.deals.slice(0, SIMPLE_DEAL_LIMIT) : [];
  const newsTitles = Array.isArray(input.newsTitles)
    ? input.newsTitles.map((t) => str(t)).filter(Boolean).slice(0, SIMPLE_NEWS_LIMIT)
    : [];
  const marketTemp = normalizeMarketTemp(null, input.marketTemp);

  return {
    headline: deriveFallbackHeadline(input.comment, input.brokerName),
    briefing: deriveFallbackBriefing({
      comment: input.comment,
      dealCount: deals.length,
      newsTitles,
      marketTemp,
    }),
    marketTemp,
    keywords: deriveFallbackKeywords(input),
    usedFallback: true,
    reason,
  };
}

/**
 * 간단 모드 에디션의 3줄 요약과 헤드라인을 생성한다.
 * LLM 실패·Mock·품질게이트 불합격 시에도 절대 throw 하지 않고 결정론적 폴백을 반환한다.
 */
export async function generateSimpleEditionSummary(
  input: SimpleEditionSummaryInput,
): Promise<SimpleEditionSummaryResult> {
  const cleanComment = str(input.comment);
  if (!cleanComment) {
    return buildFallbackResult(input, 'EMPTY_COMMENT');
  }

  const deals = Array.isArray(input.deals) ? input.deals.slice(0, SIMPLE_DEAL_LIMIT) : [];
  const newsTitles = Array.isArray(input.newsTitles)
    ? input.newsTitles.map((t) => str(t)).filter(Boolean).slice(0, SIMPLE_NEWS_LIMIT)
    : [];
  const keyStats = Array.isArray(input.keyStats)
    ? input.keyStats
        .filter((k) => k && (str(k.label) || str(k.value)))
        .slice(0, 6)
    : [];

  const factLines: string[] = [`[중개사 이번 주 한마디]\n${cleanComment}`];
  if (str(input.brokerName)) {
    factLines.push(`중개사 이름: ${str(input.brokerName)}`);
  }
  if (str(input.marketTemp)) {
    factLines.push(`현장 시장 온도: ${str(input.marketTemp)}`);
  }
  if (deals.length > 0) {
    const dealDesc = deals
      .map((d, idx) => {
        const parts = [str(d.title), str(d.assetType), str(d.address), d.price !== undefined ? String(d.price) : '']
          .map((p) => p.trim())
          .filter(Boolean);
        return parts.length > 0 ? `매물 ${idx + 1}: ${parts.join(' / ')}` : null;
      })
      .filter((x): x is string => Boolean(x));
    factLines.push(`[추천 매물 총 ${deals.length}건]\n${dealDesc.join('\n')}`);
  }
  if (newsTitles.length > 0) {
    factLines.push(`[이번 주 주요 뉴스 총 ${newsTitles.length}건]\n${newsTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`);
  }
  if (keyStats.length > 0) {
    factLines.push(`[시장 지표]\n${keyStats.map((k) => `- ${str(k.label)}: ${str(k.value)}`).join('\n')}`);
  }

  const systemPrompt = `당신은 대한민국 상업용 부동산(CRE)·빌딩 전문 중개사의 주간 매거진 편집 비서입니다.
중개사가 직접 작성한 '이번 주 한마디'와 제공된 매물·뉴스·지표 목록만을 바탕으로, 독자(건물주·매수자)가 30초 안에 읽을 수 있는 표지 헤드라인과 3줄 핵심 요약(briefing)을 다듬어 주세요.

[절대 준수 규칙]
1. 입력에 없는 수치·기관명·법령·사례는 절대 만들지 말 것. (입력에 없는 공실률, 수익률, 금리 수치, 거래 금액, 건수 등을 추측하거나 지어내면 즉시 폐기됩니다.)
2. headline: 중개사의 한마디 핵심을 살려 담백하고 신뢰감 있게 작성 (10~42자).
3. briefing: 2~3문장(줄바꿈 포함 가능)의 정중한 존댓말(~합니다/~입니다)로 요약.
4. marketTemp: "적극 매수", "선별 매수", "관망", "조정 대기", "위기 경계" 중 하나 (입력에 시장 온도가 있으면 그대로 유지).
5. keywords: 입력에 등장한 핵심 키워드 최대 3개 배열.

반드시 아래 JSON 객체 형식으로만 응답하세요:
{"headline": "...", "briefing": "...", "marketTemp": "선별 매수", "keywords": ["키워드1", "키워드2"]}`;

  try {
    const response = await callMagazineLlm({
      label: 'simple.summary',
      tier: 'terra',
      temperature: 0.3,
      maxTokens: 700,
      json: true,
      systemPrompt,
      userPrompt: factLines.join('\n\n'),
    });

    if (response.isMock) {
      log.warn('[SimpleEditionGenerator] Mock 응답 감지 → 결정론적 폴백 사용');
      return buildFallbackResult(input, 'MOCK_RESPONSE');
    }

    const rawJson = parseLlmJson(response.content);
    const parsed = simpleLlmOutputSchema.safeParse(rawJson);
    if (!parsed.success) {
      log.warn('[SimpleEditionGenerator] 스키마 불일치 → 결정론적 폴백 사용', parsed.error.issues);
      return buildFallbackResult(input, 'SCHEMA_MISMATCH');
    }

    const out = parsed.data;
    const resolvedTemp = normalizeMarketTemp(out.marketTemp, input.marketTemp);

    // 품질 게이트: 입력에 없는 수치가 본문/헤드라인에 등장하면 폴백으로 전환
    const sourceData: Record<string, unknown> = {
      comment: cleanComment,
      deals,
      dealCountText: `${deals.length}건`,
      newsTitles,
      newsCountText: `${newsTitles.length}건`,
      keyStats,
    };
    const qg = runMagazineQualityGate(`${out.headline}\n${out.briefing}`, sourceData, {
      marketTemp: resolvedTemp,
    });
    if (!qg.passed) {
      log.warn('[SimpleEditionGenerator] 품질 게이트 불합격 → 결정론적 폴백 사용', qg.failureReasons);
      return buildFallbackResult(input, `QUALITY_GATE_FAILED:${qg.failureReasons.join(',')}`);
    }

    const cleanedKeywords = Array.isArray(out.keywords)
      ? out.keywords
          .map((k) => sanitizeReaderText(k))
          .filter((k) => k.length > 0 && k.length <= 20)
          .slice(0, 3)
      : deriveFallbackKeywords(input);

    return {
      headline: out.headline,
      briefing: out.briefing,
      marketTemp: resolvedTemp,
      keywords: cleanedKeywords.length > 0 ? cleanedKeywords : deriveFallbackKeywords(input),
      usedFallback: false,
    };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? (err instanceof Error ? err.message : 'LLM_ERROR');
    log.warn('[SimpleEditionGenerator] LLM 요약 실패 → 결정론적 폴백 사용:', code);
    return buildFallbackResult(input, String(code));
  }
}
