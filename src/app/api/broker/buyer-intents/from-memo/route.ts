/**
 * POST /api/broker/buyer-intents/from-memo
 *
 * Normalize buyer memo into structured Buyer Intent Lite.
 * Auth: Optional (demo mode falls back to null userId).
 *
 * Source: docs/08-api-contracts.md section 9
 */
import { z } from "zod/v4";
import { createBuyerIntentFromMemo } from "@/domain/buyer/buyer-intent";
import { toApiError } from "@/lib/api-error";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireBroker } from '@/lib/auth-guard';
import { after } from "next/server";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


const BuyerIntentFromMemoRequest = z.object({
  memo: z.string().min(5),
  isAsync: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = BuyerIntentFromMemoRequest.parse(json);

    // Try to get authenticated user — fall back to null for demo usage
    let actorId: string | null = null;
    try {
      const supabase = await createServerSupabaseClient();
      const { data: userAuth } = await supabase.auth.getUser();
      actorId = userAuth?.user?.id ?? null;
    } catch {
      // createClient may fail if cookies unavailable — keep null
    }

    if (input.isAsync && actorId) {
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

      after(async () => {
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
          await runAutoMatchForBuyer(result.buyerIntentId, actorId ?? "system");
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
    after(async () => {
      try {
        const { runAutoMatchForBuyer } = await import("@/domain/matching/auto-matcher");
        await runAutoMatchForBuyer(result.buyerIntentId, actorId ?? "system");
      } catch (err) {
        log.error("Background auto-match for buyer failed:", err);
      }
    });

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
