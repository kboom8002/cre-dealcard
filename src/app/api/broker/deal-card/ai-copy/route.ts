/**
 * @file src/app/api/broker/deal-card/ai-copy/route.ts
 * @description 딜카드 한 줄 제목(<=18자) + 장점 3줄(각 <=18자) 실제 LLM 생성 API
 */
import { NextRequest, NextResponse } from 'next/server';
import { callLLM, LLMMockNotAllowedError } from '@/ai/llm-client';
import { getModel } from '@/ai/model-selector';
import { requireBroker } from '@/lib/auth-guard';
import { cleanBlindPoints, validateBlindPoints } from '@/lib/deal-card/blind-guard';
import {
  DEAL_CARD_AI_SYSTEM_PROMPT,
  dealCardAiCopyRequestSchema,
  type DealCardAiCopyResponse,
} from '@/lib/deal-card/ai-copy-schema';
import { findNumbersNotInContext } from '@/lib/magazine/ai-comment-schema';
import { POSTURE_LABELS } from '@/lib/ux/lexicon';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('deal-card-ai-copy');

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function clamp18(text: string): string {
  const cleaned = cleanBlindPoints([text.trim()])[0] || '';
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, 18);
}

function stripUnverifiedNumbers(text: string, context: string): { cleaned: string; stripped: boolean } {
  const unknownNums = findNumbersNotInContext(text, context);
  if (unknownNums.length === 0) {
    return { cleaned: text, stripped: false };
  }
  let next = text;
  for (const num of unknownNums) {
    const escaped = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = next.replace(new RegExp(`(?:연\\s*|약\\s*|도보\\s*)?${escaped}\\s*(?:%대|%|분|층|년|억|만|평)?`, 'g'), '');
  }
  next = next.replace(/\s+/g, ' ').replace(/^[·,.\s]+|[·,.\s]+$/g, '').trim();
  return { cleaned: next, stripped: true };
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

  // Context string containing only broker-provided facts/numbers
  const contextParts = [
    input.region,
    input.use,
    input.area,
    input.priceBand,
    input.currentHeadline,
    ...(input.currentPoints || []),
    input.facts ? JSON.stringify(input.facts) : '',
  ].filter(Boolean);
  const factContextString = contextParts.join(' ');

  const userPrompt = JSON.stringify({
    요청모드: input.mode,
    매물유형: `${postureInfo.title} (${postureInfo.subtitle})`,
    썸네일표시항목_제목에서반복금지: {
      지역: input.region || '미입력',
      용도: input.use || '미입력',
      면적: input.area || '미입력',
      가격: input.priceBand || '미입력',
    },
    현재입력된제목: input.currentHeadline || '',
    현재입력된장점: (input.currentPoints || []).filter(Boolean),
    추가사실정보: input.facts || {},
  });

  try {
    const llmResult = await callLLM(
      {
        systemPrompt: DEAL_CARD_AI_SYSTEM_PROMPT,
        userPrompt,
        model: getModel('luna'),
        temperature: 0.4,
        responseFormat: 'json_object',
      },
      { allowMock: false },
    );

    if ((llmResult as { isMock?: boolean }).isMock) {
      return fail(502, 'LLM_UNAVAILABLE', 'AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.');
    }

    const content = typeof llmResult.content === 'string' ? llmResult.content.trim() : '';
    if (!content) {
      return fail(502, 'LLM_EMPTY', 'AI가 문구를 만들지 못했어요. 다시 눌러 주세요.');
    }

    let jsonObj: { headline?: unknown; points?: unknown };
    try {
      jsonObj = JSON.parse(content);
    } catch {
      return fail(502, 'LLM_INVALID_JSON', 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
    }

    const warnings: string[] = [];
    const responseResult: DealCardAiCopyResponse['result'] = {};

    if (input.mode === 'headline' || input.mode === 'both') {
      const rawHeadline = typeof jsonObj.headline === 'string' ? jsonObj.headline.trim() : '';
      if (!rawHeadline) {
        return fail(502, 'LLM_EMPTY_HEADLINE', 'AI가 한 줄 제목을 만들지 못했어요. 다시 눌러 주세요.');
      }
      const { cleaned, stripped } = stripUnverifiedNumbers(rawHeadline, factContextString);
      if (stripped) {
        warnings.push('입력 정보에 없는 숫자는 자동으로 제외했어요.');
      }
      const finalHeadline = clamp18(cleaned || rawHeadline);
      const vCheck = validateBlindPoints([finalHeadline]);
      responseResult.headline = vCheck.isValid ? finalHeadline : clamp18(vCheck.cleanedPoints[0] || '우수 입지 추천 매물');
    }

    if (input.mode === 'points' || input.mode === 'both') {
      const rawPts = Array.isArray(jsonObj.points)
        ? jsonObj.points.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        : [];
      if (rawPts.length < 3) {
        return fail(502, 'LLM_EMPTY_POINTS', 'AI가 장점 3줄을 모두 채우지 못했어요. 다시 눌러 주세요.');
      }
      const processedPoints = rawPts.slice(0, 3).map((pt) => {
        const { cleaned, stripped } = stripUnverifiedNumbers(pt, factContextString);
        if (stripped && !warnings.includes('입력 정보에 없는 숫자는 자동으로 제외했어요.')) {
          warnings.push('입력 정보에 없는 숫자는 자동으로 제외했어요.');
        }
        return clamp18(cleaned || pt);
      }) as [string, string, string];

      responseResult.points = processedPoints;
    }

    const body: DealCardAiCopyResponse = {
      ok: true,
      result: responseResult,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    if (error instanceof LLMMockNotAllowedError) {
      log.warn('[deal-card/ai-copy] Mock 응답 거부:', error.message);
      return fail(502, 'LLM_UNAVAILABLE', 'AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.');
    }
    log.error('[deal-card/ai-copy] Error:', error);
    return fail(500, 'SERVER_ERROR', 'AI 문구 작성 중 문제가 생겼어요. 잠시 후 다시 눌러 주세요.');
  }
}
