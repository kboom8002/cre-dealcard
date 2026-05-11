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

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = BuyerIntentFromMemoRequest.parse(json);

    const result = await createBuyerIntentFromMemo(
      { memo: input.memo },
      "00000000-0000-0000-0000-000000000000", // Placeholder — production uses auth session
    );

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
