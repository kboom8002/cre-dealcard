/**
 * POST /api/public/im-inquiry
 * 
 * 프라이빗 IM 문의 접수 (비로그인 사용자도 접근 가능)
 * - 신청자 정보를 DB에 저장
 * - 담당 중개인에게 SMS 알림 전송 (Phase 2)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSMS } from "@/lib/sms/send-sms";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      building_id,
      doc_id,
      broker_user_id,
      requester_name,
      requester_phone,
      requester_email,
      message,
    } = body;

    // 필수 필드 검증
    if (!building_id || !broker_user_id || !requester_name || !requester_phone) {
      return NextResponse.json(
        { error: "이름과 연락처는 필수입니다." },
        { status: 400 }
      );
    }

    // 전화번호 형식 기본 검증
    const cleanPhone = requester_phone.replace(/[-\s]/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      return NextResponse.json(
        { error: "올바른 전화번호를 입력해 주세요." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // 1. DB에 문의 레코드 저장
    const { data: inquiry, error: insertErr } = await supabase
      .from("im_inquiry_requests")
      .insert({
        building_id,
        doc_id: doc_id || null,
        broker_user_id,
        requester_name: requester_name.trim(),
        requester_phone: cleanPhone,
        requester_email: requester_email?.trim() || null,
        message: message?.trim() || null,
        source: "im_cta",
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[im-inquiry] Insert error:", insertErr);
      return NextResponse.json(
        { error: "문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }

    // 2. 중개인 전화번호 조회
    const { data: brokerProfile } = await supabase
      .from("broker_profiles")
      .select("phone, name")
      .eq("user_id", broker_user_id)
      .single();

    // 3. SMS 전송 (중개인 전화번호가 있으면)
    let smsSent = false;
    if (brokerProfile?.phone) {
      const smsMessage = `[크리딜] 프라이빗 IM 신청이 도착했습니다.\n신청자: ${requester_name} (${cleanPhone})\n${message ? `메시지: ${message.substring(0, 50)}` : ""}\ncredeal.net 에서 확인하세요.`;
      
      smsSent = await sendSMS(brokerProfile.phone, smsMessage);

      // SMS 전송 결과 업데이트
      if (inquiry?.id) {
        await supabase
          .from("im_inquiry_requests")
          .update({ sms_sent: smsSent })
          .eq("id", inquiry.id);
      }
    }

    return NextResponse.json({
      ok: true,
      inquiry_id: inquiry?.id,
      sms_sent: smsSent,
      message: "프라이빗 IM 신청이 접수되었습니다. 담당 중개인이 곧 연락드리겠습니다.",
    });
  } catch (err: any) {
    console.error("[im-inquiry] Error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
