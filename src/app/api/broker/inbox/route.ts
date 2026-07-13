import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/broker/inbox
 * 소통 관리함 — activity_events + gate_requests 통합 조회
 * Query params:
 *   - filter: "all" | "requests" | "views" (default: "all")
 *   - limit: number (default: 30)
 *   - offset: number (default: 0)
 */
export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const userId = guard.user!.id;

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "all";
  const limit = Math.min(Number(url.searchParams.get("limit") || 30), 100);
  const offset = Number(url.searchParams.get("offset") || 0);

  const supabase = createServiceClient();

  // ── 1. Gate Requests (상세 정보 요청) ──
  let gateItems: any[] = [];
  if (filter === "all" || filter === "requests") {
    // 내 빌딩에 대한 gate_requests 조회
    const { data: myBuildings } = await supabase
      .from("building_ssot_lite")
      .select("id")
      .eq("owner_id", userId);

    const buildingIds = (myBuildings || []).map((b) => b.id);

    if (buildingIds.length > 0) {
      const { data: gateRequests } = await supabase
        .from("gate_requests")
        .select(`
          id, building_id, requester_id, requested_level, requested_fields,
          reason, status, created_at,
          requester:profiles!gate_requests_requester_id_fkey(full_name, phone_number, email),
          building:building_ssot_lite!gate_requests_building_id_fkey(area_signal, asset_type, address)
        `)
        .in("building_id", buildingIds)
        .order("created_at", { ascending: false })
        .limit(limit);

      gateItems = (gateRequests || []).map((gr: any) => ({
        id: gr.id,
        type: "gate_request" as const,
        status: gr.status,
        building_id: gr.building_id,
        building_label: gr.building?.area_signal || gr.building?.address || "매물",
        requester_name: gr.requester?.full_name || "익명",
        requester_phone: gr.requester?.phone_number || null,
        requester_email: gr.requester?.email || null,
        requested_level: gr.requested_level,
        reason: gr.reason,
        created_at: gr.created_at,
        is_unread: gr.status === "submitted",
      }));
    }
  }

  // ── 2. Activity Events (열람 기록) ──
  let viewItems: any[] = [];
  if (filter === "all" || filter === "views") {
    // 내 콘텐츠에 대한 열람 이벤트 조회
    const viewEventTypes = [
      "mobile_im_view",
      "blind_teaser_view",
      "deal_card_view",
      "magazine_view",
      "magazine_section_view",
      "vibe_card_view",
      "im_lite_view",
    ];

    // 내 빌딩/콘텐츠에 대한 이벤트를 가져오기 위해
    // entity_type이 building인 이벤트 중 내 빌딩 것만 필터
    const { data: myBuildingIds } = await supabase
      .from("building_ssot_lite")
      .select("id")
      .eq("owner_id", userId);

    const bIds = (myBuildingIds || []).map((b) => b.id);

    // 열람 이벤트 조회 — actor_id가 나 자신이 아닌 것만
    const { data: viewEvents } = await supabase
      .from("activity_events")
      .select("*")
      .in("event_type", viewEventTypes)
      .neq("actor_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit * 2); // 필터링 후 줄어들 수 있으므로 넉넉히

    // 내 콘텐츠에 대한 이벤트만 필터
    const filtered = (viewEvents || []).filter((evt: any) => {
      // entity_id가 내 빌딩 중 하나인 경우
      if (bIds.includes(evt.entity_id)) return true;
      // metadata에 building_id가 내 것인 경우
      const meta = evt.metadata as Record<string, any> || {};
      if (bIds.includes(meta.building_id)) return true;
      // broker_id가 나인 경우 (매거진 열람 등)
      if (meta.broker_id === userId) return true;
      return false;
    });

    viewItems = filtered.slice(0, limit).map((evt: any) => {
      const meta = evt.metadata as Record<string, any> || {};
      let label = "";
      let subLabel = "";
      let icon = "👁";

      switch (evt.event_type) {
        case "mobile_im_view":
        case "im_lite_view":
          icon = "📄";
          label = "모바일 IM 열람";
          subLabel = meta.building_name || meta.area_signal || "매물";
          break;
        case "blind_teaser_view":
        case "deal_card_view":
          icon = "🃏";
          label = "딜카드 조회";
          subLabel = meta.building_name || meta.area_signal || "매물";
          break;
        case "magazine_view":
        case "magazine_section_view":
          icon = "📰";
          label = "매거진 열람";
          subLabel = meta.issue_date || meta.section || "주간 매거진";
          break;
        case "vibe_card_view":
          icon = "✨";
          label = "Vibe 명함 조회";
          subLabel = "";
          break;
      }

      // 열람자 정보 (최대한 자세히 추정)
      let viewerInfo = "익명 방문자";
      if (meta.viewer_name) {
        viewerInfo = meta.viewer_name;
      } else if (meta.viewer_email) {
        viewerInfo = meta.viewer_email;
      } else if (meta.ip) {
        // IP 기반 지역 추정 (간이)
        viewerInfo = `IP: ${meta.ip.substring(0, 10)}...`;
      }
      if (meta.user_agent) {
        const ua = meta.user_agent as string;
        if (ua.includes("iPhone")) viewerInfo += " (iPhone)";
        else if (ua.includes("Android")) viewerInfo += " (Android)";
        else if (ua.includes("Mac")) viewerInfo += " (Mac)";
        else if (ua.includes("Windows")) viewerInfo += " (Windows)";
      }
      if (meta.referrer) {
        const refDomain = (() => {
          try { return new URL(meta.referrer).hostname; } catch { return meta.referrer; }
        })();
        viewerInfo += ` via ${refDomain}`;
      }

      return {
        id: evt.id,
        type: "view" as const,
        event_type: evt.event_type,
        icon,
        label,
        sub_label: subLabel,
        building_id: evt.entity_id || meta.building_id,
        viewer_info: viewerInfo,
        created_at: evt.created_at,
        is_unread: false, // 열람 기록은 읽음 처리 불필요
      };
    });
  }

  // ── 3. 인앱 알림 (프라이빗 IM 신청 등) ──
  let notifItems: any[] = [];
  try {
    const { data: notifications } = await supabase
      .from("in_app_notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    notifItems = (notifications || []).map((n: any) => ({
      id: n.id,
      type: "notification" as const,
      notification_type: n.type,
      icon: n.type === "im_inquiry" ? "📄" : n.type === "im_viewed" ? "🔥" : "🔔",
      label: n.title,
      sub_label: n.body?.substring(0, 80) || "",
      link: n.link,
      building_id: n.metadata?.building_id || null,
      is_unread: !n.is_read,
      created_at: n.created_at,
    }));
  } catch {
    // 테이블 미존재 시 무시
  }

  // ── 4. 통합 & 정렬 ──
  const allItems = [...gateItems, ...viewItems, ...notifItems]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(offset, offset + limit);

  // 미확인 건수 (gate_requests + 인앱 알림)
  const unreadCount = 
    gateItems.filter((i) => i.is_unread).length + 
    notifItems.filter((i) => i.is_unread).length;

  return NextResponse.json({
    items: allItems,
    total: gateItems.length + viewItems.length + notifItems.length,
    unread_count: unreadCount,
  });
}
