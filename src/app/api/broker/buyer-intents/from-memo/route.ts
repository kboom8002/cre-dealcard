/**
 * POST /api/broker/buyer-intents/from-memo
 *
 * Normalize buyer memo into structured Buyer Intent Lite.
 * Auth: Required (broker).
 *
 * Source: docs/08-api-contracts.md section 9
 */
import { z } from "zod/v4";
import { createBuyerIntentFromMemo } from "@/domain/buyer/buyer-intent";
import { toApiError } from "@/lib/api-error";

const BuyerIntentFromMemoRequest = z.object({
  memo: z.string().min(5),
});

import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = BuyerIntentFromMemoRequest.parse(json);

    const supabase = await createClient();
    const { data: userAuth } = await supabase.auth.getUser();
    const actorId = userAuth?.user?.id || "2d48fdba-b4aa-438a-8970-ac2316688fc3";

    const result = await createBuyerIntentFromMemo(
      { memo: input.memo },
      actorId,
    );

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
