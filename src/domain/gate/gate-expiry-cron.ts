import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvent } from "@/domain/analytics/record-event";

export interface ExpiryCronResult {
  expiredCount: number;
  success: boolean;
  error?: string;
}

export async function expireGateRequests(supabase: SupabaseClient): Promise<ExpiryCronResult> {
  try {
    const now = new Date().toISOString();

    // 1. 만료 조건에 맞는 gate_requests 일괄 업데이트
    // status: approved -> expired
    // auto_expired: false -> true
    const { data: expiredRequests, error: updateError } = await supabase
      .from("gate_requests")
      .update({ 
        status: "expired", 
        auto_expired: true 
      })
      .eq("status", "approved")
      .eq("auto_expired", false)
      .lt("expires_at", now)
      .select("id, building_id, requester_id");

    if (updateError) {
      console.error("[expireGateRequests] Expiry update failed:", updateError.message);
      return { expiredCount: 0, success: false, error: updateError.message };
    }

    const expiredCount = expiredRequests?.length ?? 0;

    // 2. 만료된 건들에 대해 활동 이벤트 기록
    if (expiredRequests && expiredCount > 0) {
      for (const req of expiredRequests) {
        await recordEvent(supabase, {
          actorId: req.requester_id,
          eventType: "gate_request_reviewed", // or "gate_auto_expired"
          entityType: "gate_request",
          entityId: req.id,
          metadata: {
            building_id: req.building_id,
            action: "auto_expiry",
            expired_at: now,
          },
        });
      }
    }

    return {
      expiredCount,
      success: true,
    };
  } catch (err: any) {
    console.error("[expireGateRequests] Unexpected cron error:", err);
    return {
      expiredCount: 0,
      success: false,
      error: err.message ?? String(err),
    };
  }
}
