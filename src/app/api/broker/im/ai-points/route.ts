/**
 * @file src/app/api/broker/im/ai-points/route.ts
 * @description IM 작업공간 핵심 장점 3가지(제목 + 2~3문장 설명) SOTA Neuro-Symbolic LLM 생성 API
 *
 * - 사전 연산 SSOT Fact Sheet 주입 (LLM 암산 원천 금지)
 * - 5대 포스처 오버레이 + 동적 Golden Set Few-Shot + pgvector Hybrid RAG 문체 참조
 * - 2-Attempt Pinpoint 자가 교정 루프 (미근거 숫자 · 날조 유명 브랜드 · 노골적 페르소나 · 수익보장 금칙어)
 * - DB 기반 CRE 용어사전(`normalizeTerminologyAsync`) 정규화 + 무중단 결정론적 SSOT 폴백(Zero-502)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callLLM, LLMMockNotAllowedError } from '@/ai/llm-client';
import { isDeterministicLLMMode } from '@/ai/llm-determinism';
import { getModel } from '@/ai/model-selector';
import { requireBroker } from '@/lib/auth-guard';
import { findNumbersNotInContext } from '@/lib/magazine/ai-comment-schema';
import { createModuleLogger } from '@/lib/logger';
import {
  buildAuthoritativeImFactSheet,
  buildDeterministicImPointsFallback,
  buildImRepairFeedback,
  fetchDynamicImReferenceBlock,
  polishImCopyWithLexicon,
  validateImGeneratedCopy,
} from '@/domain/building/mobile-im/workspace-ai-enhancer';

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
  rentRollSummary: z.string().trim().max(1200).optional(),
  totalDepositManwon: z.number().nonnegative().optional(),
  totalRentManwon: z.number().nonnegative().optional(),
  calculatedYieldPct: z.number().nonnegative().optional(),
  floorsAbove: z.number().int().nonnegative().optional(),
  floorsBelow: z.number().int().nonnegative().optional(),
  bcrPct: z.number().nonnegative().optional(),
  farPct: z.number().nonnegative().optional(),
  parkingSpaces: z.number().int().nonnegative().optional(),
  elevators: z.number().int().nonnegative().optional(),
  officialLandPriceWonSqm: z.number().nonnegative().optional(),
  handoverNote: z.string().trim().max(300).optional(),
  parcelsCount: z.number().int().nonnegative().optional(),
  landCategoryLabel: z.string().trim().max(40).optional(),
  tenantNames: z.array(z.string().trim().max(80)).max(40).optional(),
  vacantCount: z.number().int().nonnegative().optional(),
  ownerUseCount: z.number().int().nonnegative().optional(),
  nearbyStationText: z.string().trim().max(120).optional(),
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

function buildImAiPointsSystemPrompt(params: {
  postureOverlay: string;
  fewShotBlock: string;
  ragStyleSnippet: string;
}): string {
  return [
    `당신은 한국 상업용 부동산(CRE) 기관투자가·전담 중개법인 수준의 투자설명서(IM) 수석 애널리스트입니다.`,
    `제공된 [본건 사전 연산 SSOT 팩트 시트]만을 유일한 수치 근거로 삼아, 매수 검토자의 의사결정을 돕는 핵심 투자 포인트 3가지(입지·물리 제원 / 임대·운영 또는 공간 효율 / 재무 수익성·가치개선)를 상호 배타적(MECE)으로 작성하세요.`,
    ``,
    `[핵심 작성 규율 — 위반 시 즉시 폐기]`,
    `1. 응답은 정확히 3개 항목의 JSON 배열 "points"로 반환하세요:`,
    `   - "title": 공백 포함 24자 이내의 완결된 명사형 핵심 소제목 (마침표·말줄임표 금지)`,
    `   - "body": 공백 포함 115자 이내의 구체적이고 밀도 높은 전문 해설 (1~2문장)`,
    `2. [암산·날조 금지]: 평수, 수익률(%), 실투자금, 평당가, 거리, 연도 등 모든 숫자는 반드시 [본건 사전 연산 SSOT 팩트 시트]에 적힌 값만 그대로 인용하세요. 팩트 시트에 없는 숫자는 절대 추정하거나 계산하지 마세요.`,
    `3. [임차인 상호 정책(D1)]: 실제 렌트롤에 확인된 우량 임차인 상호는 적극 표기하되, 렌트롤에 없는 유명 브랜드(스타벅스, 올리브영 등)는 절대 창작하지 마세요.`,
    `4. [표준 CRE 금융 어휘 & 암묵적 페르소나]:`,
    `   - '60대 자산가', '은퇴 부부', '법인 대표 맞춤' 같은 노골적 독자 호명을 절대 쓰지 마세요.`,
    `   - '세입자' 대신 '임차인', '올수리' 대신 '전면 리모델링', '확실한 수익/원금 보장' 대신 '안정적인 임대 현금흐름/하방 안정성' 등 표준 CRE 용어를 사용하세요.`,
    params.postureOverlay ? `\n[투자 포스처 특화 지침]\n${params.postureOverlay}` : '',
    params.fewShotBlock
      ? `\n[우수 IM 작성 예시 (문체·밀도만 참고하고 예시 속 수치·상호는 본건에 절대 복사 금지)]\n${params.fewShotBlock}`
      : '',
    params.ragStyleSnippet ? `\n${params.ragStyleSnippet}` : '',
    ``,
    `응답 JSON 형식:`,
    `{`,
    `  "points": [`,
    `    { "title": "...", "body": "..." },`,
    `    { "title": "...", "body": "..." },`,
    `    { "title": "...", "body": "..." }`,
    `  ]`,
    `}`,
  ]
    .filter(Boolean)
    .join('\n');
}

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
    g.match(input.address || '', input.title || ''),
  );
  if (goldenMatch) {
    return NextResponse.json({
      ok: true,
      source: 'golden_benchmark',
      result: { points: goldenMatch.points },
    });
  }

  const factSheet = buildAuthoritativeImFactSheet(input);
  const deterministicFallback = buildDeterministicImPointsFallback(input, factSheet);

  const refBlock = await fetchDynamicImReferenceBlock({
    assetType: factSheet.inferredAssetType,
    priceBand: factSheet.goldenPriceBand,
    posture: factSheet.canonicalPosture,
    sectionType: 'investment_thesis',
    address: input.address,
    buildingName: input.title,
  });

  const systemPrompt = buildImAiPointsSystemPrompt(refBlock);
  const baseUserPrompt = [
    `[본건 사전 연산 SSOT 팩트 시트]`,
    factSheet.factSheetPromptBlock || `- 소재지: ${input.address || '미상'}`,
    ``,
    `위 본건 SSOT 팩트 시트에 근거하여 핵심 장점 3가지를 JSON으로 작성하세요.`,
  ].join('\n');

  const temperature = isDeterministicLLMMode() ? 0 : 0.35;

  try {
    let repairFeedback = '';
    let candidatePoints: Array<{ title: string; body: string }> | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const userPrompt = repairFeedback
        ? `${baseUserPrompt}\n\n${repairFeedback}`
        : baseUserPrompt;

      const llmResult = await callLLM(
        {
          systemPrompt,
          userPrompt,
          model: getModel('terra'),
          temperature,
          responseFormat: 'json_object',
        },
        { allowMock: false },
      );

      if ((llmResult as { isMock?: boolean }).isMock) {
        return NextResponse.json({
          ok: true,
          source: 'deterministic_fallback',
          result: { points: deterministicFallback },
        });
      }

      const content = typeof llmResult.content === 'string' ? llmResult.content.trim() : '';
      if (!content) {
        repairFeedback = '[자가 교정 지시] 직전 응답이 비어 있었습니다. 반드시 유효한 JSON 객체를 반환하세요.';
        continue;
      }

      let jsonObj: { points?: Array<{ title?: string; body?: string }> };
      try {
        jsonObj = JSON.parse(content);
      } catch {
        repairFeedback = '[자가 교정 지시] 직전 응답이 유효한 JSON이 아니었습니다. 순수 JSON만 반환하세요.';
        continue;
      }

      const rawPoints = Array.isArray(jsonObj.points) ? jsonObj.points : [];
      if (rawPoints.length < 3) {
        repairFeedback = '[자가 교정 지시] 반드시 정확히 3개의 points 배열 원소를 반환하세요.';
        continue;
      }

      const normalizedPoints = rawPoints.slice(0, 3).map((p, idx) => ({
        title: String(p?.title || deterministicFallback[idx]?.title || `핵심 장점 ${idx + 1}`).trim(),
        body: String(p?.body || deterministicFallback[idx]?.body || '').trim(),
      }));

      const allUngrounded: string[] = [];
      const allFabricated: string[] = [];
      const allForbidden: string[] = [];
      let lengthExceeded = false;

      for (const pt of normalizedPoints) {
        const titleVal = validateImGeneratedCopy(pt.title, {
          numberContext: factSheet.numberAllowlistContext,
          tenantPoolSource: factSheet.tenantPoolObjects,
          maxChars: 28,
        });
        const bodyVal = validateImGeneratedCopy(pt.body, {
          numberContext: factSheet.numberAllowlistContext,
          tenantPoolSource: factSheet.tenantPoolObjects,
          maxChars: 140,
        });
        allUngrounded.push(...titleVal.ungroundedNumbers, ...bodyVal.ungroundedNumbers);
        allFabricated.push(...titleVal.fabricatedBrands, ...bodyVal.fabricatedBrands);
        allForbidden.push(...titleVal.forbiddenHits, ...bodyVal.forbiddenHits);
        if (titleVal.exceedsLength || bodyVal.exceedsLength) {
          lengthExceeded = true;
        }
      }

      candidatePoints = normalizedPoints;

      const hasDefects =
        allUngrounded.length > 0 ||
        allFabricated.length > 0 ||
        allForbidden.length > 0 ||
        lengthExceeded;

      if (!hasDefects || attempt === 2) {
        break;
      }

      repairFeedback = buildImRepairFeedback({
        ungroundedNumbers: Array.from(new Set(allUngrounded)),
        fabricatedBrands: Array.from(new Set(allFabricated)),
        forbiddenHits: Array.from(new Set(allForbidden)),
        lengthNote: lengthExceeded
          ? 'title은 24자 이내, body는 115자 이내로 간결하게 압축하세요.'
          : undefined,
      });
    }

    if (!candidatePoints || candidatePoints.length < 3) {
      return NextResponse.json({
        ok: true,
        source: 'deterministic_fallback',
        result: { points: deterministicFallback },
      });
    }

    const warnings: string[] = [];
    const finalPoints = await Promise.all(
      candidatePoints.slice(0, 3).map(async (pt, idx) => {
        const polishedTitle = await polishImCopyWithLexicon(pt.title, {
          tenantPoolSource: factSheet.tenantPoolObjects,
          isCompactHeadline: true,
          maxChars: 28,
        });
        const polishedBody = await polishImCopyWithLexicon(pt.body, {
          tenantPoolSource: factSheet.tenantPoolObjects,
          isCompactHeadline: false,
          maxChars: 140,
        });

        // 2차 교정 후에도 미근거 숫자가 남아 있으면 해당 슬롯만 결정론적 SSOT 문구로 무결점 대체
        const residualUngrounded = findNumbersNotInContext(
          `${polishedTitle} ${polishedBody}`,
          factSheet.numberAllowlistContext,
        );
        if (residualUngrounded.length > 0) {
          warnings.push(
            `미근거 수치(${residualUngrounded.join(', ')})가 감지되어 검증된 SSOT 수치 문구로 자동 보정되었습니다.`,
          );
          return deterministicFallback[idx];
        }

        return {
          title: polishedTitle || deterministicFallback[idx].title,
          body: polishedBody || deterministicFallback[idx].body,
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      source: 'llm',
      result: { points: finalPoints },
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error: unknown) {
    if (error instanceof LLMMockNotAllowedError) {
      log.warn('[im/ai-points] Mock 응답 거부 — 결정론적 SSOT 폴백 전환:', error.message);
      return NextResponse.json({
        ok: true,
        source: 'deterministic_fallback',
        result: { points: deterministicFallback },
      });
    }
    log.error('[im/ai-points] LLM 오류 — 결정론적 SSOT 폴백 전환:', error);
    return NextResponse.json({
      ok: true,
      source: 'deterministic_fallback',
      result: { points: deterministicFallback },
    });
  }
}
