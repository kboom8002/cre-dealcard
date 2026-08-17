import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { callLLM } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import { z } from "zod/v4";

const FloorLeaseSchema = z.object({
  floor: z.string(),
  tenant_type: z.string().optional(),
  deposit_manwon: z.number().optional(),
  rent_manwon: z.number().optional(),
  mgmt_fee_manwon: z.number().optional(),
  is_vacant: z.boolean().optional(),
  contract_start: z.string().optional(),
  contract_end: z.string().optional(),
});

const ParseResultSchema = z.object({
  floorLeases: z.array(FloorLeaseSchema),
  monthlyRent: z.number(),
  totalDeposit: z.number(),
  mgmtFeeTotal: z.number(),
  vacancyPct: z.number(),
});

const SYSTEM_PROMPT = `당신은 상업용 부동산 렌트롤(임대차 현황) 텍스트를 구조화된 JSON으로 변환하는 전문 파서입니다.

사용자가 자유로운 형식의 텍스트로 임대차 현황을 입력합니다. 다양한 형식을 지원해야 합니다:

## 입력 예시들
- 간략형: "B1 라이브펍(5,000/450), 1F 카페(8,000/600), 2F 공실"
- 표형: "1층 스타벅스 보증금 1억 월세 800만, 2층 사무실 5000/300"
- 상세형: "1층 약국 보증금 8000만원 월세 600만원 관리비 50만원 계약기간 2023.03~2026.02"

## 금액 규칙
- 금액 단위는 만원(manwon)으로 통일
- "1억" = 10000만원, "5천만원" = 5000만원
- "보증금/월세" 형식: 괄호 안 (보증금/월세)
- 관리비가 명시되지 않으면 0

## 공실 판별
- "공실", "비어있음", "vacant", 월세 0원 → is_vacant: true

반드시 아래 JSON 형식으로만 응답하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요:
{
  "floorLeases": [...],
  "monthlyRent": 총 월임대료(만원),
  "totalDeposit": 총 보증금(만원),
  "mgmtFeeTotal": 총 관리비(만원),
  "vacancyPct": 공실률(0~100 숫자)
}`;

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 5) {
      return NextResponse.json(
        { error: "렌트롤 텍스트를 입력해 주세요." },
        { status: 400 }
      );
    }

    const result = await callLLM({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: text.trim(),
      model: getModel("luna"),
      temperature: 0.1,
      maxTokens: 2000,
    });

    // Extract JSON from response (handle possible markdown wrapping)
    let jsonStr = result.content.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const parsed = JSON.parse(jsonStr);
    const validated = ParseResultSchema.parse(parsed);

    return NextResponse.json(validated);
  } catch (err: any) {
    console.error("[rent-roll/parse-text] Error:", err);
    return NextResponse.json(
      { error: err.message || "렌트롤 파싱에 실패했습니다." },
      { status: 400 }
    );
  }
}
