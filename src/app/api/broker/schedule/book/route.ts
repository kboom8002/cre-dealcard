import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createBookingFromMatch } from "@/domain/scheduling/booking-orchestrator";

// POST /api/broker/schedule/book - 임장 예약 슬롯 Hold 신청 (CAS 낙관적 락 패턴)
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { slotId, requesterId, gateRequestId, matchResultId, fitScore, pricing } = body;

    if (!slotId || !requesterId) {
      return NextResponse.json({ error: "필수 파라미터가 누락되었습니다. (slotId, requesterId)" }, { status: 400 });
    }

    // 오케스트레이터를 호출하여 Compare-And-Swap 방식으로 Hold 트랜잭션 수행
    const result = await createBookingFromMatch({
      slotId,
      requesterId,
      gateRequestId: gateRequestId || undefined,
      buyerIntentId: matchResultId || undefined, // matchResultId를 buyerIntentId로 대응
    });

    if (!result.success) {
      // 409 Conflict: 이미 다른 사용자에 의해 Hold/예약 중인 경우
      return NextResponse.json(
        { error: result.reason || "예약 슬롯 선점에 실패했습니다. 이미 사용 중입니다." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
      holdUntil: result.holdUntil,
      message: "슬롯 선점(Hold)이 완료되었습니다. 24시간 내에 확정해야 합니다.",
    });
  } catch (err: any) {
    console.error("[Schedule Book POST] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
