import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callLLM } from '@/ai/llm-client';
import { getModel } from '@/ai/model-selector';
import { humanizeBuyerCopy } from '@/domain/magazine/issue-clustering';
import { requireBroker } from '@/lib/auth-guard';
import { enforceBrokerAiQuota } from '@/lib/ai-quota-guard';
import { createModuleLogger } from '@/lib/logger';

export const maxDuration = 60;

const log = createModuleLogger('broker-inbox-ai-reply');

const AI_REPLY_RATE_LIMIT = { max: 40, windowMs: 60_000 } as const;

const aiReplyRequestSchema = z.object({
  clientName: z.string().trim().max(80).optional().default('고객'),
  clientRole: z.string().trim().max(40).optional(),
  buildingTitle: z.string().trim().max(120).optional(),
  assetKind: z.enum(['im', 'dealcard', 'magazine', 'newsletter']).optional().default('im'),
  openCount: z.number().int().min(0).max(9999).optional().default(0),
  lastEventText: z.string().trim().max(300).optional(),
  callNote: z.string().trim().max(1000).optional(),
  hasIm: z.boolean().optional(),
  avoidReplies: z.array(z.string().trim().max(600)).max(8).optional(),
  attemptSeed: z.number().int().min(0).max(1000).optional().default(0),
});

interface AiReplyVariant {
  headline: string;
  brief: string;
}

function buildFallbackPool(input: z.infer<typeof aiReplyRequestSchema>): AiReplyVariant[] {
  const clientLabel = input.clientName.trim() || '고객';
  const buildingLabel = input.buildingTitle?.trim() || '추천 매물';
  const noteHint = input.callNote?.trim();
  const isMagazine = input.assetKind === 'magazine' || input.assetKind === 'newsletter';
  const effectiveKind =
    input.assetKind === 'im' && input.hasIm === false ? 'dealcard' : input.assetKind;

  if (isMagazine) {
    return [
      {
        headline: `${clientLabel}님, 이번 호 핵심 상권·매물 소식 전달드립니다`,
        brief: `${clientLabel}님께 맞춰 추린 이번 주 상권 흐름과 실매물 요약을 편하게 보시라고 먼저 보내드립니다. 궁금하신 건물은 편하신 시간에 바로 말씀 주세요.`,
      },
      {
        headline: `${clientLabel}님 맞춤 부동산 소식지 도착했습니다`,
        brief: `최근 관심 갖고 계신 권역 흐름과 실제 임차·매매 분위기를 알기 쉽게 정리했습니다.${noteHint ? ` 지난번 말씀 주신 내용도 함께 살폈습니다.` : ''} 편하실 때 가볍게 살펴보시지요.`,
      },
      {
        headline: `[이번 호 브리핑] ${buildingLabel} 외 핵심 흐름 안내`,
        brief: `${clientLabel}님, 요즘 매수·건물주분들이 가장 많이 물어보시는 세금·금리 핵심과 추천 매물을 한 장에 모았습니다. 관심 가시는 곳 있으시면 상세 자료 바로 이어서 드리겠습니다.`,
      },
      {
        headline: `${clientLabel}님, 부담 없이 보실 최신 빌딩 소식입니다`,
        brief: `어려운 용어 빼고 실제 월세 흐름과 주변 상권 변화만 담았습니다. 읽으시면서 궁금한 부분 생기면 카톡이나 전화로 편하게 여쭤봐 주세요.`,
      },
      {
        headline: `이번 주 꼭 보실 만한 상권·매물 한눈에 정리했습니다`,
        brief: `${clientLabel}님 기준에 맞는 건물을 고르실 때 참고하실 핵심 흐름을 담았습니다. 관심 매물이 눈에 띄시면 상세 안내서도 바로 챙겨드리겠습니다.`,
      },
    ];
  }

  if (effectiveKind === 'dealcard') {
    return [
      {
        headline: `${buildingLabel} 핵심 조건 한눈에 보실 수 있게 정리했습니다`,
        brief: `${clientLabel}님, 해당 매물의 위치와 규모, 가격 기준을 먼저 요약 카드로 보내드립니다.${noteHint ? ` 앞서 남기신 조건에 맞춰 주요 포인트만 추렸습니다.` : ''} 보시고 의향 있으시면 상세 제안서(IM)도 이어서 준비하겠습니다.`,
      },
      {
        headline: `${clientLabel}님께 먼저 보여드리는 ${buildingLabel} 요약 카드`,
        brief: `긴 서류보다 핵심 입지와 층별 구성을 먼저 30초 만에 확인하실 수 있도록 정리했습니다. 현장 임장이나 추가 자료가 필요하시면 바로 말씀해 주세요.`,
      },
      {
        headline: `[핵심 요약] ${buildingLabel} 입지·조건 안내드립니다`,
        brief: `${clientLabel}님께서 살피시기 좋게 건물 기본 정보와 주변 상권을 깔끔하게 묶었습니다. 편하신 시간에 열어보시고 궁금한 점 바로 회신 주세요.`,
      },
      {
        headline: `${clientLabel}님 조건에 맞춰 ${buildingLabel} 1차 안내 올립니다`,
        brief: `실제 현장 답사 전에 가격대와 입지 장점을 먼저 가볍게 보시도록 요약 카드를 전달드립니다. 관심 이어지시면 세부 임대 현황까지 챙겨드리겠습니다.`,
      },
      {
        headline: `${buildingLabel} 요약 자료 먼저 전달드립니다`,
        brief: `${clientLabel}님, 먼저 큰 그림을 잡으실 수 있게 핵심 요약본을 보내드립니다. 추가 숫자나 현장 방문 일정은 편하실 때 바로 잡아드리겠습니다.`,
      },
    ];
  }

  return [
    {
      headline: `${clientLabel}님 요청하신 ${buildingLabel} 상세 제안서(IM) 보내드립니다`,
      brief: `${clientLabel}님께서 편하게 확인하실 수 있도록 층별 임대 구성과 주변 상권, 입지 장점을 한 번에 정리했습니다.${noteHint ? ` 말씀 주신 사항을 반영해 핵심 중심으로 묶었습니다.` : ''} 살펴보시고 현장 방문 원하시면 일정 잡아드리겠습니다.`,
    },
    {
      headline: `[열람 안내] ${buildingLabel} 맞춤형 상세 자료 도착했습니다`,
      brief: `${clientLabel}님, 실제 건물가치와 월세 흐름을 한눈에 보실 수 있게 상세 제안서를 열람 승인해 드렸습니다. 보시다 궁금하신 부분은 전화나 카톡으로 바로 설명 올리겠습니다.`,
    },
    {
      headline: `${clientLabel}님, ${buildingLabel} 세부 임대·입지 분석본 공유드립니다`,
      brief: `${input.openCount > 0 ? '앞서 관심 있게 살펴보신 흐름에 맞춰 ' : ''}실제 매수 의사결정에 꼭 필요한 항목만 알기 쉽게 담았습니다. 이번 주 편하신 시간에 현장 브리핑도 가능하니 편히 말씀 주세요.`,
    },
    {
      headline: `${buildingLabel} 상세 안내서(IM) 열람 링크 전달드립니다`,
      brief: `${clientLabel}님 기준에서 장점과 체크하실 포인트를 과장 없이 그대로 정리했습니다. 링크 눌러 바로 확인하실 수 있고, 추가 비교 매물도 함께 안내해 드릴 수 있습니다.`,
    },
    {
      headline: `${clientLabel}님을 위해 준비한 ${buildingLabel} 상세 브리핑입니다`,
      brief: `핵심 입지, 예상 월세 수입, 건물 관리 상태를 차분히 살피실 수 있도록 정리했습니다. 자료 보신 뒤 원하시는 방향 말씀해 주시면 맞춰서 이어가겠습니다.`,
    },
  ];
}

function pickNonRepeatingFallback(
  pool: AiReplyVariant[],
  avoidReplies: readonly string[],
  attemptSeed: number,
): AiReplyVariant {
  const normalizedAvoid = avoidReplies
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const candidates = pool.filter((variant) => {
    const joined = `${variant.headline} ${variant.brief}`.replace(/\s+/g, ' ').trim();
    return !normalizedAvoid.some(
      (avoid) =>
        joined.includes(avoid) ||
        avoid.includes(variant.headline.trim()) ||
        avoid.includes(variant.brief.trim()),
    );
  });
  const usable = candidates.length > 0 ? candidates : pool;
  return usable[Math.abs(attemptSeed) % usable.length];
}

function tryExtractJson(content: string): { headline?: string; brief?: string } | null {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();
  const tryParse = (s: string) => {
    try {
      const parsed: unknown = JSON.parse(s);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as { headline?: string; brief?: string };
      }
      return null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return tryParse(cleaned.slice(start, end + 1));
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error || !guard.user?.id) {
      return (
        guard.error ||
        NextResponse.json(
          { ok: false, error: '인증이 필요합니다. 다시 로그인해 주세요.' },
          { status: 401 },
        )
      );
    }

    const quotaErr = await enforceBrokerAiQuota(req, guard.user.id, 'inbox_ai_reply', {
      perMinute: AI_REPLY_RATE_LIMIT.max,
    });
    if (quotaErr) return quotaErr;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
    }

    const parsed = aiReplyRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const avoidList = (input.avoidReplies ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
    const pool = buildFallbackPool(input);
    const fallback = pickNonRepeatingFallback(pool, avoidList, input.attemptSeed);

    const temperature = avoidList.length === 0 ? 0.45 : avoidList.length === 1 ? 0.72 : 0.85;
    const systemPrompt = [
      '당신은 20년 경력의 상업용 부동산 전문 공인중개사입니다.',
      '고객(매수자 또는 건물주)에게 카카오톡으로 자료(IM·딜카드·뉴스레터)를 건넬 때 쓰는 정중하고 쉬운 한국어 안내 제목(headline)과 본문(brief)을 JSON으로만 반환하세요.',
      '제약:',
      '1) 어려운 금융/외래어 약어(캡레이트, 밸류업, 레버리지, LTV, IRR 등)를 쓰지 말고 쉬운 우리말을 쓰세요.',
      '2) 연령 지칭(60대, 70대 등)이나 과장·투자 보장 표현(무조건 상승, 수익 보장 등)을 쓰지 마세요.',
      '3) 입력에 없는 금액·수익률 등 새 숫자를 지어내지 마세요.',
      '4) JSON 형식: { "headline": "45자 이내", "brief": "160자 이내 2~3문장" }',
    ].join('\n');

    const userPrompt = [
      `- 고객명: ${input.clientName}`,
      input.clientRole ? `- 고객 역할: ${input.clientRole}` : '',
      input.buildingTitle ? `- 관련 매물: ${input.buildingTitle}` : '',
      `- 발송 자료 종류: ${input.assetKind}`,
      `- 기존 열람 횟수: ${input.openCount}회`,
      input.lastEventText ? `- 최근 반응: ${input.lastEventText}` : '',
      input.callNote ? `- 통화·상담 메모: ${input.callNote}` : '',
      avoidList.length > 0
        ? `\n[중복 금지 — 아래 이전 문구와 어휘·문장 구조를 다르게 새로 작성하세요]\n${avoidList.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const llm = await callLLM(
        {
          systemPrompt,
          userPrompt,
          model: getModel('luna'),
          temperature,
          maxTokens: 1024,
          responseFormat: 'json_object',
        },
        { allowMock: false },
      );

      if (!(llm as { isMock?: boolean }).isMock && typeof llm.content === 'string') {
        const extracted = tryExtractJson(llm.content);
        const h = extracted?.headline ? humanizeBuyerCopy(extracted.headline).trim() : '';
        const b = extracted?.brief ? humanizeBuyerCopy(extracted.brief).trim() : '';
        const isRepeated = avoidList.some(
          (avoid) => avoid.includes(h) || avoid.includes(b) || (h && b && avoid === `${h}\n${b}`),
        );
        if (h.length >= 6 && b.length >= 16 && !isRepeated) {
          return NextResponse.json({
            ok: true,
            result: {
              headline: h.slice(0, 60),
              brief: b.slice(0, 260),
              source: 'llm',
            },
          });
        }
      }
    } catch (llmError: unknown) {
      log.warn('[inbox/ai-reply] falling back to deterministic pool:', llmError instanceof Error ? llmError.message : llmError);
    }

    return NextResponse.json({
      ok: true,
      result: {
        headline: humanizeBuyerCopy(fallback.headline).trim(),
        brief: humanizeBuyerCopy(fallback.brief).trim(),
        source: 'fallback',
      },
    });
  } catch (error: unknown) {
    log.error('[inbox/ai-reply] unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: 'AI 답장 초안을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 },
    );
  }
}
