/**
 * POST /api/broker/tenant-intents/from-memo
 * Auth: Required (broker or admin)
 */
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";
import { createTenantIntentFromMemo } from "@/domain/lease/tenant-intent";
import { toApiError } from "@/lib/api-error";

const TenantIntentFromMemoRequest = z.object({
  memo: z.string().min(5),
  clientId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const input = TenantIntentFromMemoRequest.parse(json);

    const result = await createTenantIntentFromMemo(
      {
        memo: input.memo,
        clientId: input.clientId,
      },
      user!.id,
    );

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    console.error("Tenant Intents From Memo Error:", error);
    return toApiError(error);
  }
}
