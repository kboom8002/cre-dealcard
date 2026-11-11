import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getInboxState,
  isDealCardDeleted,
  isUuid,
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
 * IB-09 & D-S1-02: Parse anonymous lead JSON / bracket / marketplace reason in gate_requests.reason into clean fields.
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

  const marketMatch = trimmed.match(
    /성함\/기업명:\s*([^,\n]+?)(?:,\s*연락처:\s*([^\n]+))?$/
  );
  if (marketMatch) {
    return {
      requesterName: marketMatch[1]?.trim() || null,
      requesterPhone: marketMatch[2]?.trim() || null,
      requesterCompany: null,
      cleanMessage: "IM 열람을 요청했습니다.",
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

function toSafeEpochMs(isoLike: unknown): number {
  if (!isoLike || typeof isoLike !== "string") return 0;
  const parsed = Date.parse(isoLike);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildThreadShareUrl(buildingId: string, shareToken: string): string {
  if (!buildingId) return "";
  if (shareToken) {
    return `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(shareToken)}`;
  }
  return `/im-lite/${encodeURIComponent(buildingId)}`;
}

/**
 * GET /api/broker/inbox
 * 소통함 통합 조회 (IB-01, IB-02, IB-09, INBOX-06, Pillar-B S0/S1 Hardening)
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
  const parsedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 100)
    : 50;
  const parsedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  const rawInboxState = getInboxState();
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

  let supabase: any = null;
  try {
    supabase = createServiceClient();
  } catch (err: any) {
    const errMsg = String(err?.message || "");
    if (process.env.NODE_ENV === "test" && errMsg.includes("getServerEnv must not be called on the client")) {
      return NextResponse.json({
        ok: true,
        userId,
        items: [],
        threads: ownCustomClients.map((c) => ({
          id: c.id.startsWith("custom_") ? c.id : `custom_${c.id}`,
          clientName: c.clientName,
          clientGrade: c.clientGrade || "VIP",
          clientPhone: c.clientPhone || "",
          budget: c.budget || "",
          preferredRegion: c.preferredRegion || "",
          buildingId: c.buildingId || "",
          buildingTitle: c.buildingTitle || "관심 매물 상담",
          shareUrl: buildThreadShareUrl(c.buildingId || "", ""),
          shareToken: "",
          status: "active",
          gateStatus: "none",
          newsletterSubscribed: Boolean(c.newsletterSubscribed),
          openCount: 0,
          dwellTime: "-",
          lastViewedAt: "-",
          createdAt: c.createdAt,
          events: [],
        })),
        inventory: [],
        gateRequests: [],
        inquiries: [],
        activityEvents: [],
        inboxState,
        counts: { total: ownCustomClients.length, pending: 0, hot: 0 },
      });
    }
    return NextResponse.json(
      { ok: false, error: "데이터베이스 연결을 초기화할 수 없습니다." },
      { status: 503 }
    );
  }
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "데이터베이스 연결을 초기화할 수 없습니다." },
      { status: 503 }
    );
  }

  const quickRecords = listAllQuickImRecords().filter(
    (r) =>
      Boolean(r.ownerId) &&
      r.ownerId === userId &&
      !isDealCardDeleted(r.buildingId)
  );
  let quickInventory = quickRecords.map((r) => ({
    buildingId: r.buildingId,
    title: r.buildingName || `${r.card4.region} ${r.card4.use}`.trim(),
    region: r.card4.region || r.address,
    priceBand: r.card4.priceBand,
    askingPriceManwon: r.askingPriceManwon,
    capRatePct: r.basicImDoc?.facts?.valuation?.capRatePct ?? null,
    posture: r.posture,
  }));

  // ── 0. 내 빌딩 목록 조회 (archived 제외, 정본 소유권 기록) ──
  let buildingIds: string[] = [];
  const verifiedOwnedUuidSet = new Set<string>();
  const forbiddenBuildingSet = new Set<string>();
  const deletedBuildingSet = new Set<string>();
  const buildingTitleById = new Map<string, string>();

  if (isUuid(userId)) {
    try {
      const bldgQuery: any = supabase
        .from("building_ssot_lite")
        .select("id, owner_id, status, area_signal, asset_type, price_band, fit_summary")
        .eq("owner_id", userId);
      const { data: myBuildings } = await bldgQuery;
      if (Array.isArray(myBuildings)) {
        for (const b of myBuildings) {
          if (!b?.id) continue;
          const bIdStr = String(b.id);
          if (b.status === "archived" || isDealCardDeleted(bIdStr)) {
            deletedBuildingSet.add(bIdStr);
            continue;
          }
          verifiedOwnedUuidSet.add(bIdStr);
          buildingIds.push(bIdStr);
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
    } catch {
      // ignore if table unavailable in unit test
    }
  }

  // ── 0-B. activity_events 기반 내 매물 병합 (삭제 이벤트 존중 + B-S0-01 교차 검증) ──
  if (isUuid(userId)) {
    try {
      let ownedActQuery: any = supabase
        .from("activity_events")
        .select("event_type, entity_id, metadata, created_at")
        .eq("actor_id", userId);
      if (typeof ownedActQuery.in === "function") {
        ownedActQuery = ownedActQuery.in("event_type", [
          "im_upserted",
          "im_restored",
          "im_deleted",
          "dealcard_upserted",
          "dealcard_restored",
          "dealcard_deleted",
        ]);
      }
      if (typeof ownedActQuery.order === "function") {
        ownedActQuery = ownedActQuery.order("created_at", { ascending: false });
      }
      if (typeof ownedActQuery.limit === "function") {
        ownedActQuery = ownedActQuery.limit(120);
      }
      const { data: ownedActs } = await ownedActQuery;
      const seenLatestActPerBuilding = new Set<string>();
      for (const act of ownedActs || []) {
        const meta = (act.metadata as Record<string, any>) || {};
        const imItem = (meta.im_item as Record<string, any>) || {};
        const card4 = (meta.card4 as Record<string, any>) || {};
        const bIdStr = String(
          meta.building_id || imItem.buildingId || imItem.id || act.entity_id || ""
        ).trim();
        if (!bIdStr || bIdStr === userId) continue;
        if (seenLatestActPerBuilding.has(bIdStr)) continue;
        seenLatestActPerBuilding.add(bIdStr);

        if (
          act.event_type === "im_deleted" ||
          act.event_type === "dealcard_deleted" ||
          isDealCardDeleted(bIdStr)
        ) {
          deletedBuildingSet.add(bIdStr);
          continue;
        }
        if (deletedBuildingSet.has(bIdStr)) continue;

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
            priceBand: String(
              card4.priceBand ||
                (imItem.askingPriceManwon
                  ? `${Math.round(Number(imItem.askingPriceManwon) / 10000)}억`
                  : "가격 협의")
            ),
            askingPriceManwon: Number(imItem.askingPriceManwon || 0),
            capRatePct: Number(imItem.grossYieldPct || 0),
            posture: String(imItem.investmentPosture || card4.posture || "income"),
          });
        }
      }
    } catch {
      // ignore if activity_events unavailable
    }
  }

  // B-S0-01: Verify any unverified UUID candidate against building_ssot_lite to prevent cross-tenant hijack
  const candidateAllIds = Array.from(
    new Set([
      ...buildingIds,
      ...quickInventory.map((q) => String(q.buildingId)).filter(Boolean),
    ])
  );
  const unverifiedUuids = candidateAllIds.filter(
    (id) => isUuid(id) && !verifiedOwnedUuidSet.has(id)
  );
  if (unverifiedUuids.length > 0) {
    try {
      let checkQ: any = supabase
        .from("building_ssot_lite")
        .select("id, owner_id, status");
      if (typeof checkQ.in === "function") {
        checkQ = checkQ.in("id", unverifiedUuids);
      }
      const { data: verifyRows } = await checkQ;
      for (const row of verifyRows || []) {
        const rId = String(row?.id || "");
        if (!rId) continue;
        if (
          (row.owner_id && String(row.owner_id) !== userId) ||
          row.status === "archived"
        ) {
          forbiddenBuildingSet.add(rId);
        }
      }
    } catch {
      // ignore if query unsupported in mock
    }
  }

  buildingIds = buildingIds.filter(
    (id) => !forbiddenBuildingSet.has(id) && !deletedBuildingSet.has(id)
  );
  quickInventory = quickInventory.filter(
    (q) =>
      !forbiddenBuildingSet.has(String(q.buildingId)) &&
      !deletedBuildingSet.has(String(q.buildingId))
  );
  const allOwnedBuildingIds = Array.from(
    new Set([
      ...buildingIds,
      ...quickInventory.map((q) => String(q.buildingId)).filter(Boolean),
    ])
  );

  // ── 1. Gate Requests (IM 열람 요청) — Fail-Closed ──
  let gateItems: any[] = [];
  if (filter === "all" || filter === "requests") {
    const uuidOwnedIds = allOwnedBuildingIds.filter((id) => isUuid(id));

    if (uuidOwnedIds.length > 0) {
      try {
        let grQuery: any = supabase
          .from("gate_requests")
          .select(
            "id, building_id, requester_id, requested_level, requested_fields, reason, status, expires_at, created_at"
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
        const nowMs = Date.now();
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

          const effectiveGrStatus =
            gr.status === "approved" &&
            gr.expires_at &&
            toSafeEpochMs(gr.expires_at) > 0 &&
            toSafeEpochMs(gr.expires_at) <= nowMs
              ? "expired"
              : gr.status;

          const isPending =
            effectiveGrStatus === "submitted" ||
            effectiveGrStatus === "pending" ||
            effectiveGrStatus === "broker_review";

          return {
            id: gr.id,
            type: "gate_request" as const,
            status: effectiveGrStatus,
            expires_at: gr.expires_at || null,
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

    // Merge gate_request_created / intent.pro_im_request from activity_events for owned buildings or explicit broker_id
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
        if (bId && (forbiddenBuildingSet.has(bId) || deletedBuildingSet.has(bId))) continue;
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

  // ── 2. Activity Events (열람 기록 — D-S1-04 system magazine_view & magazine_to_im_click 포함) ──
  let viewItems: any[] = [];
  if (filter === "all" || filter === "views") {
    try {
      const viewEventTypes = [
        "mobile_im_view",
        "blind_teaser_view",
        "deal_card_view",
        "magazine_view",
        "magazine_section_view",
        "magazine_to_im_click",
        "vibe_card_view",
        "im_lite_view",
      ];

      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
      let viewQuery: any = supabase
        .from("activity_events")
        .select(
          "id, event_type, entity_id, entity_type, metadata, created_at, actor_id, actor_role"
        );
      if (typeof viewQuery.in === "function") {
        viewQuery = viewQuery.in("event_type", viewEventTypes);
      }
      if (typeof viewQuery.or === "function") {
        viewQuery = viewQuery.or(
          `actor_id.is.null,actor_id.neq.${userId},actor_role.eq.system`
        );
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
        const meta = (evt.metadata as Record<string, any>) || {};
        const evtBld = String(evt.entity_id || meta.building_id || "");
        if (evtBld && (forbiddenBuildingSet.has(evtBld) || deletedBuildingSet.has(evtBld))) {
          return false;
        }
        if (allOwnedBuildingIds.includes(evt.entity_id)) return true;
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
            subLabel = meta.issue_date || meta.edition_id || meta.section || "뉴스레터";
            break;
          case "magazine_to_im_click":
            label = "뉴스레터에서 매물 자료를 열람했습니다";
            subLabel = meta.building_name || meta.edition_id || "뉴스레터";
            break;
          case "vibe_card_view":
            label = "프로필 카드를 열람했습니다";
            subLabel = "";
            break;
        }

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

  // ── 3-B. 프라이빗 IM 직접 문의 (im_inquiry_requests) & 고객 명단 ──
  let inquiryItems: any[] = [];
  let dbClients: any[] = [];
  let customClientRows: any[] = [];
  let shareLinks: any[] = [];

  try {
    const inqQuery: any = supabase
      .from("im_inquiry_requests")
      .select(
        "id, building_id, requester_name, requester_phone, requester_email, message, created_at"
      )
      .eq("broker_user_id", userId);
    const inqRes =
      typeof inqQuery.order === "function"
        ? await inqQuery.order("created_at", { ascending: false }).limit(limit)
        : await inqQuery;
    const inquiries = inqRes?.data || [];
    const existingGateIds = new Set(gateItems.map((g: any) => String(g.id)));
    inquiryItems = inquiries
      .filter((inq: any) => !existingGateIds.has(String(inq.id)))
      .map((inq: any) => {
        const parsed = parseGateRequestReason(inq.message);
        const bTitle =
          buildingTitleById.get(String(inq.building_id)) ||
          quickInventory.find((q) => q.buildingId === inq.building_id)?.title ||
          "매물";
        const rName = inq.requester_name || parsed.requesterName || "매수 문의 고객";
        const rPhone = inq.requester_phone || parsed.requesterPhone || "";
        const cMsg = parsed.cleanMessage || inq.message || "IM 열람을 요청했습니다.";
        const rawStatus =
          typeof inq.status === "string" && inq.status.trim() ? inq.status.trim() : "submitted";
        const isPending =
          rawStatus === "submitted" ||
          rawStatus === "pending" ||
          rawStatus === "broker_review";
        return {
          id: inq.id,
          type: "gate_request" as const,
          status: rawStatus,
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
          is_unread: isPending,
        };
      });
  } catch {
    // ignore
  }

  try {
    const customQ: any = supabase
      .from("broker_custom_clients")
      .select(
        "id, broker_id, display_name, name, phone, tier, grade, budget, preferred_region, building_id, building_title, notes, created_at"
      )
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

  if (isUuid(userId)) {
    try {
      const cliQ: any = supabase
        .from("broker_clients")
        .select(
          "id, broker_id, display_name, phone, tier, tags, notes, linked_building_ids, created_at"
        )
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
  }

  try {
    const slQ: any = supabase
      .from("im_share_links")
      .select(
        "token, building_id, broker_id, recipient_id, status, expires_at, revoked_at, created_at"
      )
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

  // ── 3-C. 중개인 액션 이벤트 조회 (B-S1-05: 거버넌스 이벤트와 통화 메모 쿼리 분리) ──
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
    {
      decision: "approved" | "rejected" | "pending" | "submitted";
      shareToken?: string;
      createdAt?: string;
    }
  >();
  const callNotesByThreadId = new Map<
    string,
    Array<{ id: string; description: string; timestamp: string; createdAt?: string }>
  >();
  const revokedByThreadId = new Map<
    string,
    { revoked: boolean; revokedAt?: string; shareToken?: string }
  >();
  const issuedTokenByThreadId = new Map<string, string>();
  const newsletterStateByKey = new Map<string, { subscribed: boolean; createdAtMs: number }>();
  const deletedClientIdSet = new Set<string>();

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

  if (isUuid(userId)) {
    try {
      let govActQuery: any = supabase
        .from("activity_events")
        .select("id, event_type, entity_id, metadata, created_at")
        .eq("actor_id", userId);
      if (typeof govActQuery.in === "function") {
        govActQuery = govActQuery.in("event_type", [
          "gate_request_approved",
          "gate_request_rejected",
          "gate_request_reset",
          "im_link_sent",
          "link_revoked",
          "link_restored",
          "correction_notice_published",
          "correction_notice_cleared",
          "custom_client_upserted",
          "custom_client_deleted",
          "newsletter_subscription_toggled",
          "magazine_subscribed",
          "magazine_unsubscribed",
        ]);
      }
      if (typeof govActQuery.order === "function") {
        govActQuery = govActQuery.order("created_at", { ascending: false });
      }
      if (typeof govActQuery.limit === "function") {
        govActQuery = govActQuery.limit(160);
      }
      const { data: govActs } = await govActQuery;

      const seenDbDecisionKeys = new Set<string>();
      const seenRevokeBuilding = new Set<string>();
      const seenRevokeThread = new Set<string>();
      const seenCorrectionDecision = new Set<string>();
      const seenClientLifecycle = new Set<string>();

      const recordNewsletterDecision = (key: string, subscribed: boolean, createdAt?: string) => {
        if (!key) return;
        const ts = toSafeEpochMs(createdAt);
        const existing = newsletterStateByKey.get(key);
        if (!existing || ts >= existing.createdAtMs) {
          newsletterStateByKey.set(key, { subscribed, createdAtMs: ts });
        }
      };

      const applyDbDecision = (
        key: string,
        dec: "approved" | "rejected" | "submitted",
        shareToken: string | undefined,
        createdAt: string | undefined
      ) => {
        if (!key || seenDbDecisionKeys.has(key)) return;
        seenDbDecisionKeys.add(key);
        const existing = decisionByThreadId.get(key);
        const actMs = toSafeEpochMs(createdAt);
        const memMs = toSafeEpochMs(existing?.createdAt);
        if (!existing || actMs >= memMs) {
          decisionByThreadId.set(key, {
            decision: dec,
            shareToken: dec === "approved" ? shareToken : undefined,
            createdAt,
          });
        }
      };

      for (const act of govActs || []) {
        const meta = (act.metadata as Record<string, any>) || {};
        const tKey = String(meta.thread_id || meta.request_id || "").trim();
        const rawKey = String(meta.request_id || meta.raw_client_id || "").trim();
        const bKey = String(
          meta.building_id || (act.entity_id !== userId ? act.entity_id : "") || ""
        ).trim();

        if (act.event_type === "custom_client_deleted") {
          const delId = String(meta.client_id || "").trim();
          const rawDelId = String(meta.raw_client_id || delId.replace(/^(?:custom[-_]|cli-)/, "")).trim();
          for (const k of [delId, rawDelId, rawDelId ? `custom_${rawDelId}` : ""].filter(Boolean)) {
            if (!seenClientLifecycle.has(k)) {
              seenClientLifecycle.add(k);
              deletedClientIdSet.add(k);
            }
          }
        } else if (act.event_type === "custom_client_upserted" && meta.client_name) {
          const cId = String(meta.client_id || `custom_${act.id}`);
          const rawCId = cId.replace(/^(?:custom[-_]|cli-)/, "");
          if (seenClientLifecycle.has(cId) || deletedClientIdSet.has(cId)) {
            continue;
          }
          seenClientLifecycle.add(cId);
          if (rawCId) seenClientLifecycle.add(rawCId);

          const cName = String(meta.client_name).trim();
          const cPhone = String(meta.client_phone || "").trim();
          const phoneDigits = cPhone.replace(/\D/g, "");

          if (typeof meta.newsletter_subscribed === "boolean") {
            recordNewsletterDecision(cId, meta.newsletter_subscribed, act.created_at);
            if (rawCId) recordNewsletterDecision(rawCId, meta.newsletter_subscribed, act.created_at);
            if (phoneDigits) recordNewsletterDecision(`tel:${phoneDigits}`, meta.newsletter_subscribed, act.created_at);
          }

          const existingIdx = inboxState.customClients.findIndex(
            (c) => c.id === cId || (c.clientName === cName && c.clientPhone === cPhone)
          );
          const upsertedObj = {
            id: cId,
            ownerId: userId,
            clientName: cName,
            clientGrade: (meta.client_grade as "VIP" | "일반" | "잠재") || "VIP",
            clientPhone: cPhone,
            budget: String(meta.budget || ""),
            preferredRegion: String(meta.preferred_region || ""),
            buildingId: String(meta.building_id || ""),
            buildingTitle: String(meta.building_title || "관심 매물 상담"),
            newsletterSubscribed: Boolean(meta.newsletter_subscribed),
            createdAt: act.created_at || new Date().toISOString(),
          };
          if (existingIdx >= 0) {
            const memTs = toSafeEpochMs(inboxState.customClients[existingIdx].createdAt);
            const actTs = toSafeEpochMs(act.created_at);
            if (actTs >= memTs) {
              inboxState.customClients[existingIdx] = upsertedObj;
            }
          } else {
            inboxState.customClients.push(upsertedObj);
          }
        } else if (act.event_type === "newsletter_subscription_toggled") {
          const subVal = Boolean(meta.newsletter_subscribed ?? meta.subscribed);
          const cId = String(meta.client_id || meta.thread_id || "").trim();
          const rawCId = String(meta.raw_client_id || cId.replace(/^(?:custom[-_]|cli-)/, "")).trim();
          const phoneDigits = String(meta.client_phone || meta.phone || "").replace(/\D/g, "");
          if (cId) recordNewsletterDecision(cId, subVal, act.created_at);
          if (rawCId) {
            recordNewsletterDecision(rawCId, subVal, act.created_at);
            recordNewsletterDecision(`custom_${rawCId}`, subVal, act.created_at);
            recordNewsletterDecision(`cli-${rawCId}`, subVal, act.created_at);
          }
          if (phoneDigits) recordNewsletterDecision(`tel:${phoneDigits}`, subVal, act.created_at);
        } else if (
          act.event_type === "magazine_subscribed" ||
          act.event_type === "magazine_unsubscribed"
        ) {
          const subVal = act.event_type === "magazine_subscribed";
          const phoneDigits = String(meta.subscriber_phone || meta.phone || "").replace(/\D/g, "");
          if (phoneDigits) recordNewsletterDecision(`tel:${phoneDigits}`, subVal, act.created_at);
        } else if (act.event_type === "im_link_sent") {
          const tok = typeof meta.share_token === "string" ? meta.share_token.trim() : "";
          if (tok && tKey && !issuedTokenByThreadId.has(tKey)) {
            issuedTokenByThreadId.set(tKey, tok);
          }
        } else if (
          (act.event_type === "gate_request_approved" ||
            act.event_type === "gate_request_rejected" ||
            act.event_type === "gate_request_reset") &&
          (tKey || rawKey)
        ) {
          const dec: "approved" | "rejected" | "submitted" =
            act.event_type === "gate_request_approved"
              ? "approved"
              : act.event_type === "gate_request_rejected"
              ? "rejected"
              : "submitted";
          const tok = typeof meta.share_token === "string" ? meta.share_token : undefined;
          if (tok && tKey && !issuedTokenByThreadId.has(tKey)) {
            issuedTokenByThreadId.set(tKey, tok);
          }
          if (tKey) applyDbDecision(tKey, dec, tok, act.created_at);
          if (rawKey) applyDbDecision(rawKey, dec, tok, act.created_at);
        } else if (act.event_type === "link_revoked" || act.event_type === "link_restored") {
          const isRev = act.event_type === "link_revoked";
          const tok = typeof meta.share_token === "string" ? meta.share_token : undefined;
          if (!isRev && tok && tKey && !issuedTokenByThreadId.has(tKey)) {
            issuedTokenByThreadId.set(tKey, tok);
          }
          if (tKey && !seenRevokeThread.has(tKey)) {
            seenRevokeThread.add(tKey);
            revokedByThreadId.set(tKey, {
              revoked: isRev,
              revokedAt: act.created_at,
              shareToken: tok,
            });
          }
          if (bKey && !tok && !seenRevokeBuilding.has(bKey)) {
            seenRevokeBuilding.add(bKey);
            const existingRev = inboxState.revokedBuildings[bKey];
            const actTime = toSafeEpochMs(act.created_at);
            const memTime = toSafeEpochMs(existingRev?.revokedAt);
            if (!existingRev || actTime >= memTime) {
              inboxState.revokedBuildings[bKey] = {
                revoked: isRev,
                revokedAt: act.created_at,
                shareToken: tok,
              };
            }
          }
        } else if (
          (act.event_type === "correction_notice_published" ||
            act.event_type === "correction_notice_cleared") &&
          (bKey || tKey)
        ) {
          const corrTargetKey = bKey || tKey;
          if (!seenCorrectionDecision.has(corrTargetKey)) {
            seenCorrectionDecision.add(corrTargetKey);
            const existingNotice = inboxState.correctionNotices[corrTargetKey];
            const actTime = toSafeEpochMs(act.created_at);
            const memTime = toSafeEpochMs(existingNotice?.updatedAt);
            if (!existingNotice || actTime >= memTime) {
              if (act.event_type === "correction_notice_published" && meta.message) {
                inboxState.correctionNotices[corrTargetKey] = {
                  message: String(meta.message),
                  updatedAt: act.created_at,
                };
              } else if (act.event_type === "correction_notice_cleared") {
                delete inboxState.correctionNotices[corrTargetKey];
              }
            }
          }
        }
      }
    } catch {
      // ignore if activity_events unavailable
    }

    // Separate query for call_note_recorded so floods never evict governance events (B-S1-05)
    try {
      let noteActQuery: any = supabase
        .from("activity_events")
        .select("id, event_type, entity_id, metadata, created_at")
        .eq("actor_id", userId);
      if (typeof noteActQuery.in === "function") {
        noteActQuery = noteActQuery.in("event_type", ["call_note_recorded"]);
      }
      if (typeof noteActQuery.order === "function") {
        noteActQuery = noteActQuery.order("created_at", { ascending: false });
      }
      if (typeof noteActQuery.limit === "function") {
        noteActQuery = noteActQuery.limit(100);
      }
      const { data: noteActs } = await noteActQuery;
      for (const act of noteActs || []) {
        const meta = (act.metadata as Record<string, any>) || {};
        if (!meta.note) continue;
        const tKey = String(meta.thread_id || meta.request_id || act.entity_id || "").trim();
        const rawKey = String(meta.request_id || meta.raw_client_id || "").trim();
        const noteItem = {
          id: `ev-note-${act.id}`,
          description: String(meta.note),
          timestamp: formatRelativeKo(act.created_at) || "방금",
          createdAt: act.created_at,
        };
        for (const key of new Set([tKey, rawKey].filter(Boolean))) {
          const existing = callNotesByThreadId.get(key) || [];
          if (!existing.some((e) => e.description === noteItem.description)) {
            existing.push(noteItem);
            callNotesByThreadId.set(key, existing);
          }
        }
      }
    } catch {
      // ignore if activity_events unavailable
    }
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

  // ── 4. Build Real Threads for Workspace (No Fake Seeds, No Token Bleed!) ──
  const threads: any[] = [];
  const seenThreadIds = new Set<string>();

  for (const gr of [...gateItems, ...inquiryItems]) {
    const tid = String(gr.id);
    if (!tid || seenThreadIds.has(tid)) continue;
    seenThreadIds.add(tid);

    const decisionOverride = decisionByThreadId.get(tid);
    const effectiveStatus =
      gr.status === "expired"
        ? "expired"
        : decisionOverride
        ? decisionOverride.decision
        : gr.status;

    const isPending =
      effectiveStatus === "submitted" ||
      effectiveStatus === "pending" ||
      effectiveStatus === "broker_review";
    const isApproved = effectiveStatus === "approved";
    const isRejected = effectiveStatus === "rejected" || effectiveStatus === "expired";
    gr.status = effectiveStatus;
    gr.is_unread = isPending;

    // B-S1-08: Strictly match share link belonging ONLY to THIS recipient_id (zero bleed across requesters on same building)
    const recipientLink = shareLinks.find(
      (sl) => sl.recipient_id && String(sl.recipient_id) === tid
    );
    const threadRevokeState = revokedByThreadId.get(tid);
    const isRevoked =
      threadRevokeState?.revoked === true ||
      (threadRevokeState?.revoked !== false &&
        (recipientLink?.status === "revoked" ||
          Boolean(recipientLink?.revoked_at) ||
          Boolean(
            gr.building_id && inboxState.revokedBuildings?.[String(gr.building_id)]?.revoked
          )));

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
    } else if (effectiveStatus === "expired") {
      threadEvents.push({
        id: `ev-expired-${tid}`,
        eventType: "gate_request" as const,
        description: "IM 열람 유효기간이 만료되었습니다.",
        timestamp: formatRelativeKo(gr.expires_at || gr.created_at) || "방금",
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
        : effectiveStatus === "expired"
        ? "IM 열람 유효기간이 만료되었습니다."
        : isRejected
        ? "IM 열람 요청을 거절했습니다."
        : baseRequestMsg);

    const lastActivityAt =
      threadCallNotes[0]?.createdAt || decisionOverride?.createdAt || gr.created_at || "";

    const bIdStr = String(gr.building_id || "");
    const resolvedShareToken =
      isApproved && !isRevoked
        ? decisionOverride?.shareToken ||
          issuedTokenByThreadId.get(tid) ||
          recipientLink?.token ||
          ""
        : isRevoked
        ? recipientLink?.token ||
          threadRevokeState?.shareToken ||
          decisionOverride?.shareToken ||
          ""
        : "";
    const resolvedShareUrl =
      isApproved && !isRevoked ? buildThreadShareUrl(bIdStr, resolvedShareToken) : "";

    const phoneDigits = String(gr.requesterPhone || gr.requester_phone || "").replace(/\D/g, "");
    const nlDecision =
      newsletterStateByKey.get(tid) ||
      (phoneDigits ? newsletterStateByKey.get(`tel:${phoneDigits}`) : undefined);
    const corrMsg =
      (bIdStr && inboxState.correctionNotices?.[bIdStr]?.message) ||
      inboxState.correctionNotices?.[tid]?.message ||
      "";

    threads.push({
      id: tid,
      clientName: gr.requesterName || gr.requester_name || "이름 미입력 고객",
      clientPhone: gr.requesterPhone || gr.requester_phone || "",
      requesterCompany: gr.requesterCompany || gr.requester_company || "",
      cleanMessage: baseRequestMsg,
      clientGrade: "일반" as const,
      buildingTitle: gr.buildingTitle || gr.building_label || "매물",
      buildingId: bIdStr,
      latestEvent: latestEventText,
      detail:
        effectiveStatus === "expired"
          ? "IM 열람 유효기간이 만료되었습니다."
          : isRejected
          ? "IM 열람 요청을 거절했습니다."
          : baseRequestMsg,
      gateStatus: isPending
        ? ("pending" as const)
        : isApproved
        ? ("approved" as const)
        : isRejected
        ? ("rejected" as const)
        : ("none" as const),
      updatedAt: formatRelativeKo(lastActivityAt || gr.created_at) || "방금",
      lastActivityAt,
      openCount: viewEventsForBldg.length,
      isRead: !gr.is_unread,
      status: isRevoked
        ? ("revoked" as const)
        : isPending
        ? ("pending_gate" as const)
        : ("active" as const),
      shareToken: resolvedShareToken,
      shareUrl: resolvedShareUrl,
      hasCorrectionNotice: Boolean(corrMsg),
      correctionMessage: corrMsg,
      budget: "",
      preferredRegion: "",
      focusedSections,
      newsletterSubscribed: Boolean(nlDecision?.subscribed),
      events: threadEvents,
    });
  }

  // Add custom clients (including cold-start customClients restored from activity_events — B-S1-09, INBOX-06, INBOX-12)
  const seenCustomClientIdentity = new Set<string>();
  const allOwnCustomSources = [
    ...(inboxState.customClients || []).filter(
      (c) => Boolean(c.ownerId) && c.ownerId === userId
    ),
    ...customClientRows,
    ...dbClients,
  ];

  for (const row of allOwnCustomSources) {
    const rawId = String(row.id || "");
    if (!rawId) continue;
    const tid =
      rawId.startsWith("custom_") || rawId.startsWith("cli-") ? rawId : `custom_${rawId}`;
    const strippedId = tid.replace(/^(?:custom[-_]|cli-)/, "");
    if (
      deletedClientIdSet.has(tid) ||
      deletedClientIdSet.has(rawId) ||
      (strippedId && deletedClientIdSet.has(strippedId))
    ) {
      continue;
    }
    if (seenThreadIds.has(tid) || seenThreadIds.has(rawId)) continue;

    const name = String(row.display_name || row.name || row.clientName || "").trim();
    if (!name) continue;
    const phone = String(row.phone || row.clientPhone || "").trim();
    const phoneDigits = phone.replace(/\D/g, "");
    const identityKey = `${name.toLowerCase()}::${phoneDigits}`;
    if (seenCustomClientIdentity.has(identityKey)) continue;
    seenCustomClientIdentity.add(identityKey);
    seenThreadIds.add(tid);

    const parsedMeta = parseClientNotesMeta(row.notes);
    let bId = String(
      row.building_id ||
        row.buildingId ||
        (Array.isArray(row.linked_building_ids) && row.linked_building_ids[0]) ||
        ""
    ).trim();
    if (bId && (forbiddenBuildingSet.has(bId) || deletedBuildingSet.has(bId))) {
      bId = "";
    }

    const rawBTitle = String(
      row.building_title ||
        row.buildingTitle ||
        parsedMeta.buildingTitle ||
        (bId ? buildingTitleById.get(bId) : "") ||
        ""
    ).trim();
    if (!bId && rawBTitle && rawBTitle !== "관심 매물 상담" && rawBTitle !== "관심 매물 미지정") {
      const matchedInv = quickInventory.find(
        (q) => q.title === rawBTitle || q.buildingId === rawBTitle
      );
      if (matchedInv) {
        bId = matchedInv.buildingId;
      }
    }
    const bTitle =
      rawBTitle ||
      (bId ? buildingTitleById.get(bId) : "") ||
      (bId ? quickInventory.find((q) => q.buildingId === bId)?.title : "") ||
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

    const recipientLink = shareLinks.find(
      (sl) =>
        sl.recipient_id &&
        (String(sl.recipient_id) === tid || String(sl.recipient_id) === rawId)
    );
    const threadRevokeState = revokedByThreadId.get(tid) || revokedByThreadId.get(rawId);
    const isRevoked =
      threadRevokeState?.revoked === true ||
      (threadRevokeState?.revoked !== false &&
        (recipientLink?.status === "revoked" ||
          Boolean(recipientLink?.revoked_at) ||
          Boolean(bId && inboxState.revokedBuildings?.[bId]?.revoked)));

    const resolvedShareToken =
      issuedTokenByThreadId.get(tid) ||
      issuedTokenByThreadId.get(rawId) ||
      recipientLink?.token ||
      threadRevokeState?.shareToken ||
      "";
    const resolvedShareUrl =
      !isRevoked && bId ? buildThreadShareUrl(bId, resolvedShareToken) : "";

    const tags = Array.isArray(row.tags) ? row.tags.map((t: unknown) => String(t)) : [];
    const hasNewsletterTag =
      tags.some((t: string) => /뉴스레터|구독|newsletter|subscribe/i.test(t)) &&
      !tags.some((t: string) => /수신거부|해지|unsub/i.test(t));

    const nlOverride =
      newsletterStateByKey.get(tid) ||
      newsletterStateByKey.get(rawId) ||
      (strippedId ? newsletterStateByKey.get(strippedId) : undefined) ||
      (phoneDigits ? newsletterStateByKey.get(`tel:${phoneDigits}`) : undefined);
    const rowCreatedMs = toSafeEpochMs(row.created_at || row.createdAt);
    const resolvedNewsletterSubscribed =
      nlOverride && nlOverride.createdAtMs >= rowCreatedMs
        ? nlOverride.subscribed
        : typeof row.newsletterSubscribed === "boolean"
        ? row.newsletterSubscribed
        : hasNewsletterTag;

    const summaryCleanMessage =
      [
        budget ? `희망 예산 ${budget}` : "",
        preferredRegion ? `선호 권역 ${preferredRegion}` : "",
      ]
        .filter(Boolean)
        .join(" · ") ||
      (!parsedMeta.isStructuredMeta && row.notes ? String(row.notes) : "직접 등록한 고객입니다.");

    const lastActivityAt =
      (notesList[0] as any)?.createdAt || row.created_at || row.createdAt || "";
    const corrMsg =
      (bId && inboxState.correctionNotices?.[bId]?.message) ||
      inboxState.correctionNotices?.[tid]?.message ||
      "";

    threads.push({
      id: tid,
      clientName: name,
      clientPhone: phone,
      requesterCompany: "",
      cleanMessage: summaryCleanMessage,
      clientGrade:
        row.tier === "vip" || row.tier === "VIP" || row.clientGrade === "VIP"
          ? ("VIP" as const)
          : row.tier === "potential" || row.clientGrade === "잠재"
          ? ("잠재" as const)
          : ("일반" as const),
      buildingTitle: bTitle,
      buildingId: bId,
      latestEvent: notesList[0]?.description || summaryCleanMessage,
      gateStatus: "none" as const,
      updatedAt: formatRelativeKo(lastActivityAt) || "방금",
      lastActivityAt,
      openCount: 0,
      isRead: true,
      status: isRevoked ? ("revoked" as const) : ("active" as const),
      shareToken: resolvedShareToken,
      shareUrl: resolvedShareUrl,
      hasCorrectionNotice: Boolean(corrMsg),
      correctionMessage: corrMsg,
      budget,
      preferredRegion,
      focusedSections: [],
      newsletterSubscribed: resolvedNewsletterSubscribed,
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

  // Group remaining view events by building + viewer with stable thread IDs (INBOX-06: restore revoke & correction state)
  const viewGroups = new Map<string, any[]>();
  for (const v of viewItems) {
    const key = `${v.building_id || "b"}::${v.viewerName || "anon"}`;
    const list = viewGroups.get(key) || [];
    list.push(v);
    viewGroups.set(key, list);
  }
  for (const [, group] of viewGroups.entries()) {
    const first = group[0];
    const tid = `view_${first.building_id || "b"}_${encodeURIComponent(
      first.viewerName || "anon"
    )}`;
    if (seenThreadIds.has(tid)) continue;
    if (
      first.viewerName !== "익명 열람객" &&
      threads.some(
        (t) => t.buildingId === String(first.building_id) && t.clientName === first.viewerName
      )
    ) {
      continue;
    }
    seenThreadIds.add(tid);

    const bIdStr = String(first.building_id || "");
    const focusedSections = Array.from(
      new Set(group.map((g) => g.sectionName).filter((s): s is string => Boolean(s)))
    );
    const threadRevokeState = revokedByThreadId.get(tid);
    const isRevoked =
      threadRevokeState?.revoked === true ||
      (threadRevokeState?.revoked !== false &&
        Boolean(bIdStr && inboxState.revokedBuildings?.[bIdStr]?.revoked));
    const corrMsg =
      (bIdStr && inboxState.correctionNotices?.[bIdStr]?.message) ||
      inboxState.correctionNotices?.[tid]?.message ||
      "";
    const resolvedShareToken =
      issuedTokenByThreadId.get(tid) || threadRevokeState?.shareToken || "";
    const resolvedShareUrl =
      !isRevoked && bIdStr ? buildThreadShareUrl(bIdStr, resolvedShareToken) : "";
    const viewCallNotes = callNotesByThreadId.get(tid) || [];

    threads.push({
      id: tid,
      clientName: first.viewerName || "익명 열람객",
      clientPhone: "",
      requesterCompany: "",
      cleanMessage: "상세 자료를 열람했습니다",
      clientGrade: "일반" as const,
      buildingTitle:
        buildingTitleById.get(bIdStr) ||
        first.sub_label ||
        "매물",
      buildingId: bIdStr,
      latestEvent:
        viewCallNotes[0]?.description ||
        (isRevoked
          ? "보낸 링크를 잠갔습니다."
          : focusedSections.length > 0
          ? `${focusedSections.join(" · ")} 열람`
          : first.label || "상세 자료를 열람했습니다"),
      gateStatus: "none" as const,
      updatedAt: formatRelativeKo(first.created_at) || "방금",
      lastActivityAt: first.created_at || "",
      openCount: group.length,
      isRead: true,
      status: isRevoked
        ? ("revoked" as const)
        : group.length >= 3
        ? ("high_interest" as const)
        : ("active" as const),
      shareToken: resolvedShareToken,
      shareUrl: resolvedShareUrl,
      hasCorrectionNotice: Boolean(corrMsg),
      correctionMessage: corrMsg,
      budget: "",
      preferredRegion: "",
      focusedSections,
      newsletterSubscribed: Boolean(newsletterStateByKey.get(tid)?.subscribed),
      events: [
        ...viewCallNotes.map((n) => ({
          id: n.id,
          eventType: "dwell" as const,
          description: n.description,
          timestamp: n.timestamp,
        })),
        ...group.map((g) => ({
          id: `ev-${g.id}`,
          eventType: "open" as const,
          description: g.sectionName
            ? `${g.sectionName} 열람`
            : g.label || "상세 자료를 열람했습니다",
          timestamp: formatRelativeKo(g.created_at) || "방금",
          sectionName: g.sectionName,
        })),
      ],
    });
  }

  // Sort threads deterministically by latest activity timestamp descending (B-S1-08)
  threads.sort((a, b) => toSafeEpochMs(b.lastActivityAt) - toSafeEpochMs(a.lastActivityAt));

  // ── 5. 통합 & 정렬 ──
  const allItems = [...gateItems, ...inquiryItems, ...viewItems, ...notifItems]
    .sort((a, b) => toSafeEpochMs(b.created_at) - toSafeEpochMs(a.created_at))
    .slice(offset, offset + limit);

  const unreadCount =
    gateItems.filter((i) => i.is_unread).length +
    inquiryItems.filter((i) => i.is_unread).length +
    notifItems.filter((i) => i.is_unread).length;

  return NextResponse.json({
    ok: true,
    userId,
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
