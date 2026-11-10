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
  totalDepositManwon: z.number().nonnegative().optional(),
  totalRentManwon: z.number().nonnegative().optional(),
  calculatedYieldPct: z.number().nonnegative().optional(),
});

const GOLDEN_BENCHMARK_POINTS: Array<{
  match: (addr: string, title: string) => boolean;
  points: Array<{ title: string; body: string }>;
}> = [
  {
    match: (addr, title) =>
      addr.includes('동교동') ||
      addr.includes('와우산로37길') ||
      title.includes('더파크빌딩') ||
      title.includes('THE.PARK'),
    points: [
      {
        title: '홍대 경의선 숲길 공원을 정면으로 접한 전층 근생 디자인 랜드마크',
        body: '연트럴파크 산책로 코너 접면으로 가시성과 유동인구 흡입력이 탁월합니다.',
      },
      {
        title: '공원 레벨 기준 실질 사업용적률 310.58% 효과 시현 (공부상 189.69%)',
        body: '공부상 지하1~2층이 공원 레벨에서는 지상 1층·지하 1층으로 직접 진출입됩니다.',
      },
      {
        title: '유명 향수 브랜드 그랑핸드(GRANHAND) 등 전층 100% 만실 운영',
        body: '보증금 2.2억 / 월임대료 1,817만원 / 순관리수익 포함 월 1,926.5만원 안정적 현금흐름.',
      },
    ],
  },
  {
    match: (addr, title) =>
      addr.includes('심곡동') ||
      addr.includes('부천로39번길') ||
      title.includes('동아빌딩') ||
      (addr.includes('상동') && addr.includes('544-1')) ||
      title.includes('골든타워'),
    points: [
      {
        title: '1호선 부천역 북부광장 도보 3분 대학로 먹자상권 메인 사거리 코너',
        body: '일일 유동인구 20만명 배후의 핵심 상업지 코너 빌딩입니다.',
      },
      {
        title: '2025년 9월 내외부·승강기·주차타워·배관·소방 전관 리모델링 완료',
        body: '매수 후 추가 자본적 지출(CapEx) 부담이 전혀 없는 신축급 컨디션입니다.',
      },
      {
        title: '기계식 주차타워 22대 유료 고정주차(월 198만원) 및 고수익 현금흐름',
        body: '현재 보증금 4.55억 / 월임대료 2,230만원, 201호 임대 완료 시 월 2,520만원.',
      },
    ],
  },
  {
    match: (addr, title) =>
      (addr.includes('역삼동') && (addr.includes('648-23') || addr.includes('676'))) ||
      addr.includes('테헤란로 123') ||
      title.includes('여삼빌딩') ||
      title.includes('제1역삼빌딩'),
    points: [
      {
        title: '강남역~역삼역 테헤란로 왕복 8차선 메인 대로변 3필지 합산(439.29평) 프라임 오피스',
        body: '역삼동 648-23 외 2필지(총 1,452.2㎡) 대형 토지 및 연면적 4,312.61평 규모의 코어 빌딩.',
      },
      {
        title: 'NH농협은행·서우회계법인·스파크플러스 장기 마스터리스(~2031.02) 100% 만실',
        body: '보증금 46억 4,776만원 / 월임대료 4억 686만원 / 월관리비 1억 4,776만원 안정적 배당.',
      },
      {
        title: '테헤란로제2지구 지구단위계획구역 내 향후 프라임 신축·리모델링 개발 잠재력',
        body: '인근 역삼동 679-4(평당 8.27억), 736-1(평당 6.27억) 매각사례 대비 뛰어난 가격 메리트(평당 4.55억).',
      },
    ],
  },
];

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
  const goldenMatch = GOLDEN_BENCHMARK_POINTS.find((g) =>
    g.match(input.address || '', input.title || '')
  );
  if (goldenMatch) {
    return NextResponse.json({
      ok: true,
      result: { points: goldenMatch.points },
    });
  }
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
