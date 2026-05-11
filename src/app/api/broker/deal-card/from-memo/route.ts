/**
 * POST /api/broker/deal-card/from-memo
 *
 * Create Building Mini Truth, Building Signal Card, and Blind Teaser from broker memo.
 * Auth: Required (broker or admin).
 *
 * Source: docs/08-api-contracts.md section 7
 */
import { z } from "zod/v4";
import { brokerDealCardFromMemo } from "@/domain/building/broker-deal-card";
import { toApiError } from "@/lib/api-error";

const BrokerDealCardFromMemoRequest = z.object({
  memo: z.string().min(5),
  visibilityPreference: z.enum(["blind", "internal"]).default("blind"),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = BrokerDealCardFromMemoRequest.parse(json);

    // MVP: use anonymous user flow for simplicity
    // In production, extract user session from Supabase auth
    const result = await brokerDealCardFromMemo(
      {
        memo: input.memo,
        visibilityPreference: input.visibilityPreference,
      },
      // Placeholder replaced with valid U1 UUID
      "f5365a14-bfe4-4f67-9b03-846d0163e5bc",
    );

    return Response.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    console.error("Deal Card Route Error:", error);
    return toApiError(error);
  }
}
