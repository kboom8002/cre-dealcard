import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvent } from "@/domain/analytics/record-event";

export interface ExpiryCronResult {
  expiredCount: number;
  success: boolean;
  error?: string;
}

export async function expireHeldSlots(supabase: SupabaseClient): Promise<ExpiryCronResult> {
  try {
    const now = new Date().toISOString();

    // 1. 만료된 hold를 available로 복원
    const { data: expiredHolds, error: updateError } = await supabase
      .from('availability_slots')
      .update({ status: 'available', held_by: null, held_until: null })
      .eq('status', 'held')
      .lt('held_until', now)
      .select('id, owner_id, held_by');

    if (updateError) {
      console.error("[expireHeldSlots] Expiry update failed:", updateError.message);
      return { expiredCount: 0, success: false, error: updateError.message };
    }

    const expiredCount = expiredHolds?.length ?? 0;

    // 2. 대응하는 booking을 cancelled로 변경 및 대기열 처리
    if (expiredHolds && expiredCount > 0) {
      for (const slot of expiredHolds) {
        await supabase
          .from('bookings')
          .update({ status: 'cancelled', cancellation_reason: 'hold_expired' })
          .eq('slot_id', slot.id)
          .eq('status', 'hold');

        // 대기열 우선순위 1순위 찾기
        const { data: waitlistTop } = await supabase
          .from('waitlist_entries')
          .select('*')
          .eq('slot_id', slot.id)
          .eq('status', 'waiting')
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (waitlistTop) {
          await supabase
            .from('waitlist_entries')
            .update({ status: 'notified', notification_sent: true })
            .eq('id', waitlistTop.id);

          // 이벤트 기록 (알림)
          await recordEvent(supabase, {
            actorId: 'system',
            eventType: 'slot_hold_expired',
            entityType: 'availability_slot',
            entityId: slot.id,
            metadata: {
              owner_id: slot.owner_id,
              previous_holder: slot.held_by,
              waitlist_notified: waitlistTop.requester_id,
            },
          });
        } else {
          // 대기열이 없는 경우 단순 만료 이벤트
          await recordEvent(supabase, {
            actorId: 'system',
            eventType: 'slot_hold_expired',
            entityType: 'availability_slot',
            entityId: slot.id,
            metadata: {
              owner_id: slot.owner_id,
              previous_holder: slot.held_by,
            },
          });
        }
      }
    }

    return {
      expiredCount,
      success: true,
    };
  } catch (err: any) {
    console.error("[expireHeldSlots] Unexpected cron error:", err);
    return {
      expiredCount: 0,
      success: false,
      error: err.message ?? String(err),
    };
  }
}
