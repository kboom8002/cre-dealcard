import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// POST /api/broker/schedule/confirm - Hold 상태의 임장 예약을 최종 확정
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { bookingId } = body;

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId가 누락되었습니다." }, { status: 400 });
    }

    // 1. 예약 데이터 조회 및 소유권 확인
    const { data: booking, error: getError } = await supabase
      .from("bookings")
      .select("*, availability_slots(*)")
      .eq("id", bookingId)
      .single();

    if (getError || !booking) {
      return NextResponse.json({ error: "해당 예약을 찾을 수 없습니다." }, { status: 404 });
    }

    // 보안: 슬롯의 소유자(owner_id)가 로그인한 중개인(user.id)이어야 확정 가능
    if (booking.availability_slots.owner_id !== user.id) {
      return NextResponse.json({ error: "이 예약을 확정할 권한이 없습니다." }, { status: 403 });
    }

    if (booking.status !== "hold") {
      return NextResponse.json(
        { error: `Hold 상태의 예약만 확정할 수 있습니다. (현재 상태: ${booking.status})` },
        { status: 400 }
      );
    }

    // 2. 트랜잭션: 예약 상태 -> confirmed, 슬롯 상태 -> confirmed
    const { error: bookingErr } = await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", bookingId);

    if (bookingErr) {
      console.error("[Schedule Confirm] Booking update error:", bookingErr);
      return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    }

    const { error: slotErr } = await supabase
      .from("availability_slots")
      .update({ status: "confirmed" })
      .eq("id", booking.slot_id);

    if (slotErr) {
      console.error("[Schedule Confirm] Slot update error:", slotErr);
      return NextResponse.json({ error: slotErr.message }, { status: 500 });
    }

    // 3. (Phase 2 연동) 예약 확정 안내 알림 발송 시도
    try {
      const { sendKakaoAlimtalk } = await import("@/lib/notification/notification-service");
      const { data: brokerProfile } = await supabase
        .from("broker_profiles")
        .select("name, phone")
        .eq("user_id", user.id)
        .maybeSingle();

      if (brokerProfile?.phone) {
        // 중개인에게 확정 사실 알림
        await sendKakaoAlimtalk({
          recipientPhone: brokerProfile.phone,
          templateId: "TPL_IM_VIEW_ALERT", // 임시로 알림톡 인프라 재활용 또는 SMS 전송
          variables: {
            "#{brokerName}": brokerProfile.name || "중개인",
            "#{buildingName}": "매물 임장 일정 확정",
            "#{dwellTime}": "최종 예약 승인",
            "#{viewUrl}": "https://www.credeal.net/broker/schedule",
          },
          fallbackSms: `[CRE Deal] 📅 임장 예약 확정 알림: 예약번호 ${bookingId}가 최종 승인되었습니다.`,
        });
      }
    } catch (notifErr) {
      console.warn("[Schedule Confirm] Notification failed:", notifErr);
    }

    return NextResponse.json({
      success: true,
      message: "임장 예약이 최종 확정되었습니다.",
    });
  } catch (err: any) {
    console.error("[Schedule Confirm POST] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
