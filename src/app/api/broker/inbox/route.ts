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

  const bracketMatch = trimmed.match(
    /^\[신청자:\s*([^/\]\n]+?)(?:\s*\/\s*연락처:\s*([^\]\n]+?))?\]\s*(.*)$/
  );
  if (bracketMatch) {
    return {
      requesterName: bracketMatch[1]?.trim() || null,
      requesterPhone: bracketMatch[2]?.trim() || null,
      requesterCompany: null,
      cleanMessage: bracketMatch[3]?.trim() || "IM 열람을 요청했습니다.",
      buildingTitle,
    };
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
  // IB-02 & S0-2: Deep-isolate inboxState per broker; never expose global tmpdir maps across tenants
  const ownCustomClients = (rawInboxState.customClients || []).filter(
    (c) => Boolean(c.ownerId) && c.ownerId === userId
  );
  const inboxState: ReturnType<typeof getInboxState> = {
    revokedBuildings: {},
    correctionNotices: {},
    gateDecisions: {},
    callNotes: {},
    customClients: [...ownCustomClients],
    deletedDealCardIds: {},
    sentDealCardIds: {},
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
  let bldgQuerySucceeded = false;
  const buildingTitleById = new Map<string, string>();
  try {
    const bldgQuery: any = supabase
      .from("building_ssot_lite")
      .select("id, owner_id, area_signal, asset_type, price_band, fit_summary")
      .eq("owner_id", userId);
    const { data: myBuildings } = await bldgQuery;
    if (Array.isArray(myBuildings)) {
      bldgQuerySucceeded = true;
      buildingIds = myBuildings.map((b: any) => String(b.id)).filter(Boolean);
      for (const b of myBuildings) {
        if (b?.id) {
          const bIdStr = String(b.id);
          const resolvedTitle = resolveBuildingTitle(b);
          buildingTitleById.set(bIdStr, resolvedTitle);
          if (!quickInventory.some((q) => q.buildingId === bIdStr)) {
            quickInventory.push({
              buildingId: bIdStr,
              title: resolvedTitle,
              region: b.area_signal || "",
              priceBand: b.price_band || "가격 협의",
              askingPriceManwon: 0,
              capRatePct: 0,
              posture: String(b.asset_type || "general"),
            });
          }
        }
      }
    }
  } catch {
    // ignore if table unavailable in unit test
  }

  // ── 0-B. activity_events 기반 내 매물(im_upserted, dealcard_upserted) 병합 (L-05 Serverless 소유 매물 누락 방지) ──
  try {
    let ownedActQuery: any = supabase
      .from("activity_events")
      .select("event_type, entity_id, metadata, created_at")
      .eq("actor_id", userId);
    if (typeof ownedActQuery.in === "function") {
      ownedActQuery = ownedActQuery.in("event_type", [
        "im_upserted",
        "im_restored",
        "dealcard_upserted",
        "dealcard_restored",
      ]);
    }
    if (typeof ownedActQuery.order === "function") {
      ownedActQuery = ownedActQuery.order("created_at", { ascending: false });
    }
    if (typeof ownedActQuery.limit === "function") {
      ownedActQuery = ownedActQuery.limit(60);
    }
    const { data: ownedActs } = await ownedActQuery;
    for (const act of ownedActs || []) {
      const meta = (act.metadata as Record<string, any>) || {};
      const imItem = (meta.im_item as Record<string, any>) || {};
      const card4 = (meta.card4 as Record<string, any>) || {};
      const bIdStr = String(meta.building_id || imItem.buildingId || imItem.id || act.entity_id || "").trim();
      if (!bIdStr || bIdStr === userId) continue;
      if (!buildingIds.includes(bIdStr)) {
        buildingIds.push(bIdStr);
      }
      const titleCandidate = String(
        imItem.title ||
          imItem.buildingName ||
          card4.headline ||
          `${card4.region || ""} ${card4.use || ""}`.trim() ||
          imItem.address ||
          ""
      ).trim();
      if (titleCandidate && !buildingTitleById.has(bIdStr)) {
        buildingTitleById.set(bIdStr, titleCandidate);
      }
      if (!quickInventory.some((q) => q.buildingId === bIdStr)) {
        quickInventory.push({
          buildingId: bIdStr,
          title: titleCandidate || "보유 매물",
          region: String(card4.region || imItem.address || ""),
          priceBand: String(card4.priceBand || (imItem.askingPriceManwon ? `${Math.round(Number(imItem.askingPriceManwon) / 10000)}억` : "가격 협의")),
          askingPriceManwon: Number(imItem.askingPriceManwon || 0),
          capRatePct: Number(imItem.grossYieldPct || 0),
          posture: String(imItem.investmentPosture || card4.posture || "income"),
        });
      }
    }
  } catch {
    // ignore if activity_events unavailable
  }

  const allOwnedBuildingIds = Array.from(
    new Set([...buildingIds, ...quickInventory.map((q) => String(q.buildingId)).filter(Boolean)])
  );

  // ── 1. Gate Requests (IM 열람 요청) — S0-3 Fail-Closed: 소유 매물이 있을 때만 조회 ──
  let gateItems: any[] = [];
  if ((filter === "all" || filter === "requests") && allOwnedBuildingIds.length > 0) {
    const uuidOwnedIds = allOwnedBuildingIds.filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    );

    if (uuidOwnedIds.length > 0) {
      try {
        let grQuery: any = supabase
          .from("gate_requests")
          .select(
            "id, building_id, requester_id, requested_level, requested_fields, reason, status, created_at"
          );
        if (typeof grQuery.in === "function") {
          grQuery = grQuery.in("building_id", uuidOwnedIds);
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
          if (!gr.building_id || !allOwnedBuildingIds.includes(String(gr.building_id))) {
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

    // Merge gate_request_created / intent.pro_im_request from activity_events for owned buildings
    try {
      let actGateQuery: any = supabase
        .from("activity_events")
        .select("id, event_type, entity_id, metadata, created_at, actor_id");
      if (typeof actGateQuery.in === "function") {
        actGateQuery = actGateQuery.in("event_type", [
          "gate_request_created",
          "intent.pro_im_request",
        ]);
      }
      if (typeof actGateQuery.order === "function") {
        actGateQuery = actGateQuery.order("created_at", { ascending: false });
      }
      if (typeof actGateQuery.limit === "function") {
        actGateQuery = actGateQuery.limit(limit * 2);
      }
      const { data: actGateEvents } = await actGateQuery;
      const existingGateIds = new Set(gateItems.map((g: any) => String(g.id)));

      for (const ev of actGateEvents || []) {
        const meta = (ev.metadata as Record<string, any>) || {};
        if (meta.broker_id && String(meta.broker_id) !== userId) continue;
        const bId = String(meta.building_id || ev.entity_id || "").trim();
        const isOwned =
          (meta.broker_id && String(meta.broker_id) === userId) ||
          (bId && allOwnedBuildingIds.includes(bId));
        if (!isOwned || !bId) continue;

        const gateId = String(meta.gate_request_id || ev.entity_id || `gr-act-${ev.id}`);
        if (existingGateIds.has(gateId)) continue;
        existingGateIds.add(gateId);

        const rawReasonInput =
          typeof meta.reason === "string"
            ? meta.reason
            : typeof meta.message === "string"
            ? meta.message
            : meta.name || meta.requester_name || meta.phone || meta.contact || meta.requester_phone
            ? JSON.stringify({
                name: meta.requester_name || meta.name,
                phone: meta.requester_phone || meta.phone || meta.contact,
                company: meta.requester_company || meta.company,
                message:
                  meta.message ||
                  meta.reason ||
                  (ev.event_type === "intent.pro_im_request"
                    ? "상세 IM 자료(Pro IM) 열람을 요청했습니다."
                    : "IM 열람을 요청했습니다."),
              })
            : ev.event_type === "intent.pro_im_request"
            ? "상세 IM 자료(Pro IM) 열람을 요청했습니다."
            : "IM 열람을 요청했습니다.";

        const parsedReason = parseGateRequestReason(rawReasonInput);
        const buildingTitle =
          buildingTitleById.get(bId) ||
          quickInventory.find((q) => q.buildingId === bId)?.title ||
          String(meta.building_title || meta.building_name || "매물");
        const requesterName =
          meta.requester_name ||
          meta.name ||
          parsedReason.requesterName ||
          "이름 미입력 고객";
        const requesterPhone =
          meta.requester_phone ||
          meta.phone ||
          meta.contact ||
          parsedReason.requesterPhone ||
          "";
        const requesterCompany =
          meta.requester_company ||
          meta.company ||
          parsedReason.requesterCompany ||
          "";
        const cleanMessage = parsedReason.cleanMessage;

        gateItems.push({
          id: gateId,
          type: "gate_request" as const,
          status: "submitted",
          building_id: bId,
          buildingId: bId,
          building_label: buildingTitle,
          buildingTitle,
          requester_name: requesterName,
          requesterName,
          requester_phone: requesterPhone || null,
          requesterPhone,
          requester_company: requesterCompany || null,
          requesterCompany,
          requester_email: meta.requester_email || meta.email || null,
          requested_level: meta.requested_level || "G1",
          reason: cleanMessage,
          cleanMessage,
          created_at: ev.created_at,
          is_unread: true,
        });
      }
    } catch {
      // ignore if activity_events unavailable
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
        if (allOwnedBuildingIds.includes(evt.entity_id)) return true;
        const meta = (evt.metadata as Record<string, any>) || {};
        if (allOwnedBuildingIds.includes(meta.building_id)) return true;
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

  // ── 3-C. 중개인 액션 이벤트 조회 (승인/거절 영속성 및 통화 메모 복원 — P0-INBOX-GATE-01, P0-INBOX-NOTE-03, S0-2 테넌트 격리) ──
  const ownedThreadKeySet = new Set<string>([
    ...allOwnedBuildingIds,
    ...gateItems.map((g: any) => String(g.id)),
    ...gateItems.map((g: any) => `srv-${g.id}`),
    ...inquiryItems.map((i: any) => String(i.id)),
    ...inquiryItems.map((i: any) => `srv-${i.id}`),
    ...ownCustomClients.map((c: any) => String(c.id)),
    ...customClientRows.map((c: any) => String(c.id)),
    ...customClientRows.map((c: any) => `custom_${c.id}`),
    ...dbClients.map((c: any) => String(c.id)),
    ...dbClients.map((c: any) => `cli-${c.id}`),
    ...dbClients.map((c: any) => `custom_${c.id}`),
  ]);

  for (const bId of allOwnedBuildingIds) {
    if (rawInboxState.revokedBuildings?.[bId]) {
      inboxState.revokedBuildings[bId] = { ...rawInboxState.revokedBuildings[bId] };
    }
    if (rawInboxState.correctionNotices?.[bId]) {
      inboxState.correctionNotices[bId] = { ...rawInboxState.correctionNotices[bId] };
    }
  }

  const decisionByThreadId = new Map<
    string,
    { decision: "approved" | "rejected" | "pending"; shareToken?: string; createdAt?: string }
  >();
  const callNotesByThreadId = new Map<
    string,
    Array<{ id: string; description: string; timestamp: string }>
  >();

  for (const [k, v] of Object.entries(rawInboxState.gateDecisions || {})) {
    const decisionBldId = (v as any)?.buildingId ? String((v as any).buildingId) : "";
    const isOwnedDecision =
      ownedThreadKeySet.has(k) ||
      (decisionBldId && allOwnedBuildingIds.includes(decisionBldId));
    if (isOwnedDecision && v?.status) {
      inboxState.gateDecisions[k] = { ...v };
      decisionByThreadId.set(k, {
        decision: v.status,
        shareToken: v.shareToken,
        createdAt: v.updatedAt,
      });
    }
  }
  for (const [k, list] of Object.entries(rawInboxState.callNotes || {})) {
    if (ownedThreadKeySet.has(k) && Array.isArray(list) && list.length > 0) {
      inboxState.callNotes[k] = [...list];
      callNotesByThreadId.set(
        k,
        list.map((n: any) => ({
          id: String(n.id || `note-${Date.now()}`),
          description: String(n.description || ""),
          timestamp: String(n.timestamp || "방금"),
        }))
      );
    }
  }

  try {
    let brokerActQuery: any = supabase
      .from("activity_events")
      .select("id, event_type, entity_id, metadata, created_at")
      .eq("actor_id", userId);
    if (typeof brokerActQuery.in === "function") {
      brokerActQuery = brokerActQuery.in("event_type", [
        "gate_request_approved",
        "gate_request_rejected",
        "call_note_recorded",
        "link_revoked",
        "link_restored",
        "correction_notice_published",
        "correction_notice_cleared",
        "custom_client_upserted",
      ]);
    }
    if (typeof brokerActQuery.order === "function") {
      brokerActQuery = brokerActQuery.order("created_at", { ascending: false });
    }
    if (typeof brokerActQuery.limit === "function") {
      brokerActQuery = brokerActQuery.limit(100);
    }
    const { data: brokerActs } = await brokerActQuery;
    const seenRevokeDecision = new Set<string>();
    const seenCorrectionDecision = new Set<string>();
    for (const act of brokerActs || []) {
      const meta = (act.metadata as Record<string, any>) || {};
      const tKey = String(meta.thread_id || meta.request_id || act.entity_id || "");
      const rawKey = String(meta.request_id || meta.raw_client_id || "").trim();
      const bKey = String(meta.building_id || act.entity_id || "").trim();
      if (act.event_type === "custom_client_upserted" && meta.client_name) {
        const cId = String(meta.client_id || `custom_${act.id}`);
        const cName = String(meta.client_name).trim();
        const cPhone = String(meta.client_phone || "").trim();
        const alreadyInCustom = inboxState.customClients.some(
          (c) => c.id === cId || (c.clientName === cName && c.clientPhone === cPhone)
        );
        if (!alreadyInCustom) {
          inboxState.customClients.push({
            id: cId,
            ownerId: userId,
            clientName: cName,
            clientGrade: (meta.client_grade as "VIP" | "일반" | "잠재") || "VIP",
            clientPhone: cPhone,
            budget: String(meta.budget || ""),
            preferredRegion: String(meta.preferred_region || ""),
            buildingId: String(meta.building_id || ""),
            buildingTitle: String(meta.building_title || "관심 매물 상담"),
            newsletterSubscribed: meta.newsletter_subscribed !== false,
            createdAt: act.created_at || new Date().toISOString(),
          });
        }
      } else if (
        (act.event_type === "gate_request_approved" || act.event_type === "gate_request_rejected") &&
        tKey
      ) {
        const dec = act.event_type === "gate_request_approved" ? "approved" : "rejected";
        if (!decisionByThreadId.has(tKey)) {
          decisionByThreadId.set(tKey, {
            decision: dec,
            shareToken: meta.share_token || undefined,
            createdAt: act.created_at,
          });
        }
        if (rawKey && !decisionByThreadId.has(rawKey)) {
          decisionByThreadId.set(rawKey, {
            decision: dec,
            shareToken: meta.share_token || undefined,
            createdAt: act.created_at,
          });
        }
      } else if (act.event_type === "call_note_recorded" && meta.note) {
        const noteItem = {
          id: `ev-note-${act.id}`,
          description: String(meta.note),
          timestamp: formatRelativeKo(act.created_at) || "방금",
        };
        for (const key of new Set([tKey, rawKey].filter(Boolean))) {
          const existing = callNotesByThreadId.get(key) || [];
          if (!existing.some((e) => e.description === noteItem.description)) {
            existing.push(noteItem);
            callNotesByThreadId.set(key, existing);
          }
        }
      } else if (
        (act.event_type === "link_revoked" || act.event_type === "link_restored") &&
        bKey &&
        !seenRevokeDecision.has(bKey)
      ) {
        seenRevokeDecision.add(bKey);
        const existingRev = inboxState.revokedBuildings[bKey];
        const actTime = act.created_at ? new Date(act.created_at).getTime() : 0;
        const memTime = existingRev?.revokedAt ? new Date(existingRev.revokedAt).getTime() : 0;
        if (!existingRev || actTime >= memTime) {
          inboxState.revokedBuildings[bKey] = {
            revoked: act.event_type === "link_revoked",
            revokedAt: act.created_at,
            shareToken: meta.share_token || undefined,
          };
        }
      } else if (
        (act.event_type === "correction_notice_published" ||
          act.event_type === "correction_notice_cleared") &&
        bKey &&
        !seenCorrectionDecision.has(bKey)
      ) {
        seenCorrectionDecision.add(bKey);
        const existingNotice = inboxState.correctionNotices[bKey];
        const actTime = act.created_at ? new Date(act.created_at).getTime() : 0;
        const memTime = existingNotice?.updatedAt ? new Date(existingNotice.updatedAt).getTime() : 0;
        if (!existingNotice || actTime >= memTime) {
          if (act.event_type === "correction_notice_published" && meta.message) {
            inboxState.correctionNotices[bKey] = {
              message: String(meta.message),
              updatedAt: act.created_at,
            };
          } else if (act.event_type === "correction_notice_cleared") {
            delete inboxState.correctionNotices[bKey];
          }
        }
      }
    }
  } catch {
    // ignore if activity_events unavailable
  }

  function parseClientNotesMeta(notesRaw: unknown): {
    budget: string;
    preferredRegion: string;
    buildingTitle: string;
    isStructuredMeta: boolean;
  } {
    const text = typeof notesRaw === "string" ? notesRaw.trim() : "";
    if (!text) {
      return { budget: "", preferredRegion: "", buildingTitle: "", isStructuredMeta: false };
    }
    const budgetMatch = text.match(/예산:\s*([^/]+)/);
    const regionMatch = text.match(/선호권역:\s*([^/]+)/);
    const bldgMatch = text.match(/관심매물:\s*([^/]+)/);
    const isStructuredMeta = Boolean(budgetMatch || regionMatch || bldgMatch);
    return {
      budget: budgetMatch?.[1]?.trim() || "",
      preferredRegion: regionMatch?.[1]?.trim() || "",
      buildingTitle: bldgMatch?.[1]?.trim() || "",
      isStructuredMeta,
    };
  }

  // ── 4. Build Real Threads for Workspace (No Fake Seeds!) ──
  const threads: any[] = [];
  const seenThreadIds = new Set<string>();

  for (const gr of [...gateItems, ...inquiryItems]) {
    const tid = String(gr.id);
    if (!tid || seenThreadIds.has(tid)) continue;
    seenThreadIds.add(tid);

    const decisionOverride = decisionByThreadId.get(tid);
    const effectiveStatus = decisionOverride ? decisionOverride.decision : gr.status;

    const isPending =
      effectiveStatus === "submitted" ||
      effectiveStatus === "pending" ||
      effectiveStatus === "broker_review";
    const isApproved = effectiveStatus === "approved";
    const isRejected = effectiveStatus === "rejected";
    gr.status = effectiveStatus;
    gr.is_unread = isPending;

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

    const threadCallNotes = callNotesByThreadId.get(tid) || [];
    const baseRequestMsg = gr.cleanMessage || gr.reason || "IM 열람을 요청했습니다.";
    const threadEvents: any[] = [
      ...threadCallNotes.map((n) => ({
        id: n.id,
        eventType: "dwell" as const,
        description: n.description,
        timestamp: n.timestamp,
      })),
    ];
    if (isApproved) {
      threadEvents.push({
        id: `ev-approve-${tid}`,
        eventType: "gate_request" as const,
        description: "IM 열람 요청을 승인하고 전용 링크를 발급했습니다.",
        timestamp: formatRelativeKo(decisionOverride?.createdAt || gr.created_at) || "방금",
      });
    } else if (isRejected) {
      threadEvents.push({
        id: `ev-reject-${tid}`,
        eventType: "gate_request" as const,
        description: "IM 열람 요청을 거절했습니다.",
        timestamp: formatRelativeKo(decisionOverride?.createdAt || gr.created_at) || "방금",
      });
    }
    threadEvents.push({
      id: `ev-${tid}`,
      eventType: "gate_request" as const,
      description: baseRequestMsg,
      timestamp: formatRelativeKo(gr.created_at) || "방금",
    });

    const latestEventText =
      threadCallNotes[0]?.description ||
      (isApproved
        ? "IM 열람 요청을 승인하고 전용 링크를 전달했습니다."
        : isRejected
        ? "IM 열람 요청을 거절했습니다."
        : baseRequestMsg);

    threads.push({
      id: tid,
      clientName: gr.requesterName || gr.requester_name || "이름 미입력 고객",
      clientPhone: gr.requesterPhone || gr.requester_phone || "",
      requesterCompany: gr.requesterCompany || gr.requester_company || "",
      cleanMessage: baseRequestMsg,
      clientGrade: "일반" as const,
      buildingTitle: gr.buildingTitle || gr.building_label || "매물",
      buildingId: String(gr.building_id || ""),
      latestEvent: latestEventText,
      detail: isRejected ? "IM 열람 요청을 거절했습니다." : baseRequestMsg,
      gateStatus: isPending
        ? ("pending" as const)
        : isApproved
        ? ("approved" as const)
        : isRejected
        ? ("rejected" as const)
        : ("none" as const),
      updatedAt: formatRelativeKo(gr.created_at) || "방금",
      openCount: viewEventsForBldg.length,
      isRead: !gr.is_unread,
      status: isRevoked
        ? ("revoked" as const)
        : isPending
        ? ("pending_gate" as const)
        : ("active" as const),
      shareToken: decisionOverride?.shareToken || matchingLink?.token || "",
      hasCorrectionNotice: Boolean(
        gr.building_id && inboxState.correctionNotices?.[String(gr.building_id)]?.message
      ),
      correctionMessage:
        (gr.building_id && inboxState.correctionNotices?.[String(gr.building_id)]?.message) || "",
      budget: "",
      preferredRegion: "",
      focusedSections,
      newsletterSubscribed: false,
      events: threadEvents,
    });
  }

  // Add custom clients (from broker_custom_clients, broker_clients, and ownCustomClients)
  const seenCustomClientIdentity = new Set<string>();
  for (const row of [...customClientRows, ...dbClients, ...ownCustomClients]) {
    const rawId = String(row.id || "");
    if (!rawId) continue;
    const tid = rawId.startsWith("custom_") || rawId.startsWith("cli-") ? rawId : `custom_${rawId}`;
    if (seenThreadIds.has(tid) || seenThreadIds.has(rawId)) continue;

    const name = String(row.display_name || row.name || row.clientName || "").trim();
    if (!name) continue;
    const phone = String(row.phone || row.clientPhone || "").trim();
    const identityKey = `${name.toLowerCase()}::${phone.replace(/\D/g, "")}`;
    if (seenCustomClientIdentity.has(identityKey)) continue;
    seenCustomClientIdentity.add(identityKey);
    seenThreadIds.add(tid);

    const parsedMeta = parseClientNotesMeta(row.notes);
    let bId =
      row.building_id ||
      row.buildingId ||
      (Array.isArray(row.linked_building_ids) && row.linked_building_ids[0]) ||
      "";
    const rawBTitle =
      row.building_title ||
      row.buildingTitle ||
      parsedMeta.buildingTitle ||
      (bId ? buildingTitleById.get(String(bId)) : "") ||
      "";
    if (!bId && rawBTitle) {
      const matchedInv = quickInventory.find(
        (q) => q.title === rawBTitle || rawBTitle.includes(q.title) || q.title.includes(rawBTitle)
      );
      if (matchedInv) {
        bId = matchedInv.buildingId;
      }
    }
    if (!bId && buildingIds.length > 0) {
      bId = buildingIds[0];
    }
    const bTitle =
      rawBTitle ||
      (bId ? buildingTitleById.get(String(bId)) : "") ||
      quickInventory.find((q) => q.buildingId === String(bId))?.title ||
      "관심 매물 상담";

    const budget = String(row.budget || parsedMeta.budget || "").trim();
    const preferredRegion = String(
      row.preferred_region || row.preferredRegion || parsedMeta.preferredRegion || ""
    ).trim();

    const notesList =
      callNotesByThreadId.get(tid) ||
      callNotesByThreadId.get(rawId) ||
      inboxState.callNotes?.[tid] ||
      inboxState.callNotes?.[rawId] ||
      [];

    const matchingLink = shareLinks.find(
      (sl) =>
        (sl.recipient_id && String(sl.recipient_id) === tid) ||
        (bId && sl.building_id && String(sl.building_id) === String(bId))
    );
    const isRevoked =
      matchingLink?.status === "revoked" ||
      Boolean(matchingLink?.revoked_at) ||
      Boolean(bId && inboxState.revokedBuildings?.[String(bId)]?.revoked);

    const summaryCleanMessage =
      [
        budget ? `희망 예산 ${budget}` : "",
        preferredRegion ? `선호 권역 ${preferredRegion}` : "",
      ]
        .filter(Boolean)
        .join(" · ") ||
      (!parsedMeta.isStructuredMeta && row.notes ? String(row.notes) : "직접 등록한 고객입니다.");

    threads.push({
      id: tid,
      clientName: name,
      clientPhone: phone,
      requesterCompany: "",
      cleanMessage: summaryCleanMessage,
      clientGrade:
        row.tier === "vip" || row.clientGrade === "VIP"
          ? ("VIP" as const)
          : row.tier === "potential" || row.clientGrade === "잠재"
          ? ("잠재" as const)
          : ("일반" as const),
      buildingTitle: bTitle,
      buildingId: String(bId),
      latestEvent: notesList[0]?.description || summaryCleanMessage,
      gateStatus: "none" as const,
      updatedAt: formatRelativeKo(row.created_at || row.createdAt) || "방금",
      openCount: 0,
      isRead: true,
      status: isRevoked ? ("revoked" as const) : ("active" as const),
      shareToken: matchingLink?.token || "",
      hasCorrectionNotice: Boolean(
        bId && inboxState.correctionNotices?.[String(bId)]?.message
      ),
      correctionMessage:
        (bId && inboxState.correctionNotices?.[String(bId)]?.message) || "",
      budget,
      preferredRegion,
      focusedSections: [],
      newsletterSubscribed: Boolean(row.newsletterSubscribed),
      events:
        notesList.length > 0
          ? notesList.map((n: any) => ({
              id: n.id,
              eventType: "dwell" as const,
              description: n.description,
              timestamp: n.timestamp || "방금",
            }))
          : [
              {
                id: `ev-${tid}`,
                eventType: "share" as const,
                description: "고객 직접 등록 완료",
                timestamp: formatRelativeKo(row.created_at || row.createdAt) || "방금",
              },
            ],
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
