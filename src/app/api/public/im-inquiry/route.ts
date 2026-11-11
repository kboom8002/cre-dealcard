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
import { checkRateLimit } from "@/lib/rate-limiter";
import { normalizeKoreanMobilePhone } from "@/domain/identity/gate-schema";
import { getInboxState, getQuickImRecord, isUuid } from "@/lib/im-lite/quick-generate-store";
import { isBuildingShareLinkRevoked } from "@/lib/security/share-link-tokens";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('im-inquiry-route');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== "test") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
      const allowed = await checkRateLimit(ip, "public_im_inquiry", 15, 60_000);
      if (!allowed) {
        return NextResponse.json(
          { ok: false, error: "요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
          { status: 429 }
        );
      }
    }

    const body = await req.json();
    const rawBuildingId = String(body?.building_id ?? body?.buildingId ?? "").trim();
    const docId = typeof body?.doc_id === "string" && body.doc_id.trim() ? body.doc_id.trim() : null;
    const clientBrokerId = String(body?.broker_user_id ?? body?.brokerUserId ?? "").trim();
    const cleanName = String(body?.requester_name ?? body?.name ?? "").trim();
    const rawPhone = String(body?.requester_phone ?? body?.phone ?? "").trim();
    const cleanEmail =
      typeof (body?.requester_email ?? body?.email) === "string" &&
      String(body?.requester_email ?? body?.email).trim()
        ? String(body?.requester_email ?? body?.email).trim()
        : null;
    const cleanMessage =
      typeof (body?.message ?? body?.inquiryMessage) === "string" &&
      String(body?.message ?? body?.inquiryMessage).trim()
        ? String(body?.message ?? body?.inquiryMessage).trim()
        : null;

    if (body?.privacy_agreed === false) {
      return NextResponse.json(
        { ok: false, error: "개인정보 수집·이용에 동의해 주세요." },
        { status: 400 }
      );
    }

    if (!rawBuildingId || !cleanName || !rawPhone) {
      return NextResponse.json(
        { ok: false, error: "이름과 연락처는 필수입니다." },
        { status: 400 }
      );
    }

    if (cleanName.length > 50) {
      return NextResponse.json(
        { ok: false, error: "성함은 50자 이내로 입력해 주세요." },
        { status: 400 }
      );
    }

    if (cleanMessage && cleanMessage.length > 1000) {
      return NextResponse.json(
        { ok: false, error: "문의 내용은 1,000자 이내로 입력해 주세요." },
        { status: 400 }
      );
    }

    if (cleanEmail && (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 120)) {
      return NextResponse.json(
        { ok: false, error: "올바른 이메일 주소를 입력해 주세요." },
        { status: 400 }
      );
    }

    const cleanPhone = normalizeKoreanMobilePhone(rawPhone);
    if (!/^0\d{8,10}$/.test(cleanPhone)) {
      return NextResponse.json(
        { ok: false, error: "올바른 전화번호를 입력해 주세요." },
        { status: 400 }
      );
    }

    const quickRec = getQuickImRecord(rawBuildingId);
    if (
      isBuildingShareLinkRevoked(rawBuildingId) ||
      Boolean(getInboxState().revokedBuildings?.[rawBuildingId]?.revoked) ||
      Boolean(quickRec?.isRevoked)
    ) {
      return NextResponse.json(
        { ok: false, error: "담당 중개인이 열람을 잠근 매물입니다." },
        { status: 403 }
      );
    }

    const supabase = createServiceClient();

    // 서버 측 소유 중개사 검증 및 위조(broker_user_id spoofing) 차단
    let buildingInfo: {
      id?: string;
      owner_id?: string | null;
      status?: string | null;
      area_signal?: string | null;
      asset_type?: string | null;
      address?: string | null;
    } | null = null;
    let resolvedOwnerId = "";

    if (isUuid(rawBuildingId)) {
      const { data: bldRow } = await supabase
        .from("building_ssot_lite")
        .select("id, owner_id, status, area_signal, asset_type, address")
        .eq("id", rawBuildingId)
        .maybeSingle();

      if (bldRow?.status === "archived") {
        return NextResponse.json(
          { ok: false, error: "비공개 또는 삭제된 매물입니다." },
          { status: 404 }
        );
      }
      if (bldRow) {
        buildingInfo = bldRow as any;
        if (bldRow.owner_id) {
          resolvedOwnerId = String(bldRow.owner_id);
        }
      }
    }

    if (!resolvedOwnerId && quickRec?.ownerId) {
      resolvedOwnerId = String(quickRec.ownerId);
    }

    if (!resolvedOwnerId && !isUuid(rawBuildingId)) {
      try {
        const { data: acts } = await supabase
          .from("activity_events")
          .select("actor_id, entity_id, event_type, metadata, created_at")
          .in("event_type", ["im_upserted", "dealcard_upserted"])
          .order("created_at", { ascending: false })
          .limit(100);
        for (const ev of acts || []) {
          const meta =
            ev?.metadata && typeof ev.metadata === "object"
              ? (ev.metadata as Record<string, unknown>)
              : {};
          const evBId = String(meta.building_id || meta.im_id || ev?.entity_id || "").trim();
          if (evBId === rawBuildingId && ev?.actor_id) {
            resolvedOwnerId = String(ev.actor_id);
            break;
          }
        }
      } catch {
        // non-blocking
      }
    }

    if (isUuid(rawBuildingId) && !buildingInfo && !quickRec) {
      return NextResponse.json(
        { ok: false, error: "대상 매물 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const effectiveBrokerId = resolvedOwnerId || clientBrokerId;
    if (!effectiveBrokerId) {
      return NextResponse.json(
        { ok: false, error: "담당 중개인 정보를 확인할 수 없습니다." },
        { status: 400 }
      );
    }

    // 1. DB에 문의 레코드 저장 (im_inquiry_requests + activity_events 이중 영속화)
    let inquiryId: string | undefined;
    let inquirySaved = false;

    const { data: inquiry, error: insertErr } = await supabase
      .from("im_inquiry_requests")
      .insert({
        building_id: rawBuildingId,
        doc_id: docId && isUuid(docId) ? docId : null,
        broker_user_id: effectiveBrokerId,
        requester_name: cleanName,
        requester_phone: cleanPhone,
        requester_email: cleanEmail,
        message: cleanMessage,
        source: "im_cta",
      })
      .select("id")
      .single();

    if (!insertErr && inquiry?.id) {
      inquiryId = String(inquiry.id);
      inquirySaved = true;
    } else if (insertErr) {
      // PII(이름·전화번호·이메일)는 절대 로그에 기록하지 않음
      log.warn("[im-inquiry] im_inquiry_requests insert degraded:", {
        building_id: rawBuildingId,
        code: insertErr.code || "UNKNOWN",
      });
    }

    const fallbackId = inquiryId || `inq-${Date.now()}`;
    let eventSaved = false;
    try {
      const { error: evErr } = await supabase.from("activity_events").insert({
        actor_id: null,
        actor_role: "anonymous",
        event_type: "gate_request_created",
        entity_type: "building",
        entity_id: isUuid(rawBuildingId)
          ? rawBuildingId
          : isUuid(effectiveBrokerId)
          ? effectiveBrokerId
          : null,
        metadata: {
          gate_request_id: fallbackId,
          source: "im_inquiry",
          building_id: rawBuildingId,
          broker_id: effectiveBrokerId,
          requester_name: cleanName,
          requester_phone: cleanPhone,
          requester_email: cleanEmail,
          message: cleanMessage || "상세 IM 열람을 신청했습니다.",
          requested_level: "G2",
          privacy_agreed: true,
        },
      });
      if (!evErr) {
        eventSaved = true;
      }
    } catch {
      eventSaved = false;
    }

    if (!inquirySaved && !eventSaved) {
      return NextResponse.json(
        { ok: false, error: "문의 접수 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 }
      );
    }

    const buildingLabel = buildingInfo
      ? `${buildingInfo.area_signal || ""} ${buildingInfo.asset_type || "매물"}`.trim()
      : quickRec?.buildingName || "매물";

    // 2. 인앱 알림 전송 (담당 중개인에게 — 비차단)
    let notifSent = false;
    try {
      notifSent = await createNotification({
        user_id: effectiveBrokerId,
        type: "im_inquiry",
        title: "📄 상세 IM 열람 신청 도착",
        body: `${cleanName}님이 [${buildingLabel}] 상세 IM 열람을 신청했습니다.${
          cleanMessage ? `\n메시지: ${cleanMessage.substring(0, 100)}` : ""
        }\n연락처: ${cleanPhone}${cleanEmail ? ` / ${cleanEmail}` : ""}`,
        link: `/broker/w/inbox`,
        metadata: {
          inquiry_id: fallbackId,
          building_id: rawBuildingId,
          requester_name: cleanName,
          requester_phone: cleanPhone,
          requester_email: cleanEmail,
        },
      });
    } catch {
      notifSent = false;
    }

    if (inquirySaved && inquiryId) {
      try {
        await supabase
          .from("im_inquiry_requests")
          .update({ notification_sent: notifSent })
          .eq("id", inquiryId);
      } catch {
        // non-blocking
      }
    }

    return NextResponse.json({
      ok: true,
      inquiry_id: fallbackId,
      notification_sent: notifSent,
      message: "상세 IM 신청이 접수되었습니다. 담당 중개인이 곧 연락드리겠습니다.",
    });
  } catch {
    log.error("[im-inquiry] Unexpected route error");
    return NextResponse.json(
      { ok: false, error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
