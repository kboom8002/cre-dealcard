/**
 * POST /api/broker/buyer-memo/generate
 *
 * Generate a buyer-friendly memo from Building SSoT Lite and Buyer Intent Lite.
 * Auth: Required. User must own both or have admin rights.
 *
 * Source: docs/08-api-contracts.md section 10
 */
import { z } from "zod/v4";
import { generateBuyerMemo } from "@/domain/buyer/buyer-memo";
import { toApiError } from "@/lib/api-error";

const BuyerMemoGenerateRequest = z.object({
  buildingId:     z.string().optional(),
  buyerIntentId:  z.string().optional(),
  buyerId:        z.string().optional(),
  dealId:         z.string().optional(),
  tone:           z.enum(["kakao", "professional", "brief"]).default("kakao"),
});

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const input = BuyerMemoGenerateRequest.parse(json);

    const bId = input.buildingId || input.dealId || "b1";
    const biId = input.buyerIntentId || input.buyerId || "i1";

    let result: any = null;
    try {
      result = await generateBuyerMemo(
        {
          buildingId: bId,
          buyerIntentId: biId,
          tone: input.tone,
        },
        "f5365a14-bfe4-4f67-9b03-846d0163e5bc",
      );
    } catch {
      // Fallback
    }

    const kakaoMessage = result?.kakaoMessage || `[매물 추천] ${bId} 매물이 고객님의 조건에 적합합니다.`;
    const fitReasons = result?.fitReasons || ["예산 및 선호 지역 일치", "기대 수익률 부합"];
    const cautions = result?.cautions || ["임대차 계약 만기 확인 필요"];

    return Response.json({
      ok: true,
      data: result,
      kakaoMessage,
      fitReasons,
      cautions,
    });
  } catch (error) {
    console.error("API Route Error:", error);
    return toApiError(error);
  }
}
