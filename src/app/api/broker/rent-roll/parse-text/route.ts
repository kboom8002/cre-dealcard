import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { callLLM } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import { z } from "zod/v4";
import { normalizeTextParsedRentRoll } from "@/lib/rentroll/text-parse-normalize";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


const FloorLeaseSchema = z.object({
  floor: z.string(),
  tenant_type: z.string().optional(),
  tenant_name: z.string().optional(),
  deposit_manwon: z.number().optional(),
  rent_manwon: z.number().optional(),
  mgmt_fee_manwon: z.number().nullish().transform((v) => v ?? undefined),
  is_vacant: z.boolean().optional(),
  lease_state: z.string().nullish().transform((v) => v ?? undefined),
  note: z.string().nullish().transform((v) => v ?? undefined),
  area_sqm: z.number().nullish().transform((v) => v ?? undefined),
  lease_start: z.string().nullish().transform((v) => v ?? undefined),
  lease_end: z.string().nullish().transform((v) => v ?? undefined),
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
- 관리비가 명시되지 않으면 mgmt_fee_manwon 필드를 생략 (0 으로 채우지 말 것 — 명시적 "관리비 0/없음"만 0)

## 공실 판별 (중요)
- 입력에 "공실", "비어있음", "vacant" 이 **명시된** 호실만 is_vacant: true, lease_state: "공실"
- 월세 0원/금액 미기재만으로 공실로 판단하지 말 것. 아래는 공실이 **아니다**:
  - 자가사용: "자가", "사옥", "직영", "본사", "오너" 표기 호실 → lease_state: "자가사용", is_vacant: false
  - 통합계약: "○○(통합계약)" 처럼 같은 임차인이 여러 호실/층을 하나의 계약으로 쓰고 금액은 대표 행에만 적힌 후행 호실 → is_vacant: false, lease_state: "임대중", 임차인 상호는 대표 행과 동일하게 tenant_name 에 기재
- 그 외 임차 중인 호실은 lease_state: "임대중"

## 임차인 상호
- 입력에 상호(예: 고은약국, 로뎀나무내과, 국제와인)가 있으면 반드시 tenant_name 에 **그대로** 보존하고, 업종은 tenant_type 에 기재 (상호를 업종으로 바꾸거나 생략하지 말 것)
- 상호가 없고 업종만 있으면 tenant_name 은 생략

반드시 아래 JSON 형식으로만 응답하세요. 설명이나 마크다운 없이 순수 JSON만 출력하세요:
{
  "floorLeases": [
    {
      "floor": "층 (예: B1, 1층, 2F)",
      "tenant_type": "업종 (예: 카페, 사무실, 공실)",
      "tenant_name": "임차인/상호명 (예: 스타벅스) — 미기재 시 생략",
      "deposit_manwon": 보증금(만원),
      "rent_manwon": 월세(만원),
      "mgmt_fee_manwon": 관리비(만원, 미기재 시 생략),
      "is_vacant": true/false,
      "lease_state": "임대중" | "공실" | "자가사용",
      "area_sqm": 면적(㎡, 미기재 시 생략),
      "lease_start": "계약시작일 (YYYY-MM-DD, 미기재 시 생략)",
      "lease_end": "계약종료일 (YYYY-MM-DD, 미기재 시 생략)"
    }
  ],
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

    // 점유 상태·합계·공실률은 LLM 산술/추정을 믿지 않고 렌트롤 행에서 결정론적으로 재산출 (자가사용·통합계약 후행 ≠ 공실)
    return NextResponse.json(normalizeTextParsedRentRoll(validated));
  } catch (err: any) {
    log.error("[rent-roll/parse-text] Error:", err);
    return NextResponse.json(
      { error: err.message || "렌트롤 파싱에 실패했습니다." },
      { status: 400 }
    );
  }
}
