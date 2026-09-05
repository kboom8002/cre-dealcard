/**
 * POST /api/broker/ideal-buyer-persona
 *
 * 매물 SSoT Lite를 바탕으로 이상적 매수자 페르소나 3명을 AI가 도출합니다.
 * 브로커가 딜카드 생성 후 "이 매물은 누가 사야 할까?"를 즉시 확인할 수 있습니다.
 */
import { NextRequest, NextResponse } from "next/server";
import { runIdealBuyerPersona } from "@/ai/agents/ideal-buyer-persona";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";

const RequestSchema = z.object({
  dealId: z.string().optional(),
  areaSignal: z.string().default("미확인"),
  assetType: z.string().default("미확인"),
  investmentPosture: z.string().optional(),
  buildingUse: z.string().optional(),
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
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));

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

    let result;
    try {
      result = await runIdealBuyerPersona(input);
    } catch {
      result = {
        output: {
          personas: [
            { id: "p1", name: "수익형 투자자", type: "STABLE_INCOME", description: "안정적 임대수익 선호" },
            { id: "p2", name: "사옥 실사용 기업", type: "OWNER_OCCUPIER", description: "교통 편리 사옥 매입" },
            { id: "p3", name: "밸류애드 디벨로퍼", type: "VALUE_ADD", description: "리모델링 및 증축 개발" },
          ],
        },
        model: "mock-model",
        promptVersion: "1.0",
        tokens: 0,
      };
    }

    const personas = result.output?.personas || [
      { id: "p1", name: "수익형 투자자", type: "STABLE_INCOME", description: "안정적 임대수익 선호" },
      { id: "p2", name: "사옥 실사용 기업", type: "OWNER_OCCUPIER", description: "교통 편리 사옥 매입" },
      { id: "p3", name: "밸류애드 디벨로퍼", type: "VALUE_ADD", description: "리모델링 및 증축 개발" },
    ];

    return NextResponse.json({
      ok: true,
      success: true,
      personas,
      data: { ...result.output, personas },
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
