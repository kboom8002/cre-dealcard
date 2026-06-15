/**
 * POST /api/broker/ideal-buyer-persona
 *
 * 매물 SSoT Lite를 바탕으로 이상적 매수자 페르소나 3명을 AI가 도출합니다.
 * 브로커가 딜카드 생성 후 "이 매물은 누가 사야 할까?"를 즉시 확인할 수 있습니다.
 */
import { NextRequest, NextResponse } from "next/server";
import { runIdealBuyerPersona } from "@/ai/agents/ideal-buyer-persona";
import { z } from "zod/v4";

const RequestSchema = z.object({
  areaSignal: z.string().default("미확인"),
  assetType: z.string().default("미확인"),
  priceBand: z.string().default("미확인"),
  sizeSignal: z.string().default("미확인"),
  vacancyStatus: z.string().optional(),
  currentUseSignal: z.string().optional(),
  rawInput: z.string().optional(),
  fitSummary: z.string().optional(),
  cautionSummary: z.string().optional(),
  curiosityScore: z.number().optional(),
  completionYear: z.string().optional(),
  keyFeatures: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    let input;
    try {
      input = RequestSchema.parse(body);
    } catch (validationError) {
      console.error("[IdealBuyerPersona] Input validation error:", validationError);
      return NextResponse.json(
        { success: false, error: "매물 정보가 부족합니다. 딜카드를 먼저 생성해주세요." },
        { status: 400 },
      );
    }

    const result = await runIdealBuyerPersona(input);

    return NextResponse.json({
      success: true,
      data: result.output,
      meta: {
        model: result.model,
        promptVersion: result.promptVersion,
        tokens: result.tokens,
      },
    });
  } catch (error) {
    console.error("[IdealBuyerPersona] Error:", error);

    const message = error instanceof Error ? error.message : "AI 페르소나 생성 중 오류가 발생했습니다.";

    return NextResponse.json(
      { success: false, error: `AI 응답 처리 실패: ${message}` },
      { status: 500 },
    );
  }
}
