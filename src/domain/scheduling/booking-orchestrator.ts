import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent } from "@/domain/analytics/record-event";

export interface BookingResult {
  success: boolean;
  reason?: string;
  bookingId?: string;
  holdUntil?: string;
}

export async function createBookingFromMatch(params: {
  matchResultId?: string;
  slotId: string;
  requesterId: string;
  buyerIntentId?: string;
  gateRequestId?: string;
  domain?: string;
}): Promise<BookingResult> {
  const supabase = createServiceClient();

  // 1. 슬롯 가용성 확인 (Optimistic Locking)
  const { data: slot } = await supabase
    .from('availability_slots')
    .select('*')
    .eq('id', params.slotId)
    .eq('status', 'available')  // 정확히 available인 경우만
    .single();

  if (!slot) {
    return { success: false, reason: 'slot_unavailable' };
  }

  // 2. Hold 생성 (도메인별 타임아웃)
  const holdDuration = getHoldDuration(params.domain);
  const holdUntil = new Date(Date.now() + holdDuration).toISOString();

  // CAS(Compare-And-Swap) 패턴
  const { error: holdError, count } = await supabase
    .from('availability_slots')
    .update({
      status: 'held',
      held_by: params.requesterId,
      held_until: holdUntil,
    })
    .eq('id', params.slotId)
    .eq('status', 'available');

  if (holdError || count === 0) {
    return { success: false, reason: 'concurrent_booking' };
  }

  // 3. Booking 레코드 생성
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      slot_id: params.slotId,
      requester_id: params.requesterId,
      buyer_intent_id: params.buyerIntentId,
      status: 'hold',
      hold_expires_at: holdUntil,
      gate_request_id: params.gateRequestId,
      match_result_id: params.matchResultId,
    })
    .select('id')
    .single();

  if (bookingError || !booking) {
    // 롤백 로직 (필요시)
    await supabase.from('availability_slots').update({ status: 'available', held_by: null, held_until: null }).eq('id', params.slotId);
    return { success: false, reason: 'booking_creation_failed' };
  }

  // 4. 이벤트 기록
  await recordEvent(supabase, {
    actorId: params.requesterId,
    eventType: 'booking_hold_created',
    entityType: 'booking',
    entityId: booking.id,
    metadata: {
      slot_id: params.slotId,
      owner_id: slot.owner_id,
      hold_until: holdUntil,
      match_result_id: params.matchResultId,
    },
  });

  return { success: true, bookingId: booking.id, holdUntil };
}

function getHoldDuration(domain?: string): number {
  switch (domain) {
    case 'wedding':     return 72 * 60 * 60 * 1000;  // 72시간
    case 'consulting':  return 48 * 60 * 60 * 1000;  // 48시간
    case 'counseling':  return 30 * 60 * 1000;        // 30분
    default:            return 24 * 60 * 60 * 1000;   // 24시간
  }
}
