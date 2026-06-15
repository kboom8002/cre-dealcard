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
import { NextRequest, after } from "next/server";
import { validateMemoQuality } from "@/domain/building/memo-quality-gate";

const BrokerDealCardFromMemoRequest = z.object({
  memo: z.string().min(5),
  visibilityPreference: z.enum(["blind", "internal"]).default("blind"),
  photoUrls: z.array(z.string().url()).optional(),
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
        photoUrls: input.photoUrls,
      },
      user!.id,
    );

    // 이벤트 트리거 매칭: 백그라운드에서 매칭 엔진 실행 (응답 차단 안함)
    after(async () => {
      try {
        const { runAutoMatch } = await import("@/domain/matching/auto-matcher");
        await runAutoMatch(result.buildingId, user!.id);
      } catch (err) {
        console.error("Background auto-match failed:", err);
      }
    });

    return Response.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    console.error("Deal Card Route Error:", error);
    return toApiError(error);
  }
}
