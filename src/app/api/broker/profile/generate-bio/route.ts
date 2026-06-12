/**
 * POST /api/broker/profile/generate-bio
 *
 * 구조화된 브로커 프로필 정보를 받아 SEO/AEO에 최적화된
 * 한국어 자기소개를 GPT-4o로 생성합니다.
 * Auth: Required (broker or admin).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { callLLM } from '@/ai/llm-client';
import { requireBroker } from '@/lib/auth-guard';

const GenerateBioRequest = z.object({
  name: z.string().min(1).max(30),
  company: z.string().max(50).optional(),
  regions: z.array(z.string()).max(10).optional(),
  assets: z.array(z.string()).max(10).optional(),
  careerStartYear: z.number().min(1980).max(2026).optional(),
  dealCount: z.number().min(0).optional(),
  dealSizeRange: z.string().optional(),
  dealSpecialty: z.array(z.string()).max(5).optional(),
  buyerTypes: z.array(z.string()).max(5).optional(),
  licenseNumber: z.string().max(30).optional(),
});

const CURRENT_YEAR = new Date().getFullYear();

function buildPrompt(input: z.infer<typeof GenerateBioRequest>): string {
  const regions = input.regions?.join(', ') || '미지정';
  const assets = input.assets?.join(', ') || '미지정';
  const careerYears =
    input.careerStartYear ? `${CURRENT_YEAR - input.careerStartYear}` : '미공개';
  const dealSpecialty = input.dealSpecialty?.join(', ') || '미지정';
  const buyerTypes = input.buyerTypes?.join(', ') || '미지정';

  return `입력 정보:
이름: ${input.name}
소속: ${input.company || '미공개'}
전문 지역: ${regions}
전문 자산유형: ${assets}
경력 시작: ${input.careerStartYear ?? '미공개'}년 (경력 ${careerYears}년)
총 거래 건수: ${input.dealCount ?? '미공개'}건
거래 규모: ${input.dealSizeRange || '미공개'}
딜 전문 유형: ${dealSpecialty}
매수자 유형: ${buyerTypes}
자격증 번호: ${input.licenseNumber || '미공개'}`;
}

const SYSTEM_PROMPT = `당신은 한국 상업용 부동산 중개인 프로필 작성 전문가입니다.
다음 정보를 기반으로 SEO/AEO에 최적화된 한국어 자기소개를 200~300자로 작성하세요.

작성 규칙:
- 구체적인 수치(경력 연수, 거래 건수, 거래 금액대)를 포함
- 전문 지역과 자산유형을 명시
- 공인중개사 자격을 언급 (있는 경우)
- "~님에게 연락주세요" 같은 CTA 포함하지 않기
- 전문적이되 따뜻한 톤
- 검색 키워드 자연스럽게 포함: {지역명} + {자산유형} + 공인중개사/중개사
- "미공개"로 표시된 항목은 자기소개에서 생략
- 마크다운 기호 없이 순수 텍스트로 작성`;

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  try {
    const json = await req.json();
    const parsed = GenerateBioRequest.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const userPrompt = buildPrompt(parsed.data);

    const result = await callLLM(
      {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        model: 'gpt-5.4',
        temperature: 0.7,
        maxTokens: 600,
      },
      { timeoutMs: 15000 },
    );

    return NextResponse.json({ ok: true, bio: result.content.trim() });
  } catch (error: unknown) {
    console.error('[profile/generate-bio] Error:', error);
    const message =
      error instanceof Error ? error.message : 'AI 자기소개 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
