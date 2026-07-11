import { NextResponse } from "next/server";
import { expireHeldSlots } from "@/domain/scheduling/hold-expiry-cron";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/cron/hold-expiry - 만료된 Hold 자동 회수 및 대기열 전파 Cron
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Vercel Cron 보안 검증
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 401 });
    }

    console.log("[Hold Expiry Cron] Starting slot hold expiry cleanup job...");

    const supabase = createServiceClient();
    const result = await expireHeldSlots(supabase);

    if (!result.success) {
      console.error("[Hold Expiry Cron] Process failed:", result.error);
      return NextResponse.json({ error: result.error || "실패" }, { status: 500 });
    }

    console.log(
      `[Hold Expiry Cron] Finished. Expired bookings: ${result.expiredCount}`
    );

    return NextResponse.json({
      success: true,
      expired_bookings: result.expiredCount,
    });
  } catch (err: any) {
    console.error("[Hold Expiry Cron] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Cron 실행 중 서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
