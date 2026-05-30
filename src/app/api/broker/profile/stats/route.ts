/**
 * GET /api/broker/profile/stats
 *
 * 인증된 브로커의 종합 실적 통계를 반환합니다.
 * Auth: Required (broker or admin).
 */
import { NextRequest } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { toApiError } from "@/lib/api-error";
import { aggregateBrokerStats } from "@/domain/broker-card/broker-stats-aggregator";

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const stats = await aggregateBrokerStats(user!.id);

    return Response.json({
      ok: true,
      data: stats,
    });
  } catch (error) {
    console.error("Broker Stats Route Error:", error);
    return toApiError(error);
  }
}
