import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getInboxState,
  listAllQuickImRecords,
} from "@/lib/im-lite/quick-generate-store";
import { formatRelativeKo } from "@/lib/ux/lexicon";

export interface ParsedGateReason {
  requesterName: string | null;
  requesterPhone: string | null;
  requesterCompany: string | null;
  cleanMessage: string;
  buildingTitle: string;
}

/**
 * IB-09: Parse anonymous lead JSON in gate_requests.reason into clean fields.
 * Never leak raw JSON strings to the broker inbox UI.
 */
export function parseGateRequestReason(
  rawReason: unknown,
  building?: any,
  fallbackLabel?: string
): ParsedGateReason {
  const buildingTitle = resolveBuildingTitle(building, fallbackLabel);
  if (!rawReason || typeof rawReason !== "string") {
    return {
      requesterName: null,
      requesterPhone: null,
      requesterCompany: null,
      cleanMessage: "IM 열람을 요청했습니다.",
      buildingTitle,
    };
  }

  const trimmed = rawReason.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const requesterName =
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name.trim()
          : typeof parsed.requesterName === "string" && parsed.requesterName.trim()
          ? parsed.requesterName.trim()
          : null;
      const requesterPhone =
        typeof parsed.phone === "string" && parsed.phone.trim()
          ? parsed.phone.trim()
          : typeof parsed.contact === "string" && parsed.contact.trim()
          ? parsed.contact.trim()
          : typeof parsed.requesterPhone === "string" && parsed.requesterPhone.trim()
          ? parsed.requesterPhone.trim()
          : null;
      const requesterCompany =
        typeof parsed.company === "string" && parsed.company.trim()
          ? parsed.company.trim()
          : typeof parsed.organization === "string" && parsed.organization.trim()
          ? parsed.organization.trim()
          : null;
      const cleanMessage =
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : typeof parsed.reason === "string" && parsed.reason.trim()
          ? parsed.reason.trim()
          : "IM 열람을 요청했습니다.";

      return {
        requesterName,
        requesterPhone,
        requesterCompany,
        cleanMessage,
        buildingTitle,
      };
    } catch {
      // Fall through if invalid JSON
    }
  }

  return {
    requesterName: null,
    requesterPhone: null,
    requesterCompany: null,
    cleanMessage: trimmed || "IM 열람을 요청했습니다.",
    buildingTitle,
  };
}

function resolveBuildingTitle(building: any, fallbackLabel?: string): string {
  if (!building && fallbackLabel) return fallbackLabel;
  if (!building) return "매물";
  const area = building.area_signal || building.region || "";
  const asset = building.asset_type || building.main_usage || "";
  const name = building.building_name || building.name || building.title || "";
  if (area && name) return `${area} ${name}`.trim();
  if (area && asset) return `${area} ${asset}`.trim();
  if (name) return String(name).trim();
  if (area) return String(area).trim();
  if (building.raw_address) return String(building.raw_address).trim();
  if (building.address) return String(building.address).trim();
  return fallbackLabel || "매물";
}

/**
 * GET /api/broker/inbox
 * 소통함 통합 조회 (IB-01, IB-02, IB-09)
 * - ?workspace=1 포함 모든 요청에서 requireBroker 인증 필수 (미인증 시 401)
 * - customClients 및 모든 고객 데이터는 본인(broker_id === userId) 데이터만 반환
 * - 익명 리드 reason JSON을 서버에서 파싱해 정제된 필드로 반환
 * - 데이터가 없으면 가짜 시드가 아닌 빈 배열(threads: []) 반환
 */
export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const userId = guard.user?.id || null;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "all";
  const limit = Math.min(Number(url.searchParams.get("limit") || 30), 100);
  const offset = Number(url.searchParams.get("offset") || 0);

  const rawInboxState = getInboxState();
  // IB-02: Never leak customClients without matching ownerId === userId
  const ownCustomClients = (rawInboxState.customClients || []).filter(
    (c) => Boolean(c.ownerId) && c.ownerId === userId
  );
  const inboxState = {
    ...rawInboxState,
    customClients: ownCustomClients,
  };

  const quickRecords = listAllQuickImRecords().filter(
    (r) => Boolean(r.ownerId) && r.ownerId === userId
  );
  const quickInventory = quickRecords.map((r) => ({
    buildingId: r.buildingId,
    title: r.buildingName || `${r.card4.region} ${r.card4.use}`.trim(),
    region: r.card4.region || r.address,
    priceBand: r.card4.priceBand,
    askingPriceManwon: r.askingPriceManwon,
    capRatePct: r.basicImDoc?.facts?.valuation?.capRatePct ?? null,
    posture: r.posture,
  }));

  let supabase: any = null;
  try {
    supabase = createServiceClient();
  } catch {
    supabase = null;
  }

  // ── 0. 내 빌딩 목록 조회 ──
  let buildingIds: string[] = [];
  const buildingTitleById = new Map<string, string>();
  try {
    const bldgQuery: any = supabase
      .from("building_ssot_lite")
      .select("id, area_signal, asset_type, raw_address")
      .eq("owner_id", userId);
    const { data: myBuildings } = await bldgQuery;
    if (Array.isArray(myBuildings)) {
      buildingIds = myBuildings.map((b: any) => String(b.id)).filter(Boolean);
      for (const b of myBuildings) {
        if (b?.id) {
          buildingTitleById.set(String(b.id), resolveBuildingTitle(b));
        }
      }
    }
  } catch {
    // ignore if table unavailable in unit test
  }

  // ── 1. Gate Requests (IM 열람 요청) ──
  let gateItems: any[] = [];
  if (filter === "all" || filter === "requests") {
    try {
      let grQuery: any = supabase
        .from("gate_requests")
        .select(`
          id, building_id, requester_id, requested_level, requested_fields,
          reason, status, created_at,
          requester:profiles!gate_requests_requester_id_fkey(display_name, phone, email),
          building:building_ssot_lite!gate_requests_building_id_fkey(area_signal, asset_type, raw_address, owner_id)
        `);
      if (buildingIds.length > 0 && typeof grQuery.in === "function") {
        grQuery = grQuery.in("building_id", buildingIds);
      }
      if (typeof grQuery.order === "function") {
        grQuery = grQuery.order("created_at", { ascending: false });
      }
      if (typeof grQuery.limit === "function") {
        grQuery = grQuery.limit(limit);
      }

      const { data: gateRequests } = await grQuery;
      const filteredGateRequests = (gateRequests || []).filter((gr: any) => {
        const bldgOwner = gr.building?.owner_id || gr.buildings?.owner_id || gr.broker_id;
        if (bldgOwner && String(bldgOwner) !== userId) return false;
        if (buildingIds.length > 0 && gr.building_id && !buildingIds.includes(String(gr.building_id))) {
          return false;
        }
        return true;
      });

      gateItems = filteredGateRequests.map((gr: any) => {
        const parsedReason = parseGateRequestReason(gr.reason);
        const joinedBldg = gr.building || gr.buildings;
        const buildingTitle = resolveBuildingTitle(
          joinedBldg,
          buildingTitleById.get(String(gr.building_id)) ||
            quickInventory.find((q) => q.buildingId === gr.building_id)?.title ||
            "매물"
        );
        const requesterName =
          gr.requester?.display_name ||
          parsedReason.requesterName ||
          "이름 미입력 고객";
        const requesterPhone =
          gr.requester?.phone ||
          parsedReason.requesterPhone ||
          "";
        const requesterCompany = parsedReason.requesterCompany || "";
        const cleanMessage = parsedReason.cleanMessage;
        const isPending =
          gr.status === "submitted" ||
          gr.status === "pending" ||
          gr.status === "broker_review";

        return {
          id: gr.id,
          type: "gate_request" as const,
          status: gr.status,
          building_id: gr.building_id,
          buildingId: gr.building_id,
          building_label: buildingTitle,
          buildingTitle,
          requester_name: requesterName,
          requesterName,
          requester_phone: requesterPhone || null,
          requesterPhone,
          requester_company: requesterCompany || null,
          requesterCompany,
          requester_email: gr.requester?.email || null,
          requested_level: gr.requested_level,
          reason: cleanMessage,
          cleanMessage,
          created_at: gr.created_at,
          is_unread: isPending,
        };
      });
    } catch {
      // ignore if table unavailable
    }
  }

  // ── 2. Activity Events (열람 기록) ──
  let viewItems: any[] = [];
  if (filter === "all" || filter === "views") {
    try {
      const viewEventTypes = [
        "mobile_im_view",
        "blind_teaser_view",
        "deal_card_view",
        "magazine_view",
        "magazine_section_view",
        "vibe_card_view",
        "im_lite_view",
      ];

      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
      let viewQuery: any = supabase
        .from("activity_events")
        .select("id, event_type, entity_id, entity_type, metadata, created_at, actor_id");
      if (typeof viewQuery.in === "function") {
        viewQuery = viewQuery.in("event_type", viewEventTypes);
      }
      if (typeof viewQuery.or === "function") {
        viewQuery = viewQuery.or(`actor_id.is.null,actor_id.neq.${userId}`);
      }
      if (typeof viewQuery.gte === "function") {
        viewQuery = viewQuery.gte("created_at", thirtyDaysAgoIso);
      }
      if (typeof viewQuery.order === "function") {
        viewQuery = viewQuery.order("created_at", { ascending: false });
      }
      if (typeof viewQuery.limit === "function") {
        viewQuery = viewQuery.limit(limit * 2);
      }

      const { data: viewEvents } = await viewQuery;

      const filtered = (viewEvents || []).filter((evt: any) => {
        if (buildingIds.includes(evt.entity_id)) return true;
        const meta = (evt.metadata as Record<string, any>) || {};
        if (buildingIds.includes(meta.building_id)) return true;
        if (meta.broker_id === userId) return true;
        return false;
      });

      viewItems = filtered.slice(0, limit).map((evt: any) => {
        const meta = (evt.metadata as Record<string, any>) || {};
        let label = "상세 자료를 열람했습니다";
        let subLabel = meta.building_name || meta.area_signal || "매물";

        switch (evt.event_type) {
          case "mobile_im_view":
          case "im_lite_view":
            label = "IM 자료를 열람했습니다";
            subLabel = meta.building_name || meta.area_signal || "매물";
            break;
          case "blind_teaser_view":
          case "deal_card_view":
            label = "딜카드를 열람했습니다";
            subLabel = meta.building_name || meta.area_signal || "매물";
            break;
          case "magazine_view":
          case "magazine_section_view":
            label = "뉴스레터를 열람했습니다";
            subLabel = meta.issue_date || meta.section || "뉴스레터";
            break;
          case "vibe_card_view":
            label = "프로필 카드를 열람했습니다";
            subLabel = "";
            break;
        }

        // Never use raw IP address as a client's display name
        const viewerName =
          typeof meta.viewer_name === "string" && meta.viewer_name.trim()
            ? meta.viewer_name.trim()
            : typeof meta.viewer_email === "string" && meta.viewer_email.trim()
            ? meta.viewer_email.trim()
            : "익명 열람객";

        const sectionName =
          typeof meta.section_name === "string" && meta.section_name.trim()
            ? meta.section_name.trim()
            : typeof meta.section_title === "string" && meta.section_title.trim()
            ? meta.section_title.trim()
            : undefined;

        return {
          id: evt.id,
          type: "view" as const,
          event_type: evt.event_type,
          label,
          sub_label: subLabel,
          building_id: evt.entity_id || meta.building_id,
          viewer_info: viewerName,
          viewerName,
          sectionName,
          created_at: evt.created_at,
          is_unread: false,
        };
      });
    } catch {
      // ignore if table unavailable
    }
  }

  // ── 3. 인앱 알림 ──
  let notifItems: any[] = [];
  try {
    let notifQuery: any = supabase
      .from("in_app_notifications")
      .select("id, type, title, body, link, metadata, is_read, created_at")
      .eq("user_id", userId);
    if (typeof notifQuery.order === "function") {
      notifQuery = notifQuery.order("created_at", { ascending: false });
    }
    if (typeof notifQuery.limit === "function") {
      notifQuery = notifQuery.limit(limit);
    }
    const { data: notifications } = await notifQuery;

    notifItems = (notifications || []).map((n: any) => ({
      id: n.id,
      type: "notification" as const,
      notification_type: n.type,
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
    // ignore if table missing
  }

  // ── 3-B. 프라이빗 IM 직접 문의 (im_inquiry_requests) & 고객 명단 (broker_custom_clients / broker_clients) ──
  let inquiryItems: any[] = [];
  let dbClients: any[] = [];
  let customClientRows: any[] = [];
  let shareLinks: any[] = [];

  try {
    const inqQuery: any = supabase
      .from("im_inquiry_requests")
      .select("id, building_id, requester_name, requester_phone, requester_email, message, created_at")
      .eq("broker_user_id", userId);
    const inqRes =
      typeof inqQuery.order === "function"
        ? await inqQuery.order("created_at", { ascending: false }).limit(30)
        : await inqQuery;
    const inquiries = inqRes?.data || [];
    inquiryItems = inquiries.map((inq: any) => {
      const parsed = parseGateRequestReason(inq.message);
      const bTitle =
        buildingTitleById.get(String(inq.building_id)) ||
        quickInventory.find((q) => q.buildingId === inq.building_id)?.title ||
        "매물";
      const rName = inq.requester_name || parsed.requesterName || "매수 문의 고객";
      const rPhone = inq.requester_phone || parsed.requesterPhone || "";
      const cMsg = parsed.cleanMessage || inq.message || "IM 열람을 요청했습니다.";
      return {
        id: inq.id,
        type: "gate_request" as const,
        status: "pending",
        building_id: inq.building_id,
        buildingId: inq.building_id,
        building_label: bTitle,
        buildingTitle: bTitle,
        requester_name: rName,
        requesterName: rName,
        requester_phone: rPhone || null,
        requesterPhone: rPhone,
        requester_company: parsed.requesterCompany || null,
        requesterCompany: parsed.requesterCompany || "",
        requester_email: inq.requester_email || null,
        requested_level: "G2",
        reason: cMsg,
        cleanMessage: cMsg,
        created_at: inq.created_at,
        is_unread: true,
      };
    });
  } catch {
    // ignore
  }

  // IB-02: Always enforce .eq("broker_id", userId) on custom clients
  try {
    const customQ: any = supabase
      .from("broker_custom_clients")
      .select("id, broker_id, display_name, name, phone, tier, grade, budget, preferred_region, building_id, building_title, notes, created_at")
      .eq("broker_id", userId);
    const customRes =
      typeof customQ.order === "function"
        ? await customQ.order("created_at", { ascending: false }).limit(50)
        : await customQ;
    if (Array.isArray(customRes?.data)) {
      customClientRows = customRes.data.filter(
        (row: any) => !row.broker_id || String(row.broker_id) === userId
      );
    }
  } catch {
    // ignore if table not present
  }

  try {
    const cliQ: any = supabase
      .from("broker_clients")
      .select("id, broker_id, display_name, phone, tier, tags, notes, linked_building_ids, created_at")
      .eq("broker_id", userId);
    const cliRes =
      typeof cliQ.order === "function"
        ? await cliQ.order("created_at", { ascending: false }).limit(50)
        : await cliQ;
    if (Array.isArray(cliRes?.data)) {
      dbClients = cliRes.data.filter(
        (row: any) => !row.broker_id || String(row.broker_id) === userId
      );
    }
  } catch {
    // ignore if table not present
  }

  try {
    const slQ: any = supabase
      .from("im_share_links")
      .select("token, building_id, broker_id, recipient_id, status, expires_at, revoked_at, created_at")
      .eq("broker_id", userId);
    const slRes =
      typeof slQ.order === "function"
        ? await slQ.order("created_at", { ascending: false }).limit(100)
        : await slQ;
    if (Array.isArray(slRes?.data)) {
      shareLinks = slRes.data;
    }
  } catch {
    // ignore if table not present
  }

  // ── 4. Build Real Threads for Workspace (No Fake Seeds!) ──
  const threads: any[] = [];
  const seenThreadIds = new Set<string>();

  for (const gr of [...gateItems, ...inquiryItems]) {
    const tid = String(gr.id);
    if (!tid || seenThreadIds.has(tid)) continue;
    seenThreadIds.add(tid);

    const isPending =
      gr.status === "submitted" ||
      gr.status === "pending" ||
      gr.status === "broker_review";
    const isApproved = gr.status === "approved";

    const matchingLink = shareLinks.find(
      (sl) =>
        (sl.recipient_id && String(sl.recipient_id) === tid) ||
        (sl.building_id && String(sl.building_id) === String(gr.building_id))
    );
    const isRevoked =
      matchingLink?.status === "revoked" ||
      Boolean(matchingLink?.revoked_at) ||
      Boolean(inboxState.revokedBuildings?.[gr.building_id]?.revoked);

    const viewEventsForBldg = viewItems.filter(
      (v) => v.building_id && String(v.building_id) === String(gr.building_id)
    );
    const focusedSections = Array.from(
      new Set(
        viewEventsForBldg
          .map((v) => v.sectionName)
          .filter((s): s is string => Boolean(s))
      )
    );

    threads.push({
      id: tid,
      clientName: gr.requesterName || gr.requester_name || "이름 미입력 고객",
      clientPhone: gr.requesterPhone || gr.requester_phone || "",
      requesterCompany: gr.requesterCompany || gr.requester_company || "",
      cleanMessage: gr.cleanMessage || gr.reason || "IM 열람을 요청했습니다.",
      clientGrade: "일반" as const,
      buildingTitle: gr.buildingTitle || gr.building_label || "매물",
      buildingId: String(gr.building_id || ""),
      latestEvent: gr.cleanMessage || gr.reason || "IM 열람을 요청했습니다.",
      detail: gr.cleanMessage || gr.reason || "IM 열람을 요청했습니다.",
      gateStatus: isPending ? ("pending" as const) : isApproved ? ("approved" as const) : ("none" as const),
      updatedAt: formatRelativeKo(gr.created_at) || "방금",
      openCount: viewEventsForBldg.length,
      isRead: !gr.is_unread,
      status: isRevoked
        ? ("revoked" as const)
        : isPending
        ? ("pending_gate" as const)
        : ("active" as const),
      shareToken: matchingLink?.token || "",
      budget: "",
      preferredRegion: "",
      focusedSections,
      newsletterSubscribed: false,
      events: [
        {
          id: `ev-${tid}`,
          eventType: "gate_request" as const,
          description: gr.cleanMessage || gr.reason || "IM 열람을 요청했습니다.",
          timestamp: formatRelativeKo(gr.created_at) || "방금",
        },
      ],
    });
  }

  // Add custom clients (from broker_custom_clients, broker_clients, and ownCustomClients)
  for (const row of [...customClientRows, ...dbClients, ...ownCustomClients]) {
    const rawId = String(row.id || "");
    if (!rawId) continue;
    const tid = rawId.startsWith("custom_") || rawId.startsWith("cli-") ? rawId : `custom_${rawId}`;
    if (seenThreadIds.has(tid) || seenThreadIds.has(rawId)) continue;
    seenThreadIds.add(tid);

    const name = row.display_name || row.name || row.clientName || "";
    if (!name) continue;
    const phone = row.phone || row.clientPhone || "";
    const bId =
      row.building_id ||
      row.buildingId ||
      (Array.isArray(row.linked_building_ids) && row.linked_building_ids[0]) ||
      "";
    const bTitle =
      row.building_title ||
      row.buildingTitle ||
      (bId ? buildingTitleById.get(String(bId)) : "") ||
      "관심 매물 미지정";

    const notesList = inboxState.callNotes?.[tid] || inboxState.callNotes?.[rawId] || [];

    threads.push({
      id: tid,
      clientName: name,
      clientPhone: phone,
      requesterCompany: "",
      cleanMessage: row.notes || "직접 등록한 고객입니다.",
      clientGrade:
        row.tier === "vip" || row.clientGrade === "VIP"
          ? ("VIP" as const)
          : row.tier === "potential" || row.clientGrade === "잠재"
          ? ("잠재" as const)
          : ("일반" as const),
      buildingTitle: bTitle,
      buildingId: String(bId),
      latestEvent: notesList[0]?.description || row.notes || "고객 등록 완료",
      gateStatus: "none" as const,
      updatedAt: formatRelativeKo(row.created_at || row.createdAt) || "방금",
      openCount: 0,
      isRead: true,
      status: "active" as const,
      shareToken: "",
      budget: row.budget || "",
      preferredRegion: row.preferred_region || row.preferredRegion || "",
      focusedSections: [],
      newsletterSubscribed: Boolean(row.newsletterSubscribed),
      events: notesList.map((n: any) => ({
        id: n.id,
        eventType: "dwell" as const,
        description: n.description,
        timestamp: n.timestamp || "방금",
      })),
    });
  }

  // Group remaining view events by building + viewer
  const viewGroups = new Map<string, any[]>();
  for (const v of viewItems) {
    const key = `${v.building_id || "b"}::${v.viewerName || "anon"}`;
    const list = viewGroups.get(key) || [];
    list.push(v);
    viewGroups.set(key, list);
  }
  for (const [, group] of viewGroups.entries()) {
    const first = group[0];
    const tid = `view_${first.id}`;
    if (seenThreadIds.has(tid)) continue;
    // Skip if already represented by a gate request on the same building from the same named viewer
    if (
      first.viewerName !== "익명 열람객" &&
      threads.some(
        (t) => t.buildingId === String(first.building_id) && t.clientName === first.viewerName
      )
    ) {
      continue;
    }
    seenThreadIds.add(tid);

    const focusedSections = Array.from(
      new Set(group.map((g) => g.sectionName).filter((s): s is string => Boolean(s)))
    );

    threads.push({
      id: tid,
      clientName: first.viewerName || "익명 열람객",
      clientPhone: "",
      requesterCompany: "",
      cleanMessage: "상세 자료를 열람했습니다",
      clientGrade: "일반" as const,
      buildingTitle:
        buildingTitleById.get(String(first.building_id)) ||
        first.sub_label ||
        "매물",
      buildingId: String(first.building_id || ""),
      latestEvent:
        focusedSections.length > 0
          ? `${focusedSections.join(" · ")} 열람`
          : "상세 자료를 열람했습니다",
      gateStatus: "none" as const,
      updatedAt: formatRelativeKo(first.created_at) || "방금",
      openCount: group.length,
      isRead: true,
      status: group.length >= 3 ? ("hot_lead" as const) : ("active" as const),
      shareToken: "",
      budget: "",
      preferredRegion: "",
      focusedSections,
      newsletterSubscribed: false,
      events: group.map((g) => ({
        id: `ev-${g.id}`,
        eventType: "open" as const,
        description: g.sectionName ? `${g.sectionName} 열람` : "상세 자료를 열람했습니다",
        timestamp: formatRelativeKo(g.created_at) || "방금",
        sectionName: g.sectionName,
      })),
    });
  }

  // ── 5. 통합 & 정렬 ──
  const allItems = [...gateItems, ...inquiryItems, ...viewItems, ...notifItems]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(offset, offset + limit);

  const unreadCount =
    gateItems.filter((i) => i.is_unread).length +
    inquiryItems.filter((i) => i.is_unread).length +
    notifItems.filter((i) => i.is_unread).length;

  return NextResponse.json({
    ok: true,
    threads,
    items: allItems,
    gateRequests: gateItems,
    activityEvents: viewItems,
    notifications: notifItems,
    total: gateItems.length + inquiryItems.length + viewItems.length + notifItems.length,
    unread_count: unreadCount,
    inboxState,
    inventory: quickInventory,
    clients: [...customClientRows, ...dbClients],
  });
}
