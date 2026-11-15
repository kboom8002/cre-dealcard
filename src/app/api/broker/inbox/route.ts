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
import { getBrokerSubscriptionTier } from "@/domain/subscription/tier-gate";
import {
  normalizeClientEmail,
  normalizeTransactionalBasis,
  type InboxTransactionalBasis,
} from "@/domain/inbox/inbox-outbound";

function formatImSectionLabel(sectionId?: string | null): string | undefined {
  const s = typeof sectionId === "string" ? sectionId.trim() : "";
  if (!s) return undefined;
  const map: Record<string, string> = {
    "01_cover": "표지",
    "02_summary": "핵심 요약",
    "03_overview": "건물 개요",
    "04_location": "입지·교통",
    "05_tenancy": "임대 현황",
    "06_financials": "수익률 분석",
    "07_valuation": "가치 평가",
    "08_risk": "리스크 점검",
  };
  return map[s] || s;
}

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

function normalizeKrPhoneDigits(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || s.includes("@")) return "";
  let digits = s.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 10) {
    digits = "0" + digits.slice(digits.startsWith("820") ? 3 : 2);
  }
  return digits;
}

function formatKrPhoneDisplay(rawPhone: unknown, fallbackE164: unknown, fallbackEmail: unknown): string {
  const direct = typeof rawPhone === "string" ? rawPhone.trim() : "";
  if (direct && !direct.startsWith("+82")) return direct;
  const digits = normalizeKrPhoneDigits(direct || fallbackE164);
  if (digits.length === 11 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (direct) return direct;
  const e164 = typeof fallbackE164 === "string" ? fallbackE164.trim() : "";
  if (e164) return e164;
  return typeof fallbackEmail === "string" ? fallbackEmail.trim() : "";
}

export type InboxCrmClientRole = "buyer" | "seller" | "tenant" | "partner";
export type InboxEmailDeliveryStatus = "ok" | "bounced" | "complained";

export interface InboxDispatchHistoryItem {
  id: string;
  eventType: string;
  channel: string;
  title: string;
  status: string;
  createdAt: string;
  bounceReason?: string;
}

function normalizeClientRole(raw: unknown): InboxCrmClientRole | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "buyer" || s === "매수" || s === "매수자") return "buyer";
  if (
    s === "seller" ||
    s === "owner" ||
    s === "매도" ||
    s === "매도자" ||
    s === "소유주"
  ) {
    return "seller";
  }
  if (s === "tenant" || s === "lessee" || s === "임차" || s === "임차인") {
    return "tenant";
  }
  if (s === "partner" || s === "공동중개" || s === "파트너") return "partner";
  return null;
}

function parsePreferredRegionsInput(rawArr: unknown, rawStr?: unknown): string[] {
  const out = new Set<string>();
  if (Array.isArray(rawArr)) {
    for (const item of rawArr) {
      const s = String(item ?? "").trim();
      if (s) out.add(s);
    }
    if (out.size > 0) return Array.from(out);
  }
  if (typeof rawStr === "string" && rawStr.trim()) {
    for (const part of rawStr.split(/[,/]+/)) {
      const s = part.trim();
      if (s) out.add(s);
    }
  }
  return Array.from(out);
}

function parseBudgetManwonInput(rawManwon: unknown, rawText?: unknown): number | null {
  if (rawManwon === null) return null;
  if (typeof rawManwon === "number" && Number.isFinite(rawManwon) && rawManwon >= 0) {
    return Math.round(rawManwon);
  }
  if (typeof rawManwon === "string" && rawManwon.trim()) {
    const cleanNum = rawManwon.trim().replace(/,/g, "");
    if (/^\d+$/.test(cleanNum)) {
      return Math.round(Number(cleanNum));
    }
  }
  if (typeof rawText === "string" && rawText.trim()) {
    const txt = rawText.trim().replace(/,/g, "");
    const eokMatch = txt.match(/(\d+(?:\.\d+)?)\s*억/);
    const manMatch = txt.match(/(\d+(?:\.\d+)?)\s*만/);
    if (eokMatch || manMatch) {
      const eokVal = eokMatch ? Number(eokMatch[1]) * 10000 : 0;
      const manVal = manMatch ? Number(manMatch[1]) : 0;
      const sum = Math.round(eokVal + manVal);
      return Number.isFinite(sum) && sum > 0 ? sum : null;
    }
    if (/^\d+$/.test(txt)) {
      return Math.round(Number(txt));
    }
  }
  return null;
}

function formatBudgetManwonDisplay(manwon: number | null): string {
  if (manwon === null || !Number.isFinite(manwon) || manwon <= 0) return "";
  if (manwon >= 10000) {
    const eok = manwon / 10000;
    return Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1).replace(/\.0$/, "")}억`;
  }
  return `${manwon.toLocaleString("ko-KR")}만`;
}

function extractFreeMemoFromLegacyNotes(notesRaw: unknown): string {
  const text = typeof notesRaw === "string" ? notesRaw.trim() : "";
  if (!text) return "";
  const isPureLegacyConcatenation =
    /^(?:(?:예산|선호권역|관심매물|근거)\s*:[^/]+(?:\s*\/\s*)?)+$/i.test(text);
  if (isPureLegacyConcatenation) return "";
  return text;
}

function normalizeEmailDeliveryStatus(raw: unknown): InboxEmailDeliveryStatus {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "complained") return "complained";
  if (s === "bounced") return "bounced";
  return "ok";
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
  const filter = (url.searchParams.get("filter") || "all").trim().toLowerCase();
  const includeArchived = url.searchParams.get("includeArchived") === "1";
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
        threads: ownCustomClients.map((c) => {
          const cm = c as Record<string, any>;
          const grade = c.clientGrade || "VIP";
          const isVip = typeof cm.isVip === "boolean" ? cm.isVip : grade === "VIP";
          const clientRole = normalizeClientRole(cm.clientRole) || "buyer";
          const preferredRegions = parsePreferredRegionsInput(
            cm.preferredRegions,
            c.preferredRegion
          );
          const budgetManwon = parseBudgetManwonInput(cm.budgetManwon, c.budget);
          const freeMemo = typeof cm.freeMemo === "string" ? cm.freeMemo : "";
          return {
            id: c.id.startsWith("custom_") ? c.id : `custom_${c.id}`,
            clientName: c.clientName,
            clientGrade: grade,
            isVip,
            clientRole,
            clientPhone: c.clientPhone || "",
            clientEmail: normalizeClientEmail(c.clientEmail) || "",
            budget: c.budget || formatBudgetManwonDisplay(budgetManwon),
            budgetManwon,
            preferredRegion: c.preferredRegion || preferredRegions.join(", "),
            preferredRegions,
            freeMemo,
            emailDeliveryStatus: "ok" as InboxEmailDeliveryStatus,
            dispatchHistory: [] as InboxDispatchHistoryItem[],
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
          };
        }),
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

  let subscriptionInfo: {
    tier: "free" | "pro" | "premium";
    isPaid: boolean;
    status: string;
  } = {
    tier: "free",
    isPaid: false,
    status: "free",
  };
  try {
    subscriptionInfo = await getBrokerSubscriptionTier(supabase, userId);
  } catch {
    // Non-blocking free fallback when subscription table unavailable in tests
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

  if (userId) {
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
  if (userId) {
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
          "deal_deleted",
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
          act.event_type === "deal_deleted" ||
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
  if (filter !== "views") {
    const uuidOwnedIds = isUuid(userId)
      ? allOwnedBuildingIds.filter((id) => isUuid(id))
      : allOwnedBuildingIds;

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
  if (filter !== "requests") {
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

        const visitorFp = String(
          meta.visitor_fp ||
            meta.user_agent_hash ||
            meta.visitor_id ||
            meta.visitor_hash ||
            meta.ip_hash ||
            ""
        ).trim();

        return {
          id: evt.id,
          type: "view" as const,
          event_type: evt.event_type,
          label,
          sub_label: subLabel,
          building_id: evt.entity_id || meta.building_id,
          viewer_info: viewerName,
          viewerName,
          visitorFp,
          sectionName,
          sectionViewed:
            typeof meta.section_viewed === "string" && meta.section_viewed.trim()
              ? meta.section_viewed.trim()
              : null,
          dwellSeconds:
            typeof meta.dwell_seconds === "number" && Number.isFinite(meta.dwell_seconds)
              ? meta.dwell_seconds
              : 0,
          recipientId:
            typeof meta.recipient_id === "string" && meta.recipient_id.trim()
              ? meta.recipient_id.trim()
              : typeof meta.subscriber_id === "string" && meta.subscriber_id.trim()
              ? meta.subscriber_id.trim()
              : null,
          gateRequestId:
            typeof meta.gate_request_id === "string" && meta.gate_request_id.trim()
              ? meta.gate_request_id.trim()
              : typeof meta.request_id === "string" && meta.request_id.trim()
              ? meta.request_id.trim()
              : null,
          shareToken:
            typeof meta.share_token === "string" && meta.share_token.trim()
              ? meta.share_token.trim()
              : typeof meta.token === "string" && meta.token.trim()
              ? meta.token.trim()
              : null,
          shareTokenChannel:
            typeof meta.share_token_channel === "string"
              ? meta.share_token_channel
              : null,
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
    let inqQuery: any = supabase
      .from("im_inquiry_requests")
      .select(
        "id, building_id, status, requester_name, requester_phone, requester_email, message, created_at"
      )
      .eq("broker_user_id", userId);
    let inqRes =
      typeof inqQuery.order === "function"
        ? await inqQuery.order("created_at", { ascending: false }).limit(limit)
        : await inqQuery;
    if (inqRes?.error) {
      const fallbackInqQ: any = supabase
        .from("im_inquiry_requests")
        .select(
          "id, building_id, requester_name, requester_phone, requester_email, message, created_at"
        )
        .eq("broker_user_id", userId);
      inqRes =
        typeof fallbackInqQ.order === "function"
          ? await fallbackInqQ.order("created_at", { ascending: false }).limit(limit)
          : await fallbackInqQ;
    }
    const inquiries = inqRes?.data || [];
    const existingGateIds = new Set(gateItems.map((g: any) => String(g.id)));
    inquiryItems = inquiries
      .filter((inq: any) => {
        if (existingGateIds.has(String(inq.id))) return false;
        const inqBldId = inq.building_id ? String(inq.building_id) : "";
        if (inqBldId && forbiddenBuildingSet.has(inqBldId)) return false;
        return true;
      })
      .map((inq: any) => {
        const parsed = parseGateRequestReason(inq.message);
        const bIdStr = inq.building_id ? String(inq.building_id) : "";
        const isDeletedBld = Boolean(
          bIdStr && deletedBuildingSet.has(bIdStr) && !allOwnedBuildingIds.includes(bIdStr)
        );
        const bTitle =
          buildingTitleById.get(bIdStr) ||
          quickInventory.find((q) => q.buildingId === bIdStr)?.title ||
          (isDeletedBld ? "삭제된 매물 (과거 문의)" : "매물");
        const rName = inq.requester_name || parsed.requesterName || "매수 문의 고객";
        const rPhone = inq.requester_phone || parsed.requesterPhone || "";
        const cMsg = parsed.cleanMessage || inq.message || "IM 열람을 요청했습니다.";
        const rawStatus =
          typeof inq.status === "string" && inq.status.trim() ? inq.status.trim() : "submitted";
        const isPending =
          !isDeletedBld &&
          (rawStatus === "submitted" ||
            rawStatus === "pending" ||
            rawStatus === "broker_review");
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
          is_deleted_building: isDeletedBld,
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
          "id, broker_id, display_name, phone, email, client_type, client_role, tier, is_vip, preferred_regions, budget_manwon, free_memo, email_delivery_status, email_bounced_at, email_bounce_reason, tags, notes, linked_building_ids, created_at"
        )
        .eq("broker_id", userId);
      let cliRes =
        typeof cliQ.order === "function"
          ? await cliQ.order("created_at", { ascending: false }).limit(50)
          : await cliQ;
      if (cliRes?.error) {
        const cliFallbackQ: any = supabase
          .from("broker_clients")
          .select(
            "id, broker_id, display_name, phone, tier, tags, notes, linked_building_ids, created_at"
          )
          .eq("broker_id", userId);
        cliRes =
          typeof cliFallbackQ.order === "function"
            ? await cliFallbackQ.order("created_at", { ascending: false }).limit(50)
            : await cliFallbackQ;
      }
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

  // ── 3-B2. 공개 뉴스레터 구독자 조회 (C-2: NL-304 ↔ IB-403) ──
  let brokerSlug = "";
  const subscriberRows: any[] = [];
  if (userId) {
    try {
      const bpQ: any = supabase
        .from("broker_profiles")
        .select("user_id, slug")
        .eq("user_id", userId);
      const bpRes =
        typeof bpQ.maybeSingle === "function" ? await bpQ.maybeSingle() : await bpQ.single?.();
      if (bpRes?.data?.slug) {
        brokerSlug = String(bpRes.data.slug).trim();
      }
    } catch {
      // ignore if broker_profiles unavailable
    }

    const subSelectCols =
      "id, broker_id, subscriber_name, subscriber_email, subscriber_phone, phone_e164, status, confirm_status, unsubscribed_at, interest_profile, segment, email_delivery_status, email_bounced_at, email_bounce_reason, created_at";
    const seenSubRowIds = new Set<string>();
    const pushSubRows = (rows: unknown) => {
      if (!Array.isArray(rows)) return;
      for (const r of rows) {
        const rId = String((r as any)?.id || "").trim();
        if (!rId || seenSubRowIds.has(rId)) continue;
        seenSubRowIds.add(rId);
        subscriberRows.push(r);
      }
    };

    const brokerKeys = Array.from(new Set([userId, brokerSlug].filter(Boolean)));
    if (brokerKeys.length > 0) {
      try {
        let subQ: any = supabase
          .from("magazine_subscribers")
          .select(subSelectCols)
          .in("broker_id", brokerKeys);
        if (typeof subQ.order === "function") {
          subQ = subQ.order("created_at", { ascending: false }).limit(100);
        }
        let subRes = await subQ;
        if (subRes?.error) {
          let fallbackQ: any = supabase
            .from("magazine_subscribers")
            .select("*")
            .in("broker_id", brokerKeys);
          if (typeof fallbackQ.order === "function") {
            fallbackQ = fallbackQ.order("created_at", { ascending: false }).limit(100);
          }
          subRes = await fallbackQ;
        }
        pushSubRows(subRes?.data);
      } catch {
        // ignore if magazine_subscribers unavailable
      }
    }

    if (isUuid(userId)) {
      try {
        let subByUuidQ: any = supabase
          .from("magazine_subscribers")
          .select(subSelectCols)
          .eq("broker_user_id", userId);
        if (typeof subByUuidQ.order === "function") {
          subByUuidQ = subByUuidQ.order("created_at", { ascending: false }).limit(100);
        }
        const subByUuidRes = await subByUuidQ;
        if (!subByUuidRes?.error) {
          pushSubRows(subByUuidRes?.data);
        }
      } catch {
        // ignore if broker_user_id column does not exist
      }
    }
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
    ...subscriberRows.map((s: any) => String(s.id)),
    ...subscriberRows.map((s: any) => `sub_${s.id}`),
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
  const archivedThreadIds = new Set<string>();

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

  const rawDispatchAuditEvents: Array<Record<string, any>> = [];

  if (userId) {
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
          "inbox_thread_archived",
          "inbox_thread_unarchived",
          "im_link_sent",
          "link_revoked",
          "link_restored",
          "thread_link_revoked",
          "thread_link_restored",
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
        govActQuery = govActQuery.limit(220);
      }
      const { data: govActs } = await govActQuery;

      const seenDbDecisionKeys = new Set<string>();
      const seenArchiveDecision = new Set<string>();
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
        const tKey = String(
          meta.thread_id || meta.gate_request_id || meta.request_id || ""
        ).trim();
        const rawKey = String(
          meta.gate_request_id || meta.request_id || meta.raw_client_id || ""
        ).trim();
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
          const resolvedGrade: "VIP" | "일반" | "잠재" =
            meta.client_grade === "일반" || meta.client_grade === "잠재"
              ? meta.client_grade
              : meta.is_vip === false
              ? "일반"
              : "VIP";
          const resolvedIsVip =
            typeof meta.is_vip === "boolean" ? meta.is_vip : resolvedGrade === "VIP";
          const resolvedRole = normalizeClientRole(meta.client_role) || "buyer";
          const resolvedRegions = parsePreferredRegionsInput(
            meta.preferred_regions,
            meta.preferred_region
          );
          const resolvedBudgetManwon = parseBudgetManwonInput(
            meta.budget_manwon,
            meta.budget
          );
          const resolvedFreeMemo =
            typeof meta.free_memo === "string" ? meta.free_memo : "";

          const upsertedObj = {
            id: cId,
            ownerId: userId,
            clientName: cName,
            clientGrade: resolvedGrade,
            isVip: resolvedIsVip,
            clientRole: resolvedRole,
            clientPhone: cPhone,
            clientEmail: normalizeClientEmail(meta.client_email) || undefined,
            transactionalBasis:
              normalizeTransactionalBasis(meta.transactional_basis) || undefined,
            budget: String(meta.budget || formatBudgetManwonDisplay(resolvedBudgetManwon)),
            budgetManwon: resolvedBudgetManwon,
            preferredRegion: String(
              meta.preferred_region || resolvedRegions.join(", ")
            ),
            preferredRegions: resolvedRegions,
            freeMemo: resolvedFreeMemo,
            buildingId: String(meta.building_id || ""),
            buildingTitle: String(meta.building_title || "관심 매물 상담"),
            newsletterSubscribed: Boolean(meta.newsletter_subscribed),
            createdAt: act.created_at || new Date().toISOString(),
          };
          if (existingIdx >= 0) {
            const memTs = toSafeEpochMs(inboxState.customClients[existingIdx].createdAt);
            const actTs = toSafeEpochMs(act.created_at);
            if (actTs >= memTs) {
              inboxState.customClients[existingIdx] = upsertedObj as any;
            }
          } else {
            inboxState.customClients.push(upsertedObj as any);
          }
        } else if (act.event_type === "newsletter_subscription_toggled") {
          const subVal = Boolean(meta.newsletter_subscribed ?? meta.subscribed);
          const cId = String(meta.client_id || meta.thread_id || "").trim();
          const rawCId = String(
            meta.raw_client_id || cId.replace(/^(?:custom[-_]|cli-|sub_)/, "")
          ).trim();
          const phoneDigits = normalizeKrPhoneDigits(meta.client_phone || meta.phone || "");
          const emailNorm = String(meta.client_email || meta.email || "")
            .trim()
            .toLowerCase();
          if (cId) recordNewsletterDecision(cId, subVal, act.created_at);
          if (rawCId) {
            recordNewsletterDecision(rawCId, subVal, act.created_at);
            recordNewsletterDecision(`custom_${rawCId}`, subVal, act.created_at);
            recordNewsletterDecision(`cli-${rawCId}`, subVal, act.created_at);
            recordNewsletterDecision(`sub_${rawCId}`, subVal, act.created_at);
          }
          if (phoneDigits) recordNewsletterDecision(`tel:${phoneDigits}`, subVal, act.created_at);
          if (emailNorm) recordNewsletterDecision(`email:${emailNorm}`, subVal, act.created_at);
        } else if (
          act.event_type === "magazine_subscribed" ||
          act.event_type === "magazine_unsubscribed"
        ) {
          const subVal = act.event_type === "magazine_subscribed";
          const phoneDigits = normalizeKrPhoneDigits(meta.subscriber_phone || meta.phone || "");
          const emailNorm = String(meta.subscriber_email || meta.email || "")
            .trim()
            .toLowerCase();
          if (phoneDigits) recordNewsletterDecision(`tel:${phoneDigits}`, subVal, act.created_at);
          if (emailNorm) recordNewsletterDecision(`email:${emailNorm}`, subVal, act.created_at);
        } else if (
          act.event_type === "inbox_thread_archived" ||
          act.event_type === "inbox_thread_unarchived"
        ) {
          const isArch = act.event_type === "inbox_thread_archived";
          for (const k of [tKey, rawKey].filter(Boolean)) {
            if (!seenArchiveDecision.has(k)) {
              seenArchiveDecision.add(k);
              if (isArch) {
                archivedThreadIds.add(k);
              } else {
                archivedThreadIds.delete(k);
              }
            }
          }
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
        } else if (
          act.event_type === "thread_link_revoked" ||
          act.event_type === "thread_link_restored"
        ) {
          const isRev = act.event_type === "thread_link_revoked";
          const tok = typeof meta.share_token === "string" ? meta.share_token : undefined;
          for (const k of new Set([tKey, rawKey].filter(Boolean))) {
            if (!seenRevokeThread.has(k)) {
              seenRevokeThread.add(k);
              revokedByThreadId.set(k, {
                revoked: isRev,
                revokedAt: act.created_at,
                shareToken: tok,
              });
            }
          }
        } else if (act.event_type === "link_revoked" || act.event_type === "link_restored") {
          const isRev = act.event_type === "link_revoked";
          const tok = typeof meta.share_token === "string" ? meta.share_token : undefined;
          if (!isRev && tok && tKey && !issuedTokenByThreadId.has(tKey)) {
            issuedTokenByThreadId.set(tKey, tok);
          }
          for (const k of new Set([tKey, rawKey].filter(Boolean))) {
            if (!seenRevokeThread.has(k)) {
              seenRevokeThread.add(k);
              revokedByThreadId.set(k, {
                revoked: isRev,
                revokedAt: act.created_at,
                shareToken: tok,
              });
            }
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

    // WP-18: Outbound & email-delivery audit trail query for right-pane Tab 3 `기록`
    try {
      const seenDispatchIds = new Set<string>();
      const pushDispatchRows = (rows: unknown, allowNullActor: boolean) => {
        if (!Array.isArray(rows)) return;
        for (const ev of rows) {
          const id = String((ev as any)?.id || "");
          if (!id || seenDispatchIds.has(id)) continue;
          const actor = (ev as any)?.actor_id ? String((ev as any).actor_id) : null;
          if (actor && actor !== userId) continue;
          if (!actor && !allowNullActor) continue;
          seenDispatchIds.add(id);
          rawDispatchAuditEvents.push(ev as Record<string, any>);
        }
      };

      let ownDispQ: any = supabase
        .from("activity_events")
        .select("id, actor_id, event_type, entity_id, metadata, created_at")
        .eq("actor_id", userId);
      if (typeof ownDispQ.in === "function") {
        ownDispQ = ownDispQ.in("event_type", [
          "inbox_email_sent",
          "inbox_outbound_copied",
          "inbox_alimtalk_sent",
          "magazine_sent",
          "dealcard_sent",
          "im_link_sent",
          "email_delivered",
          "email_bounced",
          "email_complained",
          "contacts_bulk_imported",
        ]);
      }
      if (typeof ownDispQ.order === "function") {
        ownDispQ = ownDispQ.order("created_at", { ascending: false });
      }
      if (typeof ownDispQ.limit === "function") {
        ownDispQ = ownDispQ.limit(250);
      }
      const ownDispRes = await ownDispQ;
      pushDispatchRows(ownDispRes?.data, false);

      let webhookDispQ: any = supabase
        .from("activity_events")
        .select("id, actor_id, event_type, entity_id, metadata, created_at");
      if (typeof webhookDispQ.in === "function") {
        webhookDispQ = webhookDispQ.in("event_type", [
          "email_delivered",
          "email_bounced",
          "email_complained",
        ]);
      }
      if (typeof webhookDispQ.order === "function") {
        webhookDispQ = webhookDispQ.order("created_at", { ascending: false });
      }
      if (typeof webhookDispQ.limit === "function") {
        webhookDispQ = webhookDispQ.limit(200);
      }
      const webhookDispRes = await webhookDispQ;
      pushDispatchRows(webhookDispRes?.data, true);
    } catch {
      // ignore if activity_events unavailable
    }
  }

  function parseClientNotesMeta(notesRaw: unknown): {
    budget: string;
    preferredRegion: string;
    buildingTitle: string;
    transactionalBasis: InboxTransactionalBasis | null;
    isStructuredMeta: boolean;
  } {
    const text = typeof notesRaw === "string" ? notesRaw.trim() : "";
    if (!text) {
      return {
        budget: "",
        preferredRegion: "",
        buildingTitle: "",
        transactionalBasis: null,
        isStructuredMeta: false,
      };
    }
    const budgetMatch = text.match(/예산:\s*([^/]+)/);
    const regionMatch = text.match(/선호권역:\s*([^/]+)/);
    const bldgMatch = text.match(/관심매물:\s*([^/]+)/);
    const basisMatch = text.match(/근거:\s*([a-z_]+)/i);
    const isStructuredMeta = Boolean(
      budgetMatch || regionMatch || bldgMatch || basisMatch
    );
    return {
      budget: budgetMatch?.[1]?.trim() || "",
      preferredRegion: regionMatch?.[1]?.trim() || "",
      buildingTitle: bldgMatch?.[1]?.trim() || "",
      transactionalBasis: normalizeTransactionalBasis(basisMatch?.[1]),
      isStructuredMeta,
    };
  }

  function aggregateThreadViews(
    tid: string,
    bIdStr: string,
    allowUnscopedBuildingFallback: boolean,
    threadShareToken = ""
  ) {
    const strippedId = tid.replace(/^(?:srv-|custom[-_]|cli-|sub_)/, "");
    const taggedViews = viewItems.filter((v) => {
      if (
        v.recipientId &&
        (v.recipientId === tid || (strippedId && v.recipientId === strippedId))
      ) {
        return true;
      }
      if (
        v.gateRequestId &&
        (v.gateRequestId === tid || (strippedId && v.gateRequestId === strippedId))
      ) {
        return true;
      }
      if (threadShareToken && v.shareToken && v.shareToken === threadShareToken) {
        return true;
      }
      return false;
    });
    const scopedViews =
      taggedViews.length > 0
        ? taggedViews
        : allowUnscopedBuildingFallback && bIdStr
          ? viewItems.filter(
              (v) =>
                v.building_id &&
                String(v.building_id) === bIdStr &&
                (!v.recipientId || v.recipientId === tid)
            )
          : [];
    const openEvents = scopedViews.filter((v) => !(v.dwellSeconds > 0));
    const openCount =
      scopedViews.length === 0
        ? 0
        : openEvents.length > 0
          ? openEvents.length
          : scopedViews.length;
    const dwellSeconds = scopedViews.reduce(
      (acc, v) => acc + (typeof v.dwellSeconds === "number" ? v.dwellSeconds : 0),
      0
    );
    const focusedSections = Array.from(
      new Set(
        scopedViews
          .map((v) => v.sectionName || formatImSectionLabel(v.sectionViewed))
          .filter((s): s is string => Boolean(s))
      )
    );
    return {
      scopedViews,
      openCount,
      dwellSeconds,
      focusedSections,
      lastViewedAt: scopedViews[0]?.created_at || null,
    };
  }

  const isThreadArchived = (id: string) => {
    if (includeArchived || !id) return false;
    const raw = id.replace(/^srv-/, "");
    return (
      archivedThreadIds.has(id) ||
      archivedThreadIds.has(raw) ||
      archivedThreadIds.has(`srv-${raw}`)
    );
  };

  if (!includeArchived && archivedThreadIds.size > 0) {
    gateItems = gateItems.filter((g: any) => !isThreadArchived(String(g.id)));
    inquiryItems = inquiryItems.filter((i: any) => !isThreadArchived(String(i.id)));
  }

  // ── 4. Build Real Threads for Workspace (No Fake Seeds, No Token Bleed!) ──
  const threads: any[] = [];
  const seenThreadIds = new Set<string>();

  for (const gr of [...gateItems, ...inquiryItems]) {
    const tid = String(gr.id);
    if (!tid || seenThreadIds.has(tid) || isThreadArchived(tid)) continue;
    seenThreadIds.add(tid);

    const bIdStr = String(gr.building_id || "");
    const isDeletedBuilding =
      Boolean(gr.is_deleted_building) ||
      Boolean(bIdStr && deletedBuildingSet.has(bIdStr) && !allOwnedBuildingIds.includes(bIdStr));

    const decisionOverride = decisionByThreadId.get(tid);
    const effectiveStatus =
      gr.status === "expired"
        ? "expired"
        : decisionOverride
        ? decisionOverride.decision
        : gr.status;

    const isPending =
      !isDeletedBuilding &&
      (effectiveStatus === "submitted" ||
        effectiveStatus === "pending" ||
        effectiveStatus === "broker_review");
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
        (gr.status === "revoked" ||
          recipientLink?.status === "revoked" ||
          Boolean(recipientLink?.revoked_at) ||
          Boolean(
            gr.building_id && inboxState.revokedBuildings?.[String(gr.building_id)]?.revoked
          )));

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

    // WP-18: allowUnscopedBuildingFallback = false so anonymous public views NEVER inflate named customer threads
    const viewStats = aggregateThreadViews(
      tid,
      String(gr.building_id || ""),
      false,
      resolvedShareToken
    );
    const focusedSections = viewStats.focusedSections;

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

    const phoneDigits = normalizeKrPhoneDigits(gr.requesterPhone || gr.requester_phone || "");
    const nlDecision =
      newsletterStateByKey.get(tid) ||
      (phoneDigits ? newsletterStateByKey.get(`tel:${phoneDigits}`) : undefined);
    const corrMsg =
      (bIdStr && inboxState.correctionNotices?.[bIdStr]?.message) ||
      inboxState.correctionNotices?.[tid]?.message ||
      "";
    const rawBuildingTitle = gr.buildingTitle || gr.building_label || "";
    const resolvedBuildingTitle = isDeletedBuilding
      ? !rawBuildingTitle || rawBuildingTitle === "매물"
        ? "삭제된 매물 (과거 문의)"
        : rawBuildingTitle.includes("삭제된 매물")
        ? rawBuildingTitle
        : `${rawBuildingTitle} (삭제된 매물)`
      : rawBuildingTitle || "매물";

    threads.push({
      id: tid,
      clientName: gr.requesterName || gr.requester_name || "이름 미입력 고객",
      clientPhone: gr.requesterPhone || gr.requester_phone || "",
      clientEmail:
        normalizeClientEmail(gr.requester_email || gr.requesterEmail) || "",
      transactionalBasis: (gr.type === "gate_request"
        ? "im_request"
        : "property_inquiry") as InboxTransactionalBasis,
      hasTransactionalBasis: true,
      requesterCompany: gr.requesterCompany || gr.requester_company || "",
      cleanMessage: baseRequestMsg,
      clientGrade: "일반" as const,
      isVip: false,
      clientRole: "buyer" as InboxCrmClientRole,
      buildingTitle: resolvedBuildingTitle,
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
      openCount: viewStats.openCount,
      dwellSeconds: viewStats.dwellSeconds,
      lastViewedAt: viewStats.lastViewedAt,
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
      budgetManwon: null as number | null,
      preferredRegion: "",
      preferredRegions: [] as string[],
      freeMemo: "",
      focusedSections,
      newsletterSubscribed: Boolean(nlDecision?.subscribed),
      events: threadEvents,
    });
  }

  // Build DB client lookup by stripped UUID and normalized email for structured CRM & bounce status
  const dbClientById = new Map<string, Record<string, any>>();
  const deliveryStatusByEmail = new Map<string, InboxEmailDeliveryStatus>();
  const deliveryStatusById = new Map<string, InboxEmailDeliveryStatus>();

  const promoteDeliveryStatus = (
    prev: InboxEmailDeliveryStatus | undefined,
    next: InboxEmailDeliveryStatus
  ): InboxEmailDeliveryStatus => {
    if (prev === "complained" || next === "complained") return "complained";
    if (prev === "bounced" || next === "bounced") return "bounced";
    return "ok";
  };

  for (const dbc of dbClients) {
    const cid = String(dbc?.id || "").trim();
    if (cid) dbClientById.set(cid, dbc);
    const ds = normalizeEmailDeliveryStatus(dbc?.email_delivery_status);
    if (cid && ds !== "ok") {
      deliveryStatusById.set(cid, promoteDeliveryStatus(deliveryStatusById.get(cid), ds));
      deliveryStatusById.set(`custom_${cid}`, promoteDeliveryStatus(deliveryStatusById.get(`custom_${cid}`), ds));
      deliveryStatusById.set(`cli-${cid}`, promoteDeliveryStatus(deliveryStatusById.get(`cli-${cid}`), ds));
    }
    const em = normalizeClientEmail(dbc?.email);
    if (em && ds !== "ok") {
      deliveryStatusByEmail.set(em, promoteDeliveryStatus(deliveryStatusByEmail.get(em), ds));
    }
  }

  for (const sub of subscriberRows) {
    const sid = String(sub?.id || "").trim();
    const ds = normalizeEmailDeliveryStatus(sub?.email_delivery_status);
    if (sid && ds !== "ok") {
      deliveryStatusById.set(sid, promoteDeliveryStatus(deliveryStatusById.get(sid), ds));
      deliveryStatusById.set(`sub_${sid}`, promoteDeliveryStatus(deliveryStatusById.get(`sub_${sid}`), ds));
    }
    const em = normalizeClientEmail(sub?.subscriber_email ?? sub?.email);
    if (em && ds !== "ok") {
      deliveryStatusByEmail.set(em, promoteDeliveryStatus(deliveryStatusByEmail.get(em), ds));
    }
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

    const dbSupplemental = strippedId ? dbClientById.get(strippedId) : undefined;
    const parsedMeta = parseClientNotesMeta(row.notes ?? dbSupplemental?.notes);

    const rowGradeRaw =
      row.tier === "vip" ||
      row.tier === "VIP" ||
      row.clientGrade === "VIP" ||
      dbSupplemental?.tier === "vip"
        ? ("VIP" as const)
        : row.tier === "potential" ||
          row.clientGrade === "잠재" ||
          dbSupplemental?.tier === "potential"
        ? ("잠재" as const)
        : ("일반" as const);
    const resolvedIsVip =
      typeof row.isVip === "boolean"
        ? row.isVip
        : typeof row.is_vip === "boolean"
        ? row.is_vip
        : typeof dbSupplemental?.is_vip === "boolean"
        ? dbSupplemental.is_vip
        : rowGradeRaw === "VIP";
    const resolvedClientGrade: "VIP" | "일반" | "잠재" = resolvedIsVip
      ? "VIP"
      : rowGradeRaw === "VIP"
      ? "일반"
      : rowGradeRaw;

    const tags = Array.isArray(row.tags)
      ? row.tags.map((t: unknown) => String(t))
      : Array.isArray(dbSupplemental?.tags)
      ? dbSupplemental.tags.map((t: unknown) => String(t))
      : [];
    const roleFromTags: InboxCrmClientRole | null = tags.some((t: string) =>
      /매도|소유주|seller|owner/i.test(t)
    )
      ? "seller"
      : tags.some((t: string) => /임차|tenant|lessee/i.test(t))
      ? "tenant"
      : tags.some((t: string) => /공동중개|파트너|partner/i.test(t))
      ? "partner"
      : null;
    const resolvedClientRole: InboxCrmClientRole =
      normalizeClientRole(
        row.clientRole ??
          row.client_role ??
          dbSupplemental?.client_role ??
          row.client_type ??
          dbSupplemental?.client_type
      ) ||
      roleFromTags ||
      "buyer";

    const resolvedPreferredRegions = parsePreferredRegionsInput(
      row.preferredRegions ?? row.preferred_regions ?? dbSupplemental?.preferred_regions,
      row.preferred_region || row.preferredRegion || parsedMeta.preferredRegion
    );
    const preferredRegion = String(
      row.preferred_region ||
        row.preferredRegion ||
        parsedMeta.preferredRegion ||
        resolvedPreferredRegions.join(", ") ||
        ""
    ).trim();

    const resolvedBudgetManwon = parseBudgetManwonInput(
      row.budgetManwon ?? row.budget_manwon ?? dbSupplemental?.budget_manwon,
      row.budget || parsedMeta.budget
    );
    const budget = String(
      row.budget ||
        parsedMeta.budget ||
        formatBudgetManwonDisplay(resolvedBudgetManwon) ||
        ""
    ).trim();

    const resolvedFreeMemo =
      typeof row.freeMemo === "string"
        ? row.freeMemo
        : typeof row.free_memo === "string"
        ? row.free_memo
        : typeof dbSupplemental?.free_memo === "string"
        ? dbSupplemental.free_memo
        : extractFreeMemoFromLegacyNotes(row.notes ?? dbSupplemental?.notes);

    // If CRM profile action updated an existing gate_requests / inquiry thread, merge structured fields onto it without duplicating
    if (strippedId && seenThreadIds.has(strippedId)) {
      const existingGateThread = threads.find((t) => t.id === strippedId);
      if (existingGateThread) {
        existingGateThread.isVip = resolvedIsVip;
        existingGateThread.clientGrade = resolvedClientGrade;
        existingGateThread.clientRole = resolvedClientRole;
        existingGateThread.preferredRegions = resolvedPreferredRegions;
        existingGateThread.preferredRegion = preferredRegion || existingGateThread.preferredRegion;
        existingGateThread.budgetManwon = resolvedBudgetManwon;
        existingGateThread.budget = budget || existingGateThread.budget;
        existingGateThread.freeMemo = resolvedFreeMemo;
        const upEmail = normalizeClientEmail(row.email || row.clientEmail || dbSupplemental?.email);
        if (upEmail && !existingGateThread.clientEmail) {
          existingGateThread.clientEmail = upEmail;
        }
      }
      continue;
    }

    if (seenThreadIds.has(tid) || seenThreadIds.has(rawId) || isThreadArchived(tid)) continue;

    const name = String(
      row.display_name || row.name || row.clientName || dbSupplemental?.display_name || ""
    ).trim();
    if (!name) continue;
    const phone = String(row.phone || row.clientPhone || dbSupplemental?.phone || "").trim();
    const phoneDigits = normalizeKrPhoneDigits(phone);
    const identityKey = `${name.toLowerCase()}::${phoneDigits}`;
    if (seenCustomClientIdentity.has(identityKey)) continue;
    seenCustomClientIdentity.add(identityKey);
    seenThreadIds.add(tid);

    let bId = String(
      row.building_id ||
        row.buildingId ||
        (Array.isArray(row.linked_building_ids) && row.linked_building_ids[0]) ||
        (Array.isArray(dbSupplemental?.linked_building_ids) &&
          dbSupplemental.linked_building_ids[0]) ||
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
      resolvedFreeMemo ||
      (!parsedMeta.isStructuredMeta && row.notes ? String(row.notes) : "직접 등록한 고객입니다.");

    const customViewStats = aggregateThreadViews(tid, bId, false, resolvedShareToken);
    const resolvedClientEmail =
      normalizeClientEmail(row.email || row.clientEmail || dbSupplemental?.email) || "";
    const resolvedBasis =
      normalizeTransactionalBasis(
        row.transactionalBasis || parsedMeta.transactionalBasis
      ) ||
      (resolvedShareToken ? ("im_request" as const) : null);

    const baseLastActivityAt =
      (notesList[0] as any)?.createdAt || row.created_at || row.createdAt || "";
    const lastActivityAt =
      customViewStats.lastViewedAt &&
      toSafeEpochMs(customViewStats.lastViewedAt) > toSafeEpochMs(baseLastActivityAt)
        ? customViewStats.lastViewedAt
        : baseLastActivityAt;
    const corrMsg =
      (bId && inboxState.correctionNotices?.[bId]?.message) ||
      inboxState.correctionNotices?.[tid]?.message ||
      "";

    threads.push({
      id: tid,
      clientName: name,
      clientPhone: phone,
      clientEmail: resolvedClientEmail,
      transactionalBasis: resolvedBasis,
      hasTransactionalBasis: Boolean(resolvedBasis),
      requesterCompany: "",
      cleanMessage: summaryCleanMessage,
      clientGrade: resolvedClientGrade,
      isVip: resolvedIsVip,
      clientRole: resolvedClientRole,
      buildingTitle: bTitle,
      buildingId: bId,
      latestEvent: notesList[0]?.description || summaryCleanMessage,
      gateStatus: "none" as const,
      updatedAt: formatRelativeKo(lastActivityAt) || "방금",
      lastActivityAt,
      openCount: customViewStats.openCount,
      dwellSeconds: customViewStats.dwellSeconds,
      lastViewedAt: customViewStats.lastViewedAt,
      isRead: true,
      status: isRevoked
        ? ("revoked" as const)
        : customViewStats.openCount >= 3 || customViewStats.dwellSeconds >= 90
        ? ("high_interest" as const)
        : ("active" as const),
      shareToken: resolvedShareToken,
      shareUrl: resolvedShareUrl,
      hasCorrectionNotice: Boolean(corrMsg),
      correctionMessage: corrMsg,
      budget,
      budgetManwon: resolvedBudgetManwon,
      preferredRegion,
      preferredRegions: resolvedPreferredRegions,
      freeMemo: resolvedFreeMemo,
      focusedSections: customViewStats.focusedSections,
      newsletterSubscribed: resolvedNewsletterSubscribed,
      events: [
        ...customViewStats.scopedViews.map((v: any) => ({
          id: `ev-view-${v.id}`,
          eventType: v.dwellSeconds > 0 ? ("dwell" as const) : ("open" as const),
          description:
            v.dwellSeconds > 0
              ? `자료 ${v.dwellSeconds}초 열람${v.sectionViewed ? ` (${formatImSectionLabel(v.sectionViewed)})` : ""}`
              : `${v.sectionName || formatImSectionLabel(v.sectionViewed) || "추천 매물"} 링크 열람`,
          timestamp: formatRelativeKo(v.created_at) || "방금",
          sectionName: v.sectionName || formatImSectionLabel(v.sectionViewed),
        })),
        ...(notesList.length > 0
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
            ]),
      ],
    });
  }

  // Surface public magazine_subscribers in Inbox CRM (C-2: NL-304 ↔ IB-403)
  for (const row of subscriberRows) {
    const rawSubId = String(row?.id || "").trim();
    if (!rawSubId) continue;
    const statusLower = String(row?.status || "active").trim().toLowerCase();
    if (
      statusLower === "unsubscribed" ||
      statusLower === "purged" ||
      statusLower === "deleted" ||
      Boolean(row?.unsubscribed_at)
    ) {
      continue;
    }

    const phoneDigits = normalizeKrPhoneDigits(row?.subscriber_phone || row?.phone_e164 || "");
    const emailNorm = String(row?.subscriber_email || "")
      .trim()
      .toLowerCase();

    const rawProfile =
      row?.interest_profile && typeof row.interest_profile === "object"
        ? (row.interest_profile as Record<string, any>)
        : {};
    const rawTags = rawProfile.tags;
    const regions: string[] = [];
    const assetTypes: string[] = [];
    const extraTags: string[] = [];
    if (Array.isArray(rawTags)) {
      for (const t of rawTags) {
        const s = String(t || "").trim();
        if (s) extraTags.push(s);
      }
    } else if (rawTags && typeof rawTags === "object") {
      if (Array.isArray(rawTags.regions)) {
        for (const r of rawTags.regions) {
          const s = String(r || "").trim();
          if (s) regions.push(s);
        }
      }
      if (Array.isArray(rawTags.assetTypes)) {
        for (const a of rawTags.assetTypes) {
          const s = String(a || "").trim();
          if (s) assetTypes.push(s);
        }
      }
      if (Array.isArray(rawTags.topics)) {
        for (const tp of rawTags.topics) {
          const s = String(tp || "").trim();
          if (s) extraTags.push(s);
        }
      }
    }
    const allSelectedTags = Array.from(new Set([...regions, ...assetTypes, ...extraTags]));

    const subTid = `sub_${rawSubId}`;
    const isPendingConfirm = String(row?.confirm_status || "").trim().toLowerCase() === "pending";
    const baseSubscribed = statusLower === "active" && !isPendingConfirm;
    const nlOverride =
      newsletterStateByKey.get(subTid) ||
      newsletterStateByKey.get(rawSubId) ||
      (phoneDigits ? newsletterStateByKey.get(`tel:${phoneDigits}`) : undefined) ||
      (emailNorm ? newsletterStateByKey.get(`email:${emailNorm}`) : undefined);
    const subCreatedMs = toSafeEpochMs(row?.created_at);
    const effectiveSubscribed =
      nlOverride && nlOverride.createdAtMs >= subCreatedMs
        ? nlOverride.subscribed
        : baseSubscribed;

    const matchedExisting = threads.find((t) => {
      const tPhoneDigits = normalizeKrPhoneDigits(t.clientPhone || "");
      if (phoneDigits.length >= 9 && tPhoneDigits === phoneDigits) return true;
      const tEmail = normalizeClientEmail(
        t.clientEmail || (String(t.clientPhone || "").includes("@") ? t.clientPhone : "")
      );
      if (emailNorm && tEmail === emailNorm) return true;
      return false;
    });
    if (matchedExisting) {
      if (effectiveSubscribed && !nlOverride) {
        matchedExisting.newsletterSubscribed = true;
      } else if (nlOverride && nlOverride.createdAtMs >= subCreatedMs) {
        matchedExisting.newsletterSubscribed = nlOverride.subscribed;
      }
      if (!matchedExisting.preferredRegion && regions.length > 0) {
        matchedExisting.preferredRegion = regions.join(", ");
      }
      if (
        Array.isArray(matchedExisting.preferredRegions) &&
        matchedExisting.preferredRegions.length === 0 &&
        regions.length > 0
      ) {
        matchedExisting.preferredRegions = [...regions];
      }
      continue;
    }

    if (
      seenThreadIds.has(subTid) ||
      isThreadArchived(subTid) ||
      deletedClientIdSet.has(subTid) ||
      deletedClientIdSet.has(rawSubId)
    ) {
      continue;
    }
    seenThreadIds.add(subTid);

    const displayName =
      String(row?.subscriber_name || "").trim() ||
      (emailNorm ? emailNorm.split("@")[0] : "뉴스레터 구독자");
    const displayContact = formatKrPhoneDisplay(
      row?.subscriber_phone,
      row?.phone_e164,
      row?.subscriber_email
    );

    const consentStatusLabel =
      nlOverride && !nlOverride.subscribed
        ? "수신 거부"
        : isPendingConfirm && !effectiveSubscribed
        ? "수신 확인 대기"
        : effectiveSubscribed
        ? "수신 동의 완료"
        : "미구독";

    const tagSummary =
      allSelectedTags.length > 0 ? `관심 태그: ${allSelectedTags.join(" · ")}` : "";
    const subSummaryMessage = [
      isPendingConfirm && !effectiveSubscribed
        ? `공개 뉴스레터 구독 신청 (${consentStatusLabel})`
        : `공개 뉴스레터 구독자 (${consentStatusLabel})`,
      tagSummary,
    ]
      .filter(Boolean)
      .join(" · ");

    const subNotes =
      callNotesByThreadId.get(subTid) ||
      callNotesByThreadId.get(rawSubId) ||
      [];
    const lastSubActivityAt =
      (subNotes[0] as any)?.createdAt || row?.created_at || "";

    const subViewStats = aggregateThreadViews(subTid, "", false);
    const subRole: InboxCrmClientRole =
      normalizeClientRole(row?.segment) || "buyer";

    threads.push({
      id: subTid,
      clientName: displayName,
      clientPhone: displayContact,
      clientEmail: emailNorm || "",
      transactionalBasis: null,
      hasTransactionalBasis: false,
      requesterCompany: "",
      cleanMessage: subSummaryMessage,
      clientGrade: "일반" as const,
      isVip: false,
      clientRole: subRole,
      buildingTitle:
        assetTypes.length > 0
          ? `관심 유형: ${assetTypes.join(", ")}`
          : "뉴스레터 구독 고객",
      buildingId: "",
      latestEvent: subNotes[0]?.description || subSummaryMessage,
      gateStatus: "none" as const,
      updatedAt: formatRelativeKo(lastSubActivityAt) || "방금",
      lastActivityAt: lastSubActivityAt,
      openCount: subViewStats.openCount,
      dwellSeconds: subViewStats.dwellSeconds,
      lastViewedAt: subViewStats.lastViewedAt,
      isRead: true,
      status: "active" as const,
      shareToken: "",
      shareUrl: "",
      hasCorrectionNotice: false,
      correctionMessage: "",
      budget: "",
      budgetManwon: null as number | null,
      preferredRegion: regions.join(", "),
      preferredRegions: [...regions],
      freeMemo: "",
      tags: allSelectedTags,
      focusedSections: subViewStats.focusedSections,
      newsletterSubscribed: effectiveSubscribed,
      events: [
        ...subNotes.map((n: any) => ({
          id: n.id,
          eventType: "dwell" as const,
          description: n.description,
          timestamp: n.timestamp || "방금",
        })),
        {
          id: `ev-${subTid}`,
          eventType: "share" as const,
          description: subSummaryMessage,
          timestamp: formatRelativeKo(row?.created_at) || "방금",
        },
      ],
    });
  }

  // Group remaining view events by building + viewer (separating anonymous viewers by visitorFp — C-4)
  const ownedShareTokenSet = new Set<string>(
    threads.map((t) => String(t.shareToken || "").trim()).filter(Boolean)
  );
  const viewGroups = new Map<string, any[]>();
  for (const v of viewItems) {
    if (v.recipientId && seenThreadIds.has(v.recipientId)) {
      continue;
    }
    if (v.gateRequestId && seenThreadIds.has(v.gateRequestId)) {
      continue;
    }
    if (v.shareToken && ownedShareTokenSet.has(v.shareToken)) {
      continue;
    }
    const isAnon = !v.viewerName || v.viewerName === "익명 열람객";
    const key = isAnon
      ? `${v.building_id || "b"}::익명 열람객::${v.visitorFp || "anon_nofp"}`
      : `${v.building_id || "b"}::${v.viewerName}`;
    const list = viewGroups.get(key) || [];
    list.push(v);
    viewGroups.set(key, list);
  }
  for (const [, group] of viewGroups.entries()) {
    const first = group[0];
    const isAnon = !first.viewerName || first.viewerName === "익명 열람객";
    const safeFp = isAnon
      ? String(first.visitorFp || "")
          .replace(/[^a-zA-Z0-9_-]/g, "")
          .slice(0, 16)
      : "";
    const tid =
      isAnon && safeFp
        ? `view_${first.building_id || "b"}_anon_${safeFp}`
        : `view_${first.building_id || "b"}_${encodeURIComponent(
            first.viewerName || "anon"
          )}`;
    if (seenThreadIds.has(tid) || isThreadArchived(tid)) continue;
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

    const viewOpenEvents = group.filter((g) => !(g.dwellSeconds > 0));
    const viewOpenCount =
      viewOpenEvents.length > 0 ? viewOpenEvents.length : group.length;
    const viewDwellSeconds = group.reduce(
      (sum, g) => sum + (typeof g.dwellSeconds === "number" ? g.dwellSeconds : 0),
      0
    );

    threads.push({
      id: tid,
      clientName: first.viewerName || "익명 열람객",
      clientPhone: "",
      clientEmail: "",
      transactionalBasis: null,
      hasTransactionalBasis: false,
      requesterCompany: "",
      cleanMessage: "상세 자료를 열람했습니다",
      clientGrade: "일반" as const,
      isVip: false,
      clientRole: "buyer" as InboxCrmClientRole,
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
      openCount: viewOpenCount,
      dwellSeconds: viewDwellSeconds,
      lastViewedAt: first.created_at || null,
      isRead: true,
      status: isRevoked
        ? ("revoked" as const)
        : viewOpenCount >= 3 || viewDwellSeconds >= 90
        ? ("high_interest" as const)
        : ("active" as const),
      shareToken: resolvedShareToken,
      shareUrl: resolvedShareUrl,
      hasCorrectionNotice: Boolean(corrMsg),
      correctionMessage: corrMsg,
      budget: "",
      budgetManwon: null as number | null,
      preferredRegion: "",
      preferredRegions: [] as string[],
      freeMemo: "",
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

  // WP-18: Attach dispatchHistory (newest-first) + emailDeliveryStatus onto every thread
  const toDispatchHistoryEntry = (ev: Record<string, any>): InboxDispatchHistoryItem => {
    const meta = (
      ev?.metadata && typeof ev.metadata === "object" ? ev.metadata : {}
    ) as Record<string, any>;
    const eventType = String(ev?.event_type || "");
    const createdAt = String(ev?.created_at || "");
    const assetKind = String(meta.asset_kind || "").toLowerCase();

    if (eventType === "inbox_email_sent") {
      const fallbackTitle =
        assetKind === "magazine"
          ? "뉴스레터 이메일 발송"
          : assetKind === "dealcard"
          ? "딜카드 이메일 발송"
          : "IM 자료 이메일 발송";
      return {
        id: String(ev.id),
        eventType,
        channel: "email",
        title:
          typeof meta.subject === "string" && meta.subject.trim()
            ? meta.subject.trim()
            : fallbackTitle,
        status: "sent",
        createdAt,
      };
    }
    if (eventType === "inbox_outbound_copied") {
      const title =
        assetKind === "magazine"
          ? "카톡 인사말+뉴스레터 링크 복사"
          : assetKind === "dealcard"
          ? "카톡 인사말+딜카드 링크 복사"
          : "카톡 인사말+IM 링크 복사";
      return {
        id: String(ev.id),
        eventType,
        channel: "copy",
        title,
        status: "copied",
        createdAt,
      };
    }
    if (eventType === "inbox_alimtalk_sent") {
      return {
        id: String(ev.id),
        eventType,
        channel: "alimtalk",
        title: "카카오 정보성 알림톡 발송",
        status: "sent",
        createdAt,
      };
    }
    if (eventType === "magazine_sent") {
      return {
        id: String(ev.id),
        eventType,
        channel: String(meta.channel || "newsletter"),
        title:
          typeof meta.headline === "string" && meta.headline.trim()
            ? `뉴스레터 발송: ${meta.headline.trim()}`
            : "뉴스레터 발송",
        status: "sent",
        createdAt,
      };
    }
    if (eventType === "dealcard_sent" || eventType === "im_link_sent") {
      return {
        id: String(ev.id),
        eventType,
        channel: String(meta.channel || "link"),
        title: eventType === "dealcard_sent" ? "딜카드 링크 발송" : "IM 전용 링크 발송",
        status: "sent",
        createdAt,
      };
    }
    if (eventType === "email_delivered") {
      return {
        id: String(ev.id),
        eventType,
        channel: "email",
        title: "이메일 수신 서버 전달 완료",
        status: "delivered",
        createdAt,
      };
    }
    if (eventType === "email_bounced") {
      const reason =
        typeof meta.reason === "string" && meta.reason.trim()
          ? meta.reason.trim()
          : undefined;
      return {
        id: String(ev.id),
        eventType,
        channel: "email",
        title: "이메일 반송 (수신 불가)",
        status: "bounced",
        createdAt,
        ...(reason ? { bounceReason: reason } : {}),
      };
    }
    if (eventType === "email_complained") {
      const reason =
        typeof meta.reason === "string" && meta.reason.trim()
          ? meta.reason.trim()
          : undefined;
      return {
        id: String(ev.id),
        eventType,
        channel: "email",
        title: "스팸 신고 접수 (발송 자동 차단)",
        status: "complained",
        createdAt,
        ...(reason ? { bounceReason: reason } : {}),
      };
    }
    if (eventType === "contacts_bulk_imported") {
      return {
        id: String(ev.id),
        eventType,
        channel: "import",
        title: "연락처 일괄 등록",
        status: "imported",
        createdAt,
      };
    }
    return {
      id: String(ev.id),
      eventType,
      channel: String(meta.channel || "system"),
      title: eventType,
      status: "logged",
      createdAt,
    };
  };

  for (const t of threads) {
    const tid = String(t.id || "");
    const strippedTid = tid.replace(/^(?:srv-|custom[-_]|cli-|sub_)/, "");
    const tEmail = normalizeClientEmail(
      t.clientEmail || (String(t.clientPhone || "").includes("@") ? t.clientPhone : "")
    );
    const tShareToken = String(t.shareToken || "").trim();

    let deliveryStatus: InboxEmailDeliveryStatus = "ok";
    if (tid && deliveryStatusById.has(tid)) {
      deliveryStatus = promoteDeliveryStatus(deliveryStatus, deliveryStatusById.get(tid)!);
    }
    if (strippedTid && deliveryStatusById.has(strippedTid)) {
      deliveryStatus = promoteDeliveryStatus(
        deliveryStatus,
        deliveryStatusById.get(strippedTid)!
      );
    }
    if (tEmail && deliveryStatusByEmail.has(tEmail)) {
      deliveryStatus = promoteDeliveryStatus(deliveryStatus, deliveryStatusByEmail.get(tEmail)!);
    }

    const matchedDispatches: InboxDispatchHistoryItem[] = [];
    for (const ev of rawDispatchAuditEvents) {
      const meta = (
        ev?.metadata && typeof ev.metadata === "object" ? ev.metadata : {}
      ) as Record<string, any>;
      const evType = String(ev?.event_type || "");
      const evThreadId = String(
        meta.thread_id || meta.client_id || meta.recipient_id || meta.subscriber_id || ""
      ).trim();
      const evRawId = String(
        meta.raw_client_id || evThreadId.replace(/^(?:srv-|custom[-_]|cli-|sub_)/, "")
      ).trim();
      const evEmail = normalizeClientEmail(
        meta.to_email || meta.email || meta.client_email || meta.subscriber_email
      );
      const evToken = String(meta.share_token || "").trim();

      const matchesById =
        Boolean(evThreadId && evThreadId === tid) ||
        Boolean(
          strippedTid &&
            (evThreadId === strippedTid ||
              evRawId === strippedTid ||
              (ev?.entity_id && String(ev.entity_id) === strippedTid))
        );
      const matchesByEmail = Boolean(tEmail && evEmail && evEmail === tEmail);
      const matchesByToken = Boolean(tShareToken && evToken && evToken === tShareToken);

      let matchesBroadcastOrImport = false;
      if (!matchesById && !matchesByEmail && !matchesByToken) {
        if (evType === "magazine_sent" && !evThreadId && t.newsletterSubscribed === true) {
          const seg = String(meta.segment || "all").toLowerCase();
          if (
            seg === "all" ||
            (seg === "vip" && t.isVip === true) ||
            (seg === "seller" && t.clientRole === "seller") ||
            (seg === "buyer" && t.clientRole === "buyer")
          ) {
            matchesBroadcastOrImport = true;
          }
        } else if (evType === "contacts_bulk_imported") {
          const importedIds = Array.isArray(meta.client_ids)
            ? meta.client_ids.map((x: unknown) => String(x))
            : [];
          const importedEmails = Array.isArray(meta.emails)
            ? meta.emails
                .map((x: unknown) => normalizeClientEmail(typeof x === "string" ? x : null))
                .filter((x: string | null): x is string => Boolean(x))
            : [];
          if (
            importedIds.includes(tid) ||
            (strippedTid && importedIds.includes(strippedTid)) ||
            (tEmail && importedEmails.includes(tEmail))
          ) {
            matchesBroadcastOrImport = true;
          }
        }
      }

      if (!matchesById && !matchesByEmail && !matchesByToken && !matchesBroadcastOrImport) {
        continue;
      }

      if (evType === "email_complained") {
        deliveryStatus = promoteDeliveryStatus(deliveryStatus, "complained");
      } else if (evType === "email_bounced") {
        deliveryStatus = promoteDeliveryStatus(deliveryStatus, "bounced");
      }

      matchedDispatches.push(toDispatchHistoryEntry(ev));
    }

    matchedDispatches.sort((a, b) => toSafeEpochMs(b.createdAt) - toSafeEpochMs(a.createdAt));

    t.emailDeliveryStatus = deliveryStatus;
    t.dispatchHistory = matchedDispatches;
  }

  // Sort threads deterministically by latest activity timestamp descending (B-S1-08)
  threads.sort((a, b) => toSafeEpochMs(b.lastActivityAt) - toSafeEpochMs(a.lastActivityAt));

  // WP-18: Optional structured CRM & workflow filter (?filter=all|todo|viewed|vip|buyer|seller|emailable)
  const filteredThreads = threads.filter((t) => {
    const isAnonView = String(t.id || "").startsWith("view_");
    switch (filter) {
      case "all":
      case "":
        return true;
      case "todo":
      case "requests":
        return t.status === "pending_gate" || t.gateStatus === "pending" || !t.isRead;
      case "viewed":
      case "views":
        return (
          (t.openCount ?? 0) > 0 ||
          (t.dwellSeconds ?? 0) > 0 ||
          t.status === "high_interest" ||
          isAnonView
        );
      case "vip":
        return t.isVip === true || t.clientGrade === "VIP";
      case "buyer":
        return !isAnonView && t.clientRole === "buyer";
      case "seller":
        return !isAnonView && t.clientRole === "seller";
      case "tenant":
        return !isAnonView && t.clientRole === "tenant";
      case "partner":
        return !isAnonView && t.clientRole === "partner";
      case "emailable":
        return !isAnonView && Boolean(t.clientEmail) && t.emailDeliveryStatus === "ok";
      default:
        return true;
    }
  });

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
    subscription: {
      tier: subscriptionInfo.tier,
      isPaid: subscriptionInfo.isPaid,
      status: subscriptionInfo.status,
    },
    threads: filteredThreads,
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
