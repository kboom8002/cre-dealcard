/**
 * @file src/app/api/broker/deal-card/ai-copy/route.ts
 * @description 딜카드 한 줄 제목(<=18자) + 장점 3줄(각 <=18자) LLM 생성 API — TaskFlow TF8 하드닝.
 *
 * 파이프라인 (응답 형태는 하위 호환: { ok, result: { headline?, points? }, warnings? } + source):
 *  1. buildDealCardCopyPrompt — 역할/단계/근거/출력계약/few-shot/자체검증 프롬프트 (FactBook = 중개사 입력만)
 *  2. callLLM(json_object) → safeParseAIResponse(DealCardCopyLLMOutputSchema) — 실패 시 핀포인트 교정 재시도 1회
 *  3. 결정적 후처리: 근거 없는 숫자 제거 → 블라인드 정리 → 칩 중복 제거 → 18자 어절 경계 교정
 *  4. 엄격 검증(DealCardCopyStrictOutputSchema) — 위반/누락 줄은 입력 기반 결정적 문구로 대체
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
import { cleanBlindPoints, validateBlindPoints } from '@/lib/deal-card/blind-guard';
import {
  dealCardAiCopyRequestSchema,
  type DealCardAiCopyResponse,
} from '@/lib/deal-card/ai-copy-schema';
import {
  GENERIC_POINT_FALLBACKS,
  deriveDealCardHeadline,
  isCompleteDealCardLine,
  repairDealCardLine,
  repairDealCardPoints,
  stripChipRepetition,
  stripUngroundedNumbers,
} from '@/lib/deal-card/copy-limits';
import { POSTURE_LABELS } from '@/lib/ux/lexicon';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('deal-card-ai-copy');

const WARN_NUMBERS = '입력 정보에 없는 숫자는 자동으로 제외했어요.';
const WARN_FALLBACK = 'AI 연결이 원활하지 않아 입력하신 내용으로 추천 문구를 채웠어요. 확인 후 고쳐 주세요.';
const WARN_REPAIRED = '18자를 넘거나 끝맺음이 어색한 문구는 자동으로 다듬었어요.';

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
  const temperature = isDeterministicLLMMode() ? 0 : 0.3;
  let prompt = userPrompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const llmResult = await callLLM(
      { systemPrompt, userPrompt: prompt, model: getModel('luna'), temperature, responseFormat: 'json_object' },
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

  const input = parsed.data;
  const postureInfo = POSTURE_LABELS[input.posture];
  const prompt = buildDealCardCopyPrompt({
    mode: input.mode,
    postureTitle: postureInfo.title,
    postureSubtitle: postureInfo.subtitle,
    region: input.region,
    use: input.use,
    area: input.area,
    priceBand: input.priceBand,
    currentHeadline: input.currentHeadline,
    currentPoints: input.currentPoints,
    facts: input.facts,
  });

  const warnings = new Set<string>();
  let source: 'llm' | 'fallback' = 'llm';

  let llmOut: DealCardCopyLLMOutput | null = null;
  try {
    llmOut = await requestCopy(prompt.systemPrompt, prompt.userPrompt, input.mode);
  } catch (error: unknown) {
    if (error instanceof LLMMockNotAllowedError) {
      log.warn('[deal-card/ai-copy] Mock 응답 거부:', error.message);
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
    let line = cleanBlindPoints([cleaned || ''])[0] || '';
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
    const used = new Set<string>();
    const fallbacks = [...currentRepaired, ...GENERIC_POINT_FALLBACKS].filter(Boolean);
    const pts: string[] = [];
    for (let i = 0; i < 3; i++) {
      let line = finalizeLine(llmOut?.points?.[i], false);
      if (!line || used.has(line)) {
        line = fallbacks.find((f) => !used.has(f) && isCompleteDealCardLine(f)) || '';
        if (llmOut) warnings.add(WARN_REPAIRED);
      }
      used.add(line);
      pts.push(line);
    }
    result.points = [pts[0], pts[1], pts[2]];
  }

  if (input.mode === 'headline' || input.mode === 'both') {
    const headline =
      finalizeLine(llmOut?.headline, true) ||
      deriveDealCardHeadline({
        posture: input.posture,
        points: result.points ?? currentRepaired,
      });
    result.headline = headline;
  }

  // 최종 계약 검증 (방어적) — 통과 못 하면 결정적 문구로 교체
  const strict = DealCardCopyStrictOutputSchema.safeParse(result);
  if (!strict.success) {
    log.warn('[deal-card/ai-copy] strict 검증 실패 → 결정적 대체:', strict.error.issues[0]?.message);
    if (result.points) result.points = repairDealCardPoints(result.points, { fillEmpty: true });
    if (result.headline !== undefined) {
      result.headline = deriveDealCardHeadline({ posture: input.posture, points: result.points ?? currentRepaired });
    }
  }

  const body: DealCardAiCopyResponse = {
    ok: true,
    result,
    source,
    ...(warnings.size > 0 ? { warnings: [...warnings] } : {}),
  };
  return NextResponse.json(body);
}
