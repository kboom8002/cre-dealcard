/**
 * @file src/app/api/broker/im/ai-points/route.ts
 * @description IM 작업공간 핵심 장점 3가지(제목 + 2~3문장 설명) 실제 LLM 생성 API
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callLLM, LLMMockNotAllowedError } from '@/ai/llm-client';
import { getModel } from '@/ai/model-selector';
import { requireBroker } from '@/lib/auth-guard';
import { findNumbersNotInContext } from '@/lib/magazine/ai-comment-schema';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('im-ai-points');

const imAiPointsRequestSchema = z.object({
  address: z.string().trim().max(200).optional().default(''),
  title: z.string().trim().max(100).optional().default(''),
  posture: z.string().trim().max(40).optional().default('core_income'),
  askingPriceManwon: z.number().nonnegative().optional(),
  gfaSqm: z.union([z.number(), z.string()]).optional(),
  landAreaSqm: z.union([z.number(), z.string()]).optional(),
  zoning: z.string().trim().max(80).optional(),
  completionDate: z.string().trim().max(40).optional(),
  rentRollSummary: z.string().trim().max(600).optional(),
});

const IM_AI_POINTS_SYSTEM_PROMPT = `당신은 상업용 부동산 투자설명서(IM) 작성을 돕는 전문 비서입니다.
중개인이 입력한 건물 정보와 임대 현황을 바탕으로, 매수 검토자에게 보여줄 핵심 장점 3가지를 JSON 형식으로 작성하세요.

규칙:
1. 정확히 3개 항목의 배열 "points"를 반환하세요.
2. 각 항목은:
   - "title": 공백 포함 24자 이내의 명확한 한 줄 소제목
   - "body": 공백 포함 110자 이내의 구체적 설명 (2문장 내외)
3. 입력 정보에 없는 숫자(수익률 %, 거리, 연도, 면적, 금액)는 절대 지어내지 마세요.
4. 투자 권유, 수익 보장, 단정적 시세차익, 법률·세무 결론 표현은 쓰지 마세요.

응답 JSON 형식:
{
  "points": [
    { "title": "...", "body": "..." },
    { "title": "...", "body": "..." },
    { "title": "...", "body": "..." }
  ]
}`;

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
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

  const parsed = imAiPointsRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? '입력 정보를 확인해 주세요.');
  }

  const input = parsed.data;
  const contextString = JSON.stringify(input);

  try {
    const llmResult = await callLLM(
      {
        systemPrompt: IM_AI_POINTS_SYSTEM_PROMPT,
        userPrompt: `매물 입력 정보: ${contextString}`,
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

    let jsonObj: { points?: Array<{ title?: string; body?: string }> };
    try {
      jsonObj = JSON.parse(content);
    } catch {
      return fail(502, 'LLM_INVALID_JSON', 'AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
    }

    const rawPoints = Array.isArray(jsonObj.points) ? jsonObj.points : [];
    if (rawPoints.length < 3) {
      return fail(502, 'LLM_INCOMPLETE', 'AI가 장점 3가지를 모두 작성하지 못했어요. 다시 눌러 주세요.');
    }

    const warnings: string[] = [];
    const points = rawPoints.slice(0, 3).map((p, idx) => {
      const title = String(p?.title || `핵심 장점 ${idx + 1}`).trim().slice(0, 28);
      const body = String(p?.body || '').trim().slice(0, 140);
      if (findNumbersNotInContext(`${title} ${body}`, contextString).length > 0) {
        if (!warnings.includes('입력 정보에 없는 숫자가 포함되어 있는지 확인해 주세요.')) {
          warnings.push('입력 정보에 없는 숫자가 포함되어 있는지 확인해 주세요.');
        }
      }
      return { title, body };
    });

    return NextResponse.json({
      ok: true,
      result: { points },
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error: unknown) {
    if (error instanceof LLMMockNotAllowedError) {
      log.warn('[im/ai-points] Mock 응답 거부:', error.message);
      return fail(502, 'LLM_UNAVAILABLE', 'AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.');
    }
    log.error('[im/ai-points] Error:', error);
    return fail(500, 'SERVER_ERROR', 'AI 문구 작성 중 문제가 생겼어요. 잠시 후 다시 눌러 주세요.');
  }
}
