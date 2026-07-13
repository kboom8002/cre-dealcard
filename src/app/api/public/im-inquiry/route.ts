/**
 * POST /api/public/im-inquiry
 * 
 * 프라이빗 IM 문의 접수 (비로그인 사용자도 접근 가능)
 * - 신청자 정보를 DB에 저장
 * - 담당 중개인에게 인앱 알림 전송
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createNotification } from "@/lib/notifications/in-app";

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
      // 테이블이 아직 없는 경우에도 접수는 성공으로 처리 (로그 기록)
      console.error("[im-inquiry] Insert error:", insertErr.message, insertErr.code);
      if (insertErr.code === "42P01" || insertErr.message?.includes("does not exist")) {
        console.log("[im-inquiry] Table not created yet. Logging inquiry:", {
          building_id, broker_user_id, requester_name, requester_phone: cleanPhone,
        });
        // 테이블 없어도 사용자에게는 성공 반환 + 인앱 알림 시도
      } else {
        return NextResponse.json(
          { error: "문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요." },
          { status: 500 }
        );
      }
    }

    // 2. 건물 정보 조회 (알림에 표시할 건물명)
    const { data: buildingInfo } = await supabase
      .from("building_ssot_lite")
      .select("area_signal, asset_type, address")
      .eq("id", building_id)
      .single();

    const buildingLabel = buildingInfo
      ? `${buildingInfo.area_signal || ""} ${buildingInfo.asset_type || "매물"}`.trim()
      : "매물";

    // 3. 인앱 알림 전송 (담당 중개인에게)
    const notifSent = await createNotification({
      user_id: broker_user_id,
      type: "im_inquiry",
      title: "📄 프라이빗 IM 신청 도착",
      body: `${requester_name}님이 [${buildingLabel}]에 대한 프라이빗 IM을 신청했습니다.${message ? `\n메시지: ${message.substring(0, 100)}` : ""}\n연락처: ${cleanPhone}${requester_email ? ` / ${requester_email}` : ""}`,
      link: `/broker/deal-card/${building_id}`,
      metadata: {
        inquiry_id: inquiry?.id,
        building_id,
        requester_name,
        requester_phone: cleanPhone,
        requester_email: requester_email || null,
      },
    });

    // 알림 전송 결과 업데이트
    if (inquiry?.id) {
      await supabase
        .from("im_inquiry_requests")
        .update({ notification_sent: notifSent })
        .eq("id", inquiry.id);
    }

    return NextResponse.json({
      ok: true,
      inquiry_id: inquiry?.id,
      notification_sent: notifSent,
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
