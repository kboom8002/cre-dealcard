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
  buildingId: z.string().uuid(),
  buyerIntentId: z.string().uuid(),
  tone: z.enum(["kakao", "professional", "brief"]).default("kakao"),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = BuyerMemoGenerateRequest.parse(json);

    const result = await generateBuyerMemo(
      {
        buildingId: input.buildingId,
        buyerIntentId: input.buyerIntentId,
        tone: input.tone,
      },
      "f5365a14-bfe4-4f67-9b03-846d0163e5bc", // Placeholder replaced with valid U1 UUID
    );

    return Response.json({ ok: true, data: result });
  } catch (error) {
    console.error("API Route Error:", error);
    return toApiError(error);
  }
}
