import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvents, type RecordEventInput } from "@/domain/analytics/record-event";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('hold-expiry-cron');


export interface ExpiryCronResult {
  expiredCount: number;
  success: boolean;
  error?: string;
}

export async function expireHeldSlots(supabase: SupabaseClient): Promise<ExpiryCronResult> {
  try {
    const now = new Date().toISOString();

    // 0. 테이블 존재 여부 사전 확인 (미생성 시 조용히 종료)
    const { error: probeErr } = await supabase
      .from('availability_slots')
      .select('id')
      .limit(0);
    
    if (probeErr?.message?.includes('schema cache') || probeErr?.message?.includes('does not exist') || probeErr?.code === 'PGRST204') {
      log.info("[expireHeldSlots] availability_slots table not yet created, skipping.");
      return { expiredCount: 0, success: true };
    }

    // 1. 만료된 hold를 available로 복원
    const { data: expiredHolds, error: updateError } = await supabase
      .from('availability_slots')
      .update({ status: 'available', held_by: null, held_until: null })
      .eq('status', 'held')
      .lt('held_until', now)
      .select('id, owner_id, held_by');

    if (updateError) {
      log.error("[expireHeldSlots] Expiry update failed:", updateError.message);
      return { expiredCount: 0, success: false, error: updateError.message };
    }

    const expiredCount = expiredHolds?.length ?? 0;

    // 2. 대응하는 booking을 cancelled로 변경 및 대기열 처리 (배치)
    if (expiredHolds && expiredCount > 0) {
      const slotIds = expiredHolds.map(s => s.id);

      // (1) Batch cancel bookings
      const { error: bookingErr } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancellation_reason: 'hold_expired' })
        .in('slot_id', slotIds)
        .eq('status', 'hold');
      if (bookingErr) {
        log.warn("[expireHeldSlots] Batch cancel bookings error:", bookingErr.message);
      }

      // (2) Batch fetch waitlist entries for all slots
      const { data: waitlistEntries, error: waitlistErr } = await supabase
        .from('waitlist_entries')
        .select('*')
        .in('slot_id', slotIds)
        .eq('status', 'waiting')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

      if (waitlistErr) {
        log.warn("[expireHeldSlots] Batch fetch waitlists error:", waitlistErr.message);
      }

      // Slots can have multiple waiting entries; pick top-1 per slot
      const topWaitlistBySlot = new Map<string, any>();
      if (waitlistEntries) {
        for (const entry of waitlistEntries) {
          if (!topWaitlistBySlot.has(entry.slot_id)) {
            topWaitlistBySlot.set(entry.slot_id, entry);
          }
        }
      }

      // (3) Batch update notified waitlist entries
      const notifiedWaitlistIds = Array.from(topWaitlistBySlot.values()).map(e => e.id);
      if (notifiedWaitlistIds.length > 0) {
        const { error: notifyErr } = await supabase
          .from('waitlist_entries')
          .update({ status: 'notified', notification_sent: true })
          .in('id', notifiedWaitlistIds);
        if (notifyErr) {
          log.warn("[expireHeldSlots] Batch update waitlist error:", notifyErr.message);
        }
      }

      // (4) Batch record events
      const events: RecordEventInput[] = expiredHolds.map(slot => {
        const waitlistTop = topWaitlistBySlot.get(slot.id);
        return {
          actorId: 'system',
          eventType: 'slot_hold_expired',
          entityType: 'availability_slot',
          entityId: slot.id,
          metadata: {
            owner_id: slot.owner_id,
            previous_holder: slot.held_by,
            ...(waitlistTop ? { waitlist_notified: waitlistTop.requester_id } : {}),
          },
        };
      });

      await recordEvents(supabase, events);
    }

    return {
      expiredCount,
      success: true,
    };
  } catch (err: any) {
    log.error("[expireHeldSlots] Unexpected cron error:", err);
    return {
      expiredCount: 0,
      success: false,
      error: err.message ?? String(err),
    };
  }
}
