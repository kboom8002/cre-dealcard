/**
 * @file src/app/api/broker/deal-card/ai-copy/route.ts
 * @description 딜카드 한 줄 제목(<=22자) + 장점 3줄 및 예비 후보(총 6~8개) LLM 생성 API — TaskFlow TF8.
 *
 * 파이프라인 (응답 형태는 하위 호환: { ok, result: { headline?, points?, pointCandidates? }, warnings? } + source):
 *  1. buildDealCardCopyPrompt — 역할/단계/근거/6대 소구축/출력계약/few-shot/자체검증 프롬프트 (FactBook = 중개사 입력만)
 *  2. callLLM(json_object) → safeParseAIResponse(DealCardCopyLLMOutputSchema) — 실패 시 핀포인트 교정 재시도 1회
 *  3. 결정적 후처리: 근거 없는 숫자 제거 → 블라인드 정리 → 칩 중복 제거 → 22자 어절 경계 교정
 *  4. 엄격 검증(DealCardCopyStrictOutputSchema) — 위반/누락 줄은 입력 기반 결정적 문구로 보충 (최소 6개 후보 보장)
 */
import { NextRequest, NextResponse } from 'next/server';
import { callLLM, LLMMockNotAllowedError } from '@/ai/llm-client';
import { getModel } from '@/ai/model-selector';
import { isDeterministicLLMMode } from '@/ai/llm-determinism';
import { safeParseAIResponse } from '@/ai/utils/ai-response-parser';
import {
  buildDealCardCopyPrompt,
  buildDealCardCopyRepairPrompt,
  type DealCardCopyMode,
} from '@/ai/prompts/broker-deal-card';
import {
  DealCardCopyLLMOutputSchema,
  DealCardCopyStrictOutputSchema,
  type DealCardCopyLLMOutput,
} from '@/ai/schemas/broker-deal-card';
import { requireBroker } from '@/lib/auth-guard';
import {
  cleanBlindPoints,
  stripSubjectiveNumericSpin,
  validateBlindPoints,
} from '@/lib/deal-card/blind-guard';
import { getMarketDefaults } from '@/domain/ontology/market-data-provider';
import { getCapRateBenchmark } from '@/domain/ontology/market-defaults';
import {
  DEAL_CARD_POINT_AXES,
  dealCardAiCopyRequestSchema,
  type DealCardAiCopyResponse,
  type DealCardPointAxis,
  type DealCardPointCandidate,
} from '@/lib/deal-card/ai-copy-schema';
import {
  DEAL_CARD_LINE_MAX,
  GENERIC_POINT_FALLBACKS,
  deriveDealCardHeadline,
  isCompleteDealCardLine,
  pickFreshDealCardHeadline,
  repairDealCardLine,
  repairDealCardPoints,
  stripChipRepetition,
  stripUngroundedNumbers,
} from '@/lib/deal-card/copy-limits';
import { getFieldStrengthTagsForPosture } from '@/lib/deal-card/field-strength-tags';
import { POSTURE_LABELS } from '@/lib/ux/lexicon';
import { humanizeSeniorBrokerTone } from '@/domain/building/mobile-im/broker-sales-tone-lexicon';
import { createModuleLogger } from '@/lib/logger';
import {
  buildAiUnavailable503Response,
  enforceBrokerAiQuota,
  isLLMMockNotAllowedError,
} from '@/lib/ai-quota-guard';
import { toApiError } from '@/lib/api-error';

const log = createModuleLogger('deal-card-ai-copy');

export const maxDuration = 60;

const WARN_NUMBERS = '입력 정보에 없는 숫자는 자동으로 제외했어요.';
const WARN_FALLBACK = 'AI 연결이 원활하지 않아 입력하신 내용으로 추천 문구를 채웠어요. 확인 후 고쳐 주세요.';
const WARN_REPAIRED = `${DEAL_CARD_LINE_MAX}자를 넘거나 끝맺음이 어색한 문구는 자동으로 다듬었어요.`;

const AXIS_SET = new Set<string>(DEAL_CARD_POINT_AXES);

function normalizePointAxis(raw: unknown, fallbackIdx: number): DealCardPointAxis {
  if (typeof raw === 'string' && AXIS_SET.has(raw.trim())) {
    return raw.trim() as DealCardPointAxis;
  }
  return DEAL_CARD_POINT_AXES[fallbackIdx % DEAL_CARD_POINT_AXES.length];
}

function inferAxisFromText(text: string, fallbackIdx: number): DealCardPointAxis {
  if (/수익률|월세|임대수익|평균\s*상회|수지/.test(text)) return 'yield';
  if (/만실|임차|입주|명도|카페|은행|병원|의원|약국|프랜차이즈|세입자/.test(text)) return 'tenant';
  if (/역\s*도보|역세권|상권|배후|접근성|유동/.test(text)) return 'location';
  if (/코너|각지|대로변|접면|가시성|간판|m\s|양면/.test(text)) return 'scarcity';
  if (/신축|준공|리모델링|올수리|승강기|주차|층고|테라스|자주식/.test(text)) return 'building';
  if (/사옥|용적률|증축|토지|평당|개발|전환|활용/.test(text)) return 'value';
  return DEAL_CARD_POINT_AXES[fallbackIdx % DEAL_CARD_POINT_AXES.length];
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function requiredFieldViolations(mode: DealCardCopyMode, out: DealCardCopyLLMOutput): string[] {
  const v: string[] = [];
  if ((mode === 'headline' || mode === 'both') && !out.headline?.trim()) v.push('headline 누락');
  if ((mode === 'points' || mode === 'both') && (!out.points || out.points.length < 3)) v.push('points 3개 누락');
  return v;
}

async function requestCopy(
  systemPrompt: string,
  userPrompt: string,
  mode: DealCardCopyMode,
): Promise<DealCardCopyLLMOutput | null> {
  const temperature = isDeterministicLLMMode() ? 0 : mode === 'headline' ? 0.7 : 0.4;
  let prompt = userPrompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const llmResult = await callLLM(
      {
        systemPrompt,
        userPrompt: prompt,
        model: getModel('terra'),
        temperature,
        maxTokens: 1024,
        responseFormat: 'json_object',
      },
      { allowMock: false },
    );
    if ((llmResult as { isMock?: boolean }).isMock) return null;
    const content = typeof llmResult.content === 'string' ? llmResult.content.trim() : '';
    if (!content) return null;
    const parsed = safeParseAIResponse(content, DealCardCopyLLMOutputSchema);
    const violations = parsed.success ? requiredFieldViolations(mode, parsed.data) : [parsed.error];
    if (parsed.success && violations.length === 0) return parsed.data;
    log.warn(`[deal-card/ai-copy] 출력 계약 위반 (attempt ${attempt + 1}): ${violations.join(' / ')}`);
    prompt = `${userPrompt}\n\n${buildDealCardCopyRepairPrompt(content, violations)}`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, 'BAD_REQUEST', '요청 형식이 올바르지 않습니다.');
  }

  const parsed = dealCardAiCopyRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? '입력 정보를 확인해 주세요.');
  }

  const quotaErr = await enforceBrokerAiQuota(req, auth.user?.id ?? '', 'deal_card_ai_copy');
  if (quotaErr) return quotaErr;

  try {
    const input = parsed.data;
    const defaults = await getMarketDefaults().catch(() => null);
    const regionText = String(input.region || '');
    const sigunguBench =
      defaults?.capRateBenchmarks
        ? Object.entries(defaults.capRateBenchmarks).find(([k]) => regionText.includes(k))?.[1]
        : getCapRateBenchmark(regionText);

    const sanitizedFacts = input.facts
      ? {
          ...input.facts,
          ...(sigunguBench && Number.isFinite(sigunguBench)
            ? { regionalBenchmarkYieldPct: sigunguBench }
            : {}),
          ...(input.facts.memoSummary
            ? {
                memoSummary:
                  cleanBlindPoints([input.facts.memoSummary])[0]?.trim() || "",
              }
            : {}),
        }
      : sigunguBench && Number.isFinite(sigunguBench)
      ? { regionalBenchmarkYieldPct: sigunguBench }
      : undefined;
    const postureInfo = POSTURE_LABELS[input.posture];
    const avoidList = Array.from(
      new Set(
        [input.currentHeadline, ...(input.avoidHeadlines || [])]
          .map((s) => String(s ?? '').trim())
          .filter(Boolean),
      ),
    );
    const avoidPointsList = Array.from(
      new Set((input.avoidPoints || []).map((s) => String(s ?? '').trim()).filter(Boolean)),
    );
    const prompt = buildDealCardCopyPrompt({
      mode: input.mode,
      postureTitle: postureInfo.title,
      postureSubtitle: postureInfo.subtitle,
      region: input.region,
      use: input.use,
      area: input.area,
      priceBand: input.priceBand,
      currentHeadline: input.currentHeadline,
      avoidHeadlines: avoidList,
      currentPoints: input.currentPoints,
      avoidPoints: avoidPointsList,
      candidateCount: input.candidateCount,
      facts: sanitizedFacts,
    });

    const warnings = new Set<string>();
    let source: 'llm' | 'fallback' = 'llm';

    let llmOut: DealCardCopyLLMOutput | null = null;
    try {
      llmOut = await requestCopy(prompt.systemPrompt, prompt.userPrompt, input.mode);
    } catch (error: unknown) {
      if (error instanceof LLMMockNotAllowedError || isLLMMockNotAllowedError(error)) {
        log.warn('[deal-card/ai-copy] Mock 응답 거부:', error instanceof Error ? error.message : error);
      } else {
        log.error('[deal-card/ai-copy] LLM Error:', error);
      }
      llmOut = null;
    }
    if (!llmOut) {
      source = 'fallback';
      warnings.add(WARN_FALLBACK);
    }

    /** 결정적 후처리: 근거 → 블라인드 → (제목) 칩 중복 → 18자 교정 → 엄격 검증. 실패 시 '' */
    const finalizeLine = (rawLine: string | undefined, isHeadline: boolean): string => {
      const text = String(rawLine ?? '').trim();
      if (!text) return '';
      const { cleaned, stripped } = stripUngroundedNumbers(text, prompt.factContext);
      if (stripped.length > 0) warnings.add(WARN_NUMBERS);
      let line = humanizeSeniorBrokerTone(cleanBlindPoints([cleaned || ''])[0] || '');
      line = stripSubjectiveNumericSpin(line);
      if (isHeadline) line = stripChipRepetition(line, { region: input.region, use: input.use });
      const repaired = repairDealCardLine(line);
      if (repaired !== line.trim()) warnings.add(WARN_REPAIRED);
      const blind = validateBlindPoints([repaired]);
      const safe = blind.isValid ? repaired : repairDealCardLine(blind.cleanedPoints[0] || '');
      return isCompleteDealCardLine(safe) ? safe : '';
    };

    const currentRepaired = repairDealCardPoints(
      (input.currentPoints || []).map((p) => stripUngroundedNumbers(p, prompt.factContext).cleaned),
    );
    const result: DealCardAiCopyResponse['result'] = {};

    if (input.mode === 'points' || input.mode === 'both') {
      const targetCandidateCount = Math.min(8, Math.max(6, input.candidateCount ?? 6));
      const usedKeys = new Set<string>();
      const candidatePool: Array<{ text: string; axis: DealCardPointAxis; preferredRec: boolean }> = [];

      const pushCandidate = (rawText: string | undefined, rawAxis: unknown, preferredRec: boolean) => {
        const finalized = finalizeLine(rawText, false);
        if (!finalized) return;
        const key = finalized.replace(/\s+/g, '');
        if (usedKeys.has(key)) return;
        usedKeys.add(key);
        const idx = candidatePool.length;
        const axis = rawAxis && AXIS_SET.has(String(rawAxis).trim())
          ? normalizePointAxis(rawAxis, idx)
          : inferAxisFromText(finalized, idx);
        candidatePool.push({ text: finalized, axis, preferredRec });
      };

      // 1. LLM pointCandidates & points & alternativePoints 순차 수집
      for (const item of llmOut?.pointCandidates ?? []) {
        pushCandidate(item.text, item.axis, Boolean(item.recommended));
      }
      for (let i = 0; i < (llmOut?.points?.length ?? 0); i++) {
        pushCandidate(llmOut?.points?.[i], undefined, true);
      }
      for (const alt of llmOut?.alternativePoints ?? []) {
        pushCandidate(alt, undefined, false);
      }

      // 2. FactBook 기반 결정적 후보 & 현장 태그 보충 (최소 6개 보장)
      const f = sanitizedFacts;
      const factDerivedRaw: Array<{ text: string; axis: DealCardPointAxis }> = [];
      if (f && 'yieldPct' in f && typeof f.yieldPct === 'number') {
        const bench =
          'regionalBenchmarkYieldPct' in f && typeof f.regionalBenchmarkYieldPct === 'number'
            ? f.regionalBenchmarkYieldPct
            : undefined;
        factDerivedRaw.push({
          text:
            bench && f.yieldPct > bench
              ? `연 ${f.yieldPct}% 권역 평균 상회`
              : `연 ${f.yieldPct}% 임대수익 확보`,
          axis: 'yield',
        });
      }
      if (f && 'occupancyStatus' in f && typeof f.occupancyStatus === 'string') {
        factDerivedRaw.push({ text: `${f.occupancyStatus} 안정 운영`, axis: 'tenant' });
      }
      if (f && 'anchorCategory' in f && typeof f.anchorCategory === 'string') {
        factDerivedRaw.push({ text: `1층 ${f.anchorCategory} 입점`, axis: 'tenant' });
      }
      if (f && 'subwayWalkMinutes' in f && typeof f.subwayWalkMinutes === 'number') {
        factDerivedRaw.push({ text: `역 도보 ${f.subwayWalkMinutes}분 초역세권`, axis: 'location' });
      }
      if (f?.roadContact) {
        factDerivedRaw.push({ text: `${f.roadContact} 가시성 우수`, axis: 'scarcity' });
      }
      if (f && 'parkingCount' in f && typeof f.parkingCount === 'number') {
        const pType = 'parkingType' in f && f.parkingType ? `${f.parkingType} ` : '';
        factDerivedRaw.push({ text: `${pType}주차 ${f.parkingCount}대 확보`, axis: 'building' });
      }
      if (f && 'hasElevator' in f && f.hasElevator) {
        factDerivedRaw.push({ text: '승강기 보유·층간 이동 편리', axis: 'building' });
      }
      if (f && 'remodelingYear' in f && typeof f.remodelingYear === 'number') {
        factDerivedRaw.push({ text: `${f.remodelingYear}년 올리모델링 완료`, axis: 'building' });
      } else if (f?.completionYear) {
        factDerivedRaw.push({ text: `${f.completionYear}년 준공 양호 상태`, axis: 'building' });
      }
      if (f && 'farPotential' in f && typeof f.farPotential === 'string') {
        factDerivedRaw.push({ text: `${f.farPotential}·개발 여력`, axis: 'value' });
      }

      const postureTags = getFieldStrengthTagsForPosture(input.posture, f?.memoSummary).map((tag) => ({
        text: tag.label,
        axis: inferAxisFromText(tag.label, 0),
      }));

      for (const item of [...factDerivedRaw, ...postureTags]) {
        if (candidatePool.length >= targetCandidateCount) break;
        pushCandidate(item.text, item.axis, false);
      }

      for (const fallbackText of [...currentRepaired, ...GENERIC_POINT_FALLBACKS]) {
        if (candidatePool.length >= targetCandidateCount) break;
        pushCandidate(fallbackText, undefined, false);
      }

      // 3. 상위 3개 추천 선정 (서로 다른 축 우선)
      const pickedIndices: number[] = [];
      const pickedAxes = new Set<DealCardPointAxis>();

      // Pass 1: recommended 플래그 + 축 비중복
      candidatePool.forEach((c, idx) => {
        if (pickedIndices.length >= 3) return;
        if (c.preferredRec && !pickedAxes.has(c.axis)) {
          pickedIndices.push(idx);
          pickedAxes.add(c.axis);
        }
      });
      // Pass 2: 축 비중복 보충
      candidatePool.forEach((c, idx) => {
        if (pickedIndices.length >= 3) return;
        if (!pickedIndices.includes(idx) && !pickedAxes.has(c.axis)) {
          pickedIndices.push(idx);
          pickedAxes.add(c.axis);
        }
      });
      // Pass 3: 남은 후보 순서대로 3개 채움
      candidatePool.forEach((_c, idx) => {
        if (pickedIndices.length >= 3) return;
        if (!pickedIndices.includes(idx)) {
          pickedIndices.push(idx);
        }
      });

      const pickedSet = new Set(pickedIndices);
      const recommendedList = pickedIndices.map((idx) => candidatePool[idx]);
      const reserveList = candidatePool.filter((_c, idx) => !pickedSet.has(idx));

      const pts = recommendedList.map((c) => c.text);
      while (pts.length < 3) {
        pts.push(GENERIC_POINT_FALLBACKS[pts.length] ?? '접근성 좋은 입지');
      }
      result.points = [pts[0], pts[1], pts[2]];
      result.pointCandidates = [
        ...recommendedList.map((c): DealCardPointCandidate => ({
          text: c.text,
          axis: c.axis,
          recommended: true,
        })),
        ...reserveList.slice(0, 5).map((c): DealCardPointCandidate => ({
          text: c.text,
          axis: c.axis,
          recommended: false,
        })),
      ];
    }

    if (input.mode === 'headline' || input.mode === 'both') {
      const finalized = finalizeLine(llmOut?.headline, true);
      const isRepeated =
        input.mode === 'headline' &&
        Boolean(finalized) &&
        avoidList.some((a) => a.replace(/\s+/g, '') === finalized.replace(/\s+/g, ''));
      const headline =
        finalized && !isRepeated
          ? finalized
          : pickFreshDealCardHeadline(
              {
                posture: input.posture,
                points: result.points ?? currentRepaired,
                headline: input.currentHeadline,
              },
              avoidList,
            );
      result.headline = headline;
    }

    // 최종 계약 검증 (방어적) — 통과 못 하면 결정적 문구로 교체
    const strict = DealCardCopyStrictOutputSchema.safeParse(result);
    if (!strict.success) {
      log.warn('[deal-card/ai-copy] strict 검증 실패 → 결정적 대체:', strict.error.issues[0]?.message);
      if (result.points) result.points = repairDealCardPoints(result.points, { fillEmpty: true });
      if (result.headline !== undefined) {
        result.headline =
          avoidList.length > 0
            ? pickFreshDealCardHeadline(
                {
                  posture: input.posture,
                  points: result.points ?? currentRepaired,
                  headline: input.currentHeadline,
                },
                avoidList,
              )
            : deriveDealCardHeadline({ posture: input.posture, points: result.points ?? currentRepaired });
      }
    }

    const body: DealCardAiCopyResponse = {
      ok: true,
      result,
      source,
      ...(warnings.size > 0 ? { warnings: [...warnings] } : {}),
    };
    return NextResponse.json(body);
  } catch (outerErr: unknown) {
    if (isLLMMockNotAllowedError(outerErr)) {
      return buildAiUnavailable503Response();
    }
    return toApiError(outerErr);
  }
}
