/**
 * POST /api/broker/buyer-intents/from-memo
 *
 * Normalize buyer memo into structured Buyer Intent Lite.
 * Auth: Required (broker or admin).
 *
 * Source: docs/08-api-contracts.md section 9
 */
import { z } from "zod/v4";
import { createBuyerIntentFromMemo } from "@/domain/buyer/buyer-intent";
import { toApiError } from "@/lib/api-error";
import { requireBroker } from '@/lib/auth-guard';
import { enforceBrokerAiQuota } from '@/lib/ai-quota-guard';
import { NextRequest, NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/server/after-safe";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

export const maxDuration = 60;


const BuyerIntentFromMemoRequest = z.object({
  memo: z.string().trim().min(5).max(4000),
  isAsync: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  if (!guard.user?.id) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
      { status: 401 },
    );
  }
  const actorId = guard.user.id;

  try {
    const json = await req.json();
    const input = BuyerIntentFromMemoRequest.parse(json);

    const quotaErr = await enforceBrokerAiQuota(req, actorId, "buyer_intent_from_memo", {
      perMinute: 15,
    });
    if (quotaErr) return quotaErr;

    if (input.isAsync) {
      const jobId = crypto.randomUUID();
      const { createServiceClient } = await import("@/lib/supabase/service");
      const supabaseAdmin = createServiceClient();
      
      await supabaseAdmin.from("ai_runs").insert({
        id: jobId,
        user_id: actorId,
        run_type: "buyer_intent_async_job",
        input_ref: { memo: input.memo },
        status: "started"
      });

      runAfterResponse("buyer-intent-from-memo-async", async () => {
        try {
          const result = await createBuyerIntentFromMemo(
            { memo: input.memo },
            actorId,
          );

          await supabaseAdmin.from("ai_runs").update({
            status: "completed",
            output_ref: { buyerIntentId: result.buyerIntentId }
          }).eq("id", jobId);

          const { runAutoMatchForBuyer } = await import("@/domain/matching/auto-matcher");
          await runAutoMatchForBuyer(result.buyerIntentId, actorId);
        } catch (err: any) {
          log.error("Async buyer intent creation failed:", err);
          await supabaseAdmin.from("ai_runs").update({
            status: "failed",
            error: err.message || "Unknown error"
          }).eq("id", jobId);
        }
      });

      return Response.json({ ok: true, jobId, isAsync: true });
    }

    const result = await createBuyerIntentFromMemo(
      { memo: input.memo },
      actorId,
    );

    // 이벤트 트리거 매칭: 백그라운드에서 매칭 엔진 실행 (응답 차단 안함)
    runAfterResponse("buyer-intent-auto-match", async () => {
      try {
        const { runAutoMatchForBuyer } = await import("@/domain/matching/auto-matcher");
        await runAutoMatchForBuyer(result.buyerIntentId, actorId);
      } catch (err) {
        log.error("Background auto-match for buyer failed:", err);
      }
    });

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
