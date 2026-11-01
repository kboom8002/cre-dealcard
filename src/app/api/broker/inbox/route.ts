import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getInboxState,
  listAllQuickImRecords,
} from "@/lib/im-lite/quick-generate-store";

/**
 * GET /api/broker/inbox
 * 소통 관리함 — activity_events + gate_requests + im_inquiry_requests + broker_clients + quick-generate-store 통합 조회
 * Query params:
 *   - filter: "all" | "requests" | "views" (default: "all")
 *   - limit: number (default: 30)
 *   - offset: number (default: 0)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const isWorkspaceCall = url.searchParams.get("workspace") === "1";

  const guard = await requireBroker(req);
  if (guard.error && !isWorkspaceCall) return guard.error;
  const userId = guard.user?.id || null;

  const rawInboxState = getInboxState();
  const inboxState = {
    ...rawInboxState,
    customClients: (rawInboxState.customClients || []).filter(
      (c) => !userId || !c.ownerId || c.ownerId === userId
    ),
  };
  const quickRecords = listAllQuickImRecords();
  const quickInventory = quickRecords.map((r) => ({
    buildingId: r.buildingId,
    title: r.buildingName || `${r.card4.region} ${r.card4.use}`,
    region: r.card4.region || r.address,
    priceBand: r.card4.priceBand,
    askingPriceManwon: r.askingPriceManwon,
    capRatePct: r.basicImDoc?.facts?.valuation?.capRatePct ?? 4.2,
    posture: r.posture,
  }));

  if (!userId) {
    return NextResponse.json({
      items: [],
      total: 0,
      unread_count: 0,
      inboxState,
      inventory: quickInventory,
    });
  }

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
          requester:profiles!gate_requests_requester_id_fkey(display_name, phone, email),
          building:building_ssot_lite!gate_requests_building_id_fkey(area_signal, asset_type, raw_address)
        `)
        .in("building_id", buildingIds)
        .order("created_at", { ascending: false })
        .limit(limit);

      gateItems = (gateRequests || []).map((gr: any) => ({
        id: gr.id,
        type: "gate_request" as const,
        status: gr.status,
        building_id: gr.building_id,
        building_label: gr.building?.area_signal || gr.building?.raw_address || "매물",
        requester_name: gr.requester?.display_name || "익명",
        requester_phone: gr.requester?.phone || null,
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

    // 열람 이벤트 조회 — actor_id가 나 자신이 아닌 것만 (익명 방문자 actor_id IS NULL 포함)
    const { data: viewEvents } = await supabase
      .from("activity_events")
      .select("id, event_type, entity_id, entity_type, metadata, created_at, actor_id")
      .in("event_type", viewEventTypes)
      .or(`actor_id.is.null,actor_id.neq.${userId}`)
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
      .select("id, type, title, body, link, metadata, is_read, created_at")
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
      requester_name: n.metadata?.requester_name || null,
      requester_phone: n.metadata?.requester_phone || null,
      requester_email: n.metadata?.requester_email || null,
      is_unread: !n.is_read,
      created_at: n.created_at,
    }));
  } catch {
    // 테이블 미존재 시 무시
  }

  // ── 3-B. 프라이빗 IM 직접 문의 (im_inquiry_requests) & 고객 명단 (broker_clients) ──
  let inquiryItems: any[] = [];
  let dbClients: any[] = [];
  try {
    const [{ data: inquiries }, { data: clients }] = await Promise.all([
      supabase
        .from("im_inquiry_requests")
        .select("id, building_id, requester_name, requester_phone, requester_email, message, created_at")
        .eq("broker_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("broker_clients")
        .select("id, display_name, phone, tier, tags, notes, linked_building_ids, created_at")
        .eq("broker_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    dbClients = clients || [];
    inquiryItems = (inquiries || []).map((inq: any) => ({
      id: inq.id,
      type: "gate_request" as const,
      status: "submitted",
      building_id: inq.building_id,
      building_label:
        quickInventory.find((q) => q.buildingId === inq.building_id)?.title || "프라이빗 IM 매물",
      requester_name: inq.requester_name || "매수 문의 고객",
      requester_phone: inq.requester_phone || null,
      requester_email: inq.requester_email || null,
      requested_level: "G2",
      reason: inq.message || "상세 렌트롤 및 수익률 검토 요청",
      created_at: inq.created_at,
      is_unread: true,
    }));
  } catch {
    // ignore if table missing
  }

  // ── 4. 통합 & 정렬 ──
  const allItems = [...gateItems, ...inquiryItems, ...viewItems, ...notifItems]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(offset, offset + limit);

  // 미확인 건수 (gate_requests + 인앱 알림)
  const unreadCount = 
    gateItems.filter((i) => i.is_unread).length + 
    inquiryItems.filter((i) => i.is_unread).length +
    notifItems.filter((i) => i.is_unread).length;

  return NextResponse.json({
    items: allItems,
    total: gateItems.length + inquiryItems.length + viewItems.length + notifItems.length,
    unread_count: unreadCount,
    inboxState,
    inventory: quickInventory,
    clients: dbClients,
  });
}
