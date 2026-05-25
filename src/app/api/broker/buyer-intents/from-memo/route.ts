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

const BuyerIntentFromMemoRequest = z.object({
  memo: z.string().min(5),
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

    const result = await createBuyerIntentFromMemo(
      { memo: input.memo },
      actorId,
    );

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
