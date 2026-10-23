import { NextResponse } from "next/server";
import { expireHeldSlots } from "@/domain/scheduling/hold-expiry-cron";
import { expireGateRequests } from "@/domain/gate/gate-expiry-cron";
import { createServiceClient } from "@/lib/supabase/service";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


// GET /api/cron/hold-expiry - 만료된 Hold 및 열람요청(Gate Request) 자동 회수 Cron
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Vercel Cron 보안 검증
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
    }

    log.info("[Hold Expiry Cron] Starting slot hold & gate request expiry cleanup job...");

    const supabase = createServiceClient();
    const [result, gateResult] = await Promise.all([
      expireHeldSlots(supabase),
      expireGateRequests(supabase).catch((e) => ({ expiredCount: 0, success: false, error: e?.message })),
    ]);

    if (!result.success) {
      log.error("[Hold Expiry Cron] Process failed:", result.error);
      return NextResponse.json({ error: result.error || "실패" }, { status: 500 });
    }

    log.info(
      `[Hold Expiry Cron] Finished. Expired bookings: ${result.expiredCount}, Expired gates: ${gateResult.expiredCount}`
    );

    return NextResponse.json({
      success: true,
      expired_bookings: result.expiredCount,
      expired_gate_requests: gateResult.expiredCount,
    });
  } catch (err: any) {
    log.error("[Hold Expiry Cron] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Cron 실행 중 서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
