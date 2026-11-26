/**
 * POST /api/broker/tenant-intents/from-memo
 * Auth: Required (broker or admin)
 */
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { enforceBrokerAiQuota } from "@/lib/ai-quota-guard";
import { NextRequest, NextResponse } from "next/server";
import { createTenantIntentFromMemo } from "@/domain/lease/tenant-intent";
import { toApiError } from "@/lib/api-error";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

export const maxDuration = 60;

const TenantIntentFromMemoRequest = z.object({
  memo: z.string().trim().min(5).max(10_000),
  clientId: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const input = TenantIntentFromMemoRequest.parse(json);

    const quotaErr = await enforceBrokerAiQuota(req, user?.id ?? "", "tenant_intent_from_memo");
    if (quotaErr) return quotaErr;

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
    log.error("Tenant Intents From Memo Error:", error);
    return toApiError(error);
  }
}
