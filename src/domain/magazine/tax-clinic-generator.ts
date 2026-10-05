/**
 * Tax Clinic Generator — "세대 전환 전략(세무 클리닉)" 코너 (C-02, M2-15, M2-20, T3-02, T3-LLM-1, DC-13)
 *
 * 설계 원칙
 *  - 세무사 사칭·"감수" 표기·"추천" 표기 금지. 출력은 항상 일반 정보 + 면책(disclaimer).
 *  - 세율·공제·기간 등 숫자는 `tax-rules-2026.ts` 의 사실에서만 인용한다. 출력에 그 밖의 숫자가 있으면 폐기(null).
 *  - 하드코딩 폴백 없음: Mock/LLM 실패·검증 실패·근거 부족이면 **null** → 호출부는 섹션을 생략한다.
 *  - 브로커 비의존: 같은 주(weekLabel)에는 모든 브로커가 같은 콘텐츠를 쓴다. 프로세스 내 캐시로 주 1회만 생성한다
 *    (cron 이 한 번의 호출 안에서 브로커를 순회하면 LLM 호출 1회).
 */
import { z } from 'zod';
import { createModuleLogger } from '@/lib/logger';
import { callMagazineJson, MagazineLlmError, serializeForPrompt, zReaderText } from '@/lib/magazine/llm-guard';
import { currentWeekLabel } from '@/lib/magazine/kst';
import { runMagazineQualityGate } from './quality-gate';
import {
  TAX_DISCLAIMER,
  TAX_RULES_AS_OF,
  TAX_RULES_REVIEW_STATUS,
  TAX_RULES_YEAR,
  pickTaxTopic,
  taxSourceLabel,
  type TaxTopic,
} from './tax-rules-2026';

const log = createModuleLogger('tax-clinic-generator');

export interface TaxClinicOption {
  name: string;
  description: string;
  expectedTaxInfo: string;
}

export interface TaxClinicScenario {
  title: string;
  scenario: string;
  comparison: {
    optionA: TaxClinicOption;
    optionB: TaxClinicOption;
  };
  conclusion: string;
  /** 근거 조문 + 기준일. "감수" 표현 금지. */
  source: string;
  /** 필수 면책 문구 — 렌더 시 반드시 함께 표시 */
  disclaimer: string;
  /** 규정 기준 연도 / 사실 확인 기준일 */
  taxYear: number;
  asOf: string;
  /** 'UNREVIEWED' 이면 전문가 검수 전 일반 정보 */
  reviewStatus: 'UNREVIEWED' | 'REVIEWED';
  topicId: string;
  weekLabel: string;
}

const optionSchema = z.object({
  name: zReaderText(2, 60),
  description: zReaderText(10, 400),
  expectedTaxInfo: zReaderText(10, 500),
});

const outputSchema = z.object({
  title: zReaderText(5, 80),
  scenario: zReaderText(20, 500),
  comparison: z.object({ optionA: optionSchema, optionB: optionSchema }),
  conclusion: zReaderText(20, 500),
});

/** 독자 문구에 나오면 안 되는 표현 (사칭·허위 감수·추천 단정) */
const FORBIDDEN_PHRASES: readonly RegExp[] = [
  /감수/,
  /세무사(?:입니다|로서|의 결론)/,
  /수석\s*세무사/,
  /제휴\s*세무/,
  /\(\s*추천\s*\)/,
  /추천\s*(?:드립니다|합니다)/,
  /반드시\s*유리/,
  /무조건/,
];

const SYSTEM_PROMPT = `당신은 상업용 부동산 건물주를 위한 매거진 편집자입니다. 세무사가 아니며, 세무 자문을 하지 않습니다.
"세대 전환 전략" 코너에 들어갈 **일반 정보** 비교 글을 작성하세요.

작성 방식:
- 제공된 "법령 사실"만 사용해 두 가지 대안을 중립적으로 비교하십시오. 어느 한쪽을 추천하거나 우열을 단정하지 마십시오.
- 가상의 인물·건물 가격·세액 계산 예시를 만들지 마십시오. 시나리오는 "일반적인 경우" 수준의 상황 설명만 쓰십시오.
- 법령 사실에 있는 숫자(세율·기간·금액)만 그대로 인용하고, 그 밖의 숫자는 쓰지 마십시오.
- "필수 언급 사항"을 결론에 반드시 포함하십시오.
- "감수", "세무사", "전문가 결론" 같은 표현을 쓰지 마십시오.
결과를 JSON으로만 반환:
{"title": "...", "scenario": "...", "comparison": {"optionA": {"name": "...", "description": "...", "expectedTaxInfo": "..."}, "optionB": {"name": "...", "description": "...", "expectedTaxInfo": "..."}}, "conclusion": "..."}`;

// ── 주 1회 공용 캐시 (브로커 비의존) ──────────────────────────────────

interface CacheEntry {
  value: TaxClinicScenario | null;
  at: number;
}
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const sharedCache = new Map<string, CacheEntry>();

/** 테스트 전용 */
export function __resetTaxClinicCacheForTests(): void {
  sharedCache.clear();
}

function containsForbidden(text: string): string | null {
  for (const re of FORBIDDEN_PHRASES) {
    if (re.test(text)) return re.source;
  }
  return null;
}

/**
 * 브로커 비의존 주간 세무 클리닉 생성. 실패·근거 불충분이면 null (섹션 생략).
 *
 * @param weekLabel   ISO 주차 라벨 (기본: 현재 주, KST). 주제는 이 값으로 결정적으로 선택된다.
 * @param marketContext 시장 요약(선택). 입력에 있는 숫자만 인용할 수 있다.
 */
export async function generateSharedTaxClinic(
  weekLabel: string = currentWeekLabel(),
  marketContext?: string | null,
): Promise<TaxClinicScenario | null> {
  const cacheKey = `${weekLabel}:${marketContext ? 'ctx' : 'noctx'}`;
  const hit = sharedCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS && hit.value) return hit.value;

  const topic = pickTaxTopic(weekLabel);
  const result = await generateForTopic(topic, weekLabel, marketContext ?? null);
  // 실패(null)는 캐시하지 않는다 — 다음 호출에서 재시도.
  if (result) sharedCache.set(cacheKey, { value: result, at: Date.now() });
  return result;
}

/**
 * 하위호환 진입점. 이전 시그니처(`generateTaxClinicScenario(marketContext?)`)를 유지하되 이제 null 을 반환할 수 있다.
 */
export async function generateTaxClinicScenario(
  marketContext?: string | null,
  opts: { weekLabel?: string } = {},
): Promise<TaxClinicScenario | null> {
  return generateSharedTaxClinic(opts.weekLabel ?? currentWeekLabel(), marketContext);
}

async function generateForTopic(
  topic: TaxTopic,
  weekLabel: string,
  marketContext: string | null,
): Promise<TaxClinicScenario | null> {
  if (topic.facts.length === 0) return null; // 근거 없는 주제는 생성하지 않는다

  const factsText = topic.facts.map((f, i) => `${i + 1}. ${f.text} (근거: ${f.ref})`).join('\n');
  const userPrompt = [
    `주제: ${topic.title}`,
    `대안 A 이름: ${topic.optionAName}`,
    `대안 B 이름: ${topic.optionBName}`,
    `법령 사실 (기준일 ${TAX_RULES_AS_OF}):\n${factsText}`,
    `필수 언급 사항: ${topic.mustMention.join(' / ')}`,
    marketContext ? `시장 요약(참고): ${marketContext.slice(0, 400)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const { data, response } = await callMagazineJson(
      { label: 'tax-clinic', systemPrompt: SYSTEM_PROMPT, userPrompt, tier: 'terra', temperature: 0.3, maxTokens: 900 },
      outputSchema,
    );
    if (response.isMock) {
      log.warn('[tax-clinic] Mock 응답 — 폐기');
      return null;
    }

    const fullText = [
      data.title,
      data.scenario,
      data.comparison.optionA.description,
      data.comparison.optionA.expectedTaxInfo,
      data.comparison.optionB.description,
      data.comparison.optionB.expectedTaxInfo,
      data.conclusion,
    ].join('\n');

    const forbidden = containsForbidden(fullText);
    if (forbidden) {
      log.warn(`[tax-clinic] 금지 표현 감지(${forbidden}) — 폐기`);
      return null;
    }

    // 출력의 모든 숫자는 법령 사실(+시장 요약)에 있어야 한다. (날조 세율·금액 차단)
    const qg = runMagazineQualityGate(fullText, { facts: topic.facts.map((f) => f.text), marketContext: marketContext ?? '' });
    if (!qg.passed) {
      log.warn('[tax-clinic] 근거 없는 수치 감지 — 폐기', qg.issues.slice(0, 3));
      return null;
    }

    // 필수 언급 사항 누락 확인: 이월과세 등 전제 누락(M2-15)은 결론에 핵심어가 있어야 통과
    const mentionKeywords = topic.mustMention.flatMap((m) => m.match(/이월과세|양도소득세|시가|법인전환|임대업|증여세/g) ?? []);
    if (mentionKeywords.length > 0 && !mentionKeywords.some((k) => fullText.includes(k))) {
      log.warn('[tax-clinic] 필수 전제 누락 — 폐기');
      return null;
    }

    return {
      title: data.title,
      scenario: data.scenario,
      comparison: {
        optionA: { ...data.comparison.optionA, name: topic.optionAName },
        optionB: { ...data.comparison.optionB, name: topic.optionBName },
      },
      conclusion: data.conclusion,
      source: taxSourceLabel(topic),
      disclaimer: TAX_DISCLAIMER,
      taxYear: TAX_RULES_YEAR,
      asOf: TAX_RULES_AS_OF,
      reviewStatus: TAX_RULES_REVIEW_STATUS,
      topicId: topic.id,
      weekLabel,
    };
  } catch (err) {
    // Mock/실패/스키마 불일치 → 섹션 생략. 하드코딩 폴백 없음.
    if (err instanceof MagazineLlmError) {
      log.warn(`[tax-clinic] 생성 건너뜀(${err.code}): ${err.message}`);
    } else {
      log.error('[tax-clinic] 예기치 않은 오류', err instanceof Error ? err.message : serializeForPrompt(err));
    }
    return null;
  }
}
