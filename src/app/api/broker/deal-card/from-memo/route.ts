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
import { requireBroker } from "@/lib/auth-guard";
import { NextRequest } from "next/server";
import { validateMemoQuality } from "@/domain/building/memo-quality-gate";

const BrokerDealCardFromMemoRequest = z.object({
  memo: z.string().min(5),
  visibilityPreference: z.enum(["blind", "internal"]).default("blind"),
});

export async function POST(req: NextRequest) {
  // Require broker or admin role
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const input = BrokerDealCardFromMemoRequest.parse(json);

    // Memo Quality Gate validation
    const quality = validateMemoQuality(input.memo);
    if (!quality.pass) {
      return Response.json(
        {
          ok: false,
          code: "MEMO_QUALITY_INSUFFICIENT",
          message: quality.suggestion,
          details: quality,
        },
        { status: 422 }
      );
    }

    const result = await brokerDealCardFromMemo(
      {
        memo: input.memo,
        visibilityPreference: input.visibilityPreference,
      },
      user!.id,
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
