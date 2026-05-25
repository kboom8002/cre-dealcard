/**
 * POST /api/broker/lease-card/from-memo
 * Auth: Required (broker or admin)
 */
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";
import { brokerLeaseCardFromMemo } from "@/domain/lease/broker-lease-card";
import { toApiError } from "@/lib/api-error";

const LeaseCardFromMemoRequest = z.object({
  memo: z.string().min(5),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const input = LeaseCardFromMemoRequest.parse(json);

    const result = await brokerLeaseCardFromMemo(
      { memo: input.memo },
      user!.id,
    );

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    console.error("Lease Card Route Error:", error);
    return toApiError(error);
  }
}
