import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listAllQuickImRecords,
  isDealCardDeleted,
  getInboxState,
  isUuid,
} from "@/lib/im-lite/quick-generate-store";
import { allowDealPublicMemoryFallback } from "@/lib/im-lite/im-public-guard";
import {
  listWorkspaceItemsForOwner,
  type WorkspaceItemRecord,
} from "@/lib/workspace/workspace-repository";
import { buildOwnedEventOrClause } from "@/lib/inbox/inbox-pending-count";
import { computeBrokerStatutoryCompleteness } from "@/lib/legal/broker-statutory-disclosure";

export interface BrokerHomeStatutoryStatus {
  isComplete: boolean;
  filledCount: number;
  totalCount: number;
  missingLabels: string[];
  initialValues: {
    displayName: string;
    company: string;
    representativeName: string;
    officeRegNumber: string;
    officeAddress: string;
    phone: string;
  };
}

export interface BrokerHomeResumeItem {
  id: string;
  title: string;
  timeAgo: string;
  href: string;
  statusText?: string;
}

export interface BrokerDoorBadge {
  count: number;
  label: string;
  href: string;
  highlight?: boolean;
}

export interface BrokerDoorConfig {
  id: "dealcards" | "im" | "magazine" | "inbox";
  title: string;
  subtitle: string;
  href: string;
  icon: string;
  badge: BrokerDoorBadge;
  shortcutNumber: number;
}

export interface AggregatedBrokerHomeData {
  profile: {
    displayName: string;
    photoUrl: string | null;
    role: string;
  };
  statutory?: BrokerHomeStatutoryStatus;
  resumeItem: BrokerHomeResumeItem | null;
  doors: {
    dealcards: BrokerDoorConfig;
    im: BrokerDoorConfig;
    magazine: BrokerDoorConfig;
    inbox: BrokerDoorConfig;
  };
}

interface ActivityEventRow {
  id?: string;
  entity_type?: string | null;
  event_type?: string | null;
  entity_id?: string | null;
  actor_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

interface DbBuildingRow {
  id?: string | null;
  owner_id?: string | null;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  fit_summary?: string | null;
  status?: string | null;
  updated_at?: string | null;
  layers?: Record<string, unknown> | null;
}

interface MergedBuildingRow {
  id: string;
  address?: string;
  name: string;
  area_signal: string;
  created_at?: string | null;
  updated_at?: string | null;
  status: string;
  kind?: "dealcard" | "im";
}

type LooseQuery = {
  then?: unknown;
  limit?: (n: number) => unknown;
  data?: unknown;
  error?: unknown;
};

async function safeResolveList<T = Record<string, unknown>>(
  rawQuery: unknown,
  limitHint = 200,
): Promise<{ data: T[]; error: unknown }> {
  if (!rawQuery || typeof rawQuery !== "object") {
    return { data: [], error: null };
  }
  let q = rawQuery as LooseQuery;
  if (typeof q.then !== "function" && typeof q.limit === "function") {
    try {
      q = q.limit(limitHint) as LooseQuery;
    } catch {
      return { data: [], error: null };
    }
  }
  if (q && typeof q.then === "function") {
    try {
      const res = (await (q as unknown as Promise<{ data?: T[] | null; error?: unknown }>)) ?? {};
      return {
        data: Array.isArray(res.data) ? res.data : [],
        error: res.error ?? null,
      };
    } catch (err) {
      return { data: [], error: err };
    }
  }
  if (Array.isArray(q.data)) {
    return { data: q.data as T[], error: q.error ?? null };
  }
  return { data: [], error: null };
}

/**
 * Formats a relative time string (Korean)
 */
function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "방금";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) return `${Math.floor(diffDay / 30)}달 전`;
  if (diffDay > 0) return diffDay === 1 ? "어제" : `${diffDay}일 전`;
  if (diffHour > 0) return `${diffHour}시간 전`;
  if (diffMin > 0) return `${diffMin}분 전`;
  return "방금";
}

/**
 * Computes pending inbox count matching `/api/broker/inbox/pending-count` (`WorkspaceShell`):
 * - `gate_requests` with status in `['submitted', 'broker_review']` on broker-owned buildings
 * - `im_inquiry_requests` with status in `['submitted', 'pending', 'broker_review', '']` for `broker_user_id`
 * - `activity_events` (`gate_request_created`, `intent.pro_im_request`) scoped to owned buildings / broker
 * Excludes approved/rejected/archived threads.
 */
export async function getInboxPendingCount(
  supabase: SupabaseClient,
  userId: string,
  preloaded?: {
    wsItems?: WorkspaceItemRecord[];
    dbBuildingsRaw?: DbBuildingRow[];
    activities?: ActivityEventRow[];
  },
): Promise<number> {
  if (!userId) return 0;

  const allowMem = allowDealPublicMemoryFallback();
  const gateDecisions: Record<string, { status?: string }> = allowMem
    ? (getInboxState().gateDecisions as Record<string, { status?: string }>) || {}
    : {};
  const decidedIds = new Set<string>(
    Object.entries(gateDecisions)
      .filter(([, v]) => v?.status === "approved" || v?.status === "rejected")
      .map(([k]) => k),
  );

  const verifiedOwnedUuids = new Set<string>();
  const forbiddenBuildings = new Set<string>();
  const deletedBuildings = new Set<string>();
  const ownedIds = new Set<string>();

  if (allowMem) {
    for (const rec of listAllQuickImRecords()) {
      const recOwnerId = (rec as { ownerId?: string | null }).ownerId;
      if (recOwnerId === userId && rec.buildingId && !isDealCardDeleted(rec.buildingId)) {
        ownedIds.add(String(rec.buildingId));
      }
    }
  }

  let wsItems = preloaded?.wsItems;
  if (!wsItems) {
    const wsRes = await listWorkspaceItemsForOwner(supabase, {
      ownerId: userId,
      limit: 200,
    }).catch(() => ({ items: [] as WorkspaceItemRecord[], tableAvailable: false }));
    wsItems = wsRes.items;
  }

  for (const wsItem of wsItems || []) {
    if (wsItem.ownerId !== userId) continue;
    const keys = [wsItem.buildingId, wsItem.legacyId, wsItem.id].filter(
      (x): x is string => Boolean(x),
    );
    if (wsItem.status === "archived" || wsItem.deletedAt) {
      keys.forEach((k) => {
        deletedBuildings.add(k);
        ownedIds.delete(k);
      });
    } else {
      verifiedOwnedUuids.add(wsItem.id);
      if (wsItem.buildingId) verifiedOwnedUuids.add(wsItem.buildingId);
      ownedIds.add(wsItem.buildingId || wsItem.legacyId || wsItem.id);
    }
  }

  let dbBuildingsRaw = preloaded?.dbBuildingsRaw;
  if (!dbBuildingsRaw) {
    const bldgRes = await safeResolveList<DbBuildingRow>(
      supabase.from("building_ssot_lite").select("id, status").eq("owner_id", userId),
    );
    dbBuildingsRaw = bldgRes.data;
  }

  for (const b of dbBuildingsRaw || []) {
    const idStr = b?.id ? String(b.id) : "";
    if (!idStr) continue;
    if (b.status === "archived" || (allowMem && isDealCardDeleted(idStr))) {
      deletedBuildings.add(idStr);
      ownedIds.delete(idStr);
    } else {
      verifiedOwnedUuids.add(idStr);
      ownedIds.add(idStr);
    }
  }

  let activities = preloaded?.activities;
  if (!activities && isUuid(userId)) {
    let actQ = supabase
      .from("activity_events")
      .select("event_type, entity_id, actor_id, metadata, created_at")
      .eq("actor_id", userId);
    if (typeof actQ?.order === "function") {
      actQ = actQ.order("created_at", { ascending: false });
    }
    const actRes = await safeResolveList<ActivityEventRow>(actQ, 200);
    activities = actRes.data;
  }

  const archivedThreadIds = new Set<string>();
  const seenDecisionKeys = new Set<string>();
  const seenArchiveKeys = new Set<string>();
  const seenBldg = new Set<string>();

  for (const ev of activities || []) {
    const meta =
      ev?.metadata && typeof ev.metadata === "object"
        ? (ev.metadata as Record<string, unknown>)
        : {};
    const decisionKeys = [meta.request_id, meta.thread_id].filter(Boolean).map(String);

    if (
      ev.event_type === "inbox_thread_archived" ||
      ev.event_type === "inbox_thread_unarchived"
    ) {
      for (const k of decisionKeys) {
        if (seenArchiveKeys.has(k)) continue;
        seenArchiveKeys.add(k);
        if (ev.event_type === "inbox_thread_archived") archivedThreadIds.add(k);
        else archivedThreadIds.delete(k);
      }
      continue;
    }

    if (
      ev.event_type === "gate_request_approved" ||
      ev.event_type === "gate_request_rejected" ||
      ev.event_type === "gate_request_reset"
    ) {
      for (const k of decisionKeys) {
        if (seenDecisionKeys.has(k)) continue;
        seenDecisionKeys.add(k);
        if (ev.event_type === "gate_request_reset") decidedIds.delete(k);
        else decidedIds.add(k);
      }
      continue;
    }

    if (
      ev.event_type === "im_upserted" ||
      ev.event_type === "im_restored" ||
      ev.event_type === "im_deleted" ||
      ev.event_type === "dealcard_upserted" ||
      ev.event_type === "dealcard_restored" ||
      ev.event_type === "dealcard_deleted" ||
      ev.event_type === "deal_deleted"
    ) {
      const imItem =
        meta.im_item && typeof meta.im_item === "object"
          ? (meta.im_item as Record<string, unknown>)
          : {};
      const bId = String(
        meta.building_id || imItem.buildingId || imItem.id || ev.entity_id || "",
      ).trim();
      if (!bId || bId === userId || seenBldg.has(bId)) continue;
      seenBldg.add(bId);
      if (
        ev.event_type === "im_deleted" ||
        ev.event_type === "dealcard_deleted" ||
        ev.event_type === "deal_deleted" ||
        (allowMem && isDealCardDeleted(bId))
      ) {
        deletedBuildings.add(bId);
        ownedIds.delete(bId);
      } else if (!deletedBuildings.has(bId)) {
        ownedIds.add(bId);
      }
    }
  }

  const unverifiedUuids = Array.from(ownedIds).filter(
    (id) => isUuid(id) && !verifiedOwnedUuids.has(id),
  );
  if (unverifiedUuids.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let checkQ: any = supabase
      .from("building_ssot_lite")
      .select("id, owner_id, status");
    if (typeof checkQ?.in === "function") {
      checkQ = checkQ.in("id", unverifiedUuids);
    }
    const checkRes = await safeResolveList<{
      id?: string;
      owner_id?: string | null;
      status?: string | null;
    }>(checkQ);
    for (const row of checkRes.data) {
      const rId = String(row?.id || "");
      if (
        rId &&
        ((row.owner_id && String(row.owner_id) !== userId) || row.status === "archived")
      ) {
        forbiddenBuildings.add(rId);
        ownedIds.delete(rId);
      }
    }
  }

  const isUndecided = (rawId: string) =>
    Boolean(rawId) &&
    !decidedIds.has(rawId) &&
    !decidedIds.has(`srv-${rawId}`) &&
    !decidedIds.has(`thread_${rawId}`) &&
    !archivedThreadIds.has(rawId) &&
    !archivedThreadIds.has(`srv-${rawId}`) &&
    !archivedThreadIds.has(`thread_${rawId}`);

  const buildingIds = Array.from(ownedIds);
  const uuidBuildingIds = buildingIds.filter((id) => isUuid(id));
  const scopedOrExpr =
    buildingIds.length > 0 ? buildOwnedEventOrClause(buildingIds, userId) : "";
  const pendingIdSet = new Set<string>();

  const [grRes, inqResInit, evRes] = await Promise.all([
    uuidBuildingIds.length > 0
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = supabase.from("gate_requests").select("id, building_id, status");
          if (typeof q?.in === "function") {
            q = q
              .in("status", ["submitted", "broker_review"])
              .in("building_id", uuidBuildingIds);
          }
          return safeResolveList<{ id?: string; building_id?: string; status?: string }>(q);
        })()
      : Promise.resolve({ data: [], error: null }),
    safeResolveList<{ id?: string; building_id?: string; status?: string }>(
      supabase
        .from("im_inquiry_requests")
        .select("id, building_id, status")
        .eq("broker_user_id", userId),
    ),
    scopedOrExpr
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = supabase
            .from("activity_events")
            .select("id, event_type, entity_id, metadata, created_at")
            .in("event_type", ["gate_request_created", "intent.pro_im_request"]);
          if (typeof q?.or === "function") q = q.or(scopedOrExpr);
          return safeResolveList<ActivityEventRow>(q, 100);
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const row of grRes.data) {
    const rId = String(row?.id || "");
    const bId = String(row?.building_id || "");
    if (
      rId &&
      uuidBuildingIds.includes(bId) &&
      (row.status === "submitted" || row.status === "broker_review") &&
      isUndecided(rId)
    ) {
      pendingIdSet.add(rId);
    }
  }

  let inqRows = inqResInit.data;
  if (inqResInit.error) {
    const fallbackInq = await safeResolveList<{ id?: string; building_id?: string; status?: string }>(
      supabase
        .from("im_inquiry_requests")
        .select("id, building_id")
        .eq("broker_user_id", userId),
    );
    inqRows = fallbackInq.data;
  }
  for (const row of inqRows) {
    const rId = String(row?.id || "");
    const bId = row?.building_id ? String(row.building_id) : "";
    if (bId && (forbiddenBuildings.has(bId) || deletedBuildings.has(bId))) continue;
    const st = typeof row?.status === "string" ? row.status.trim() : "";
    if (
      rId &&
      (!st || st === "submitted" || st === "pending" || st === "broker_review") &&
      isUndecided(rId)
    ) {
      pendingIdSet.add(rId);
    }
  }

  for (const ev of evRes.data) {
    const meta =
      ev?.metadata && typeof ev.metadata === "object"
        ? (ev.metadata as Record<string, unknown>)
        : {};
    if (meta.broker_id && String(meta.broker_id) !== userId) continue;
    const bId = String(meta.building_id || ev.entity_id || "").trim();
    if (!bId || forbiddenBuildings.has(bId) || deletedBuildings.has(bId)) continue;
    if (!((meta.broker_id && String(meta.broker_id) === userId) || ownedIds.has(bId))) {
      continue;
    }
    const gateId = String(meta.gate_request_id || ev.entity_id || `gr-act-${ev.id}`);
    const evType = String(ev.event_type || "gate_request_created");
    if (isUuid(bId) && (!meta.gate_request_id || isUuid(gateId))) continue;
    if (evType === "gate_request_created" && isUuid(bId) && isUuid(gateId)) continue;
    if (isUndecided(gateId)) pendingIdSet.add(gateId);
  }

  return pendingIdSet.size;
}

async function fetchBrokerStatutorySummaryRow(
  dbClient: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  try {
    const q1 = dbClient
      .from("broker_profiles")
      .select("office_reg_number, office_address, representative_name")
      .eq("user_id", userId);
    const r1 =
      q1 && typeof (q1 as unknown as { maybeSingle?: () => unknown }).maybeSingle === "function"
        ? await (q1 as unknown as { maybeSingle: () => Promise<{ data?: unknown; error?: { code?: string } | null }> }).maybeSingle()
        : await (q1 as unknown as Promise<{ data?: unknown; error?: { code?: string } | null }>);
    if (r1?.error && (r1.error.code === "42703" || r1.error.code === "PGRST204")) {
      const q2 = dbClient
        .from("broker_profiles")
        .select("office_reg_number")
        .eq("user_id", userId);
      const r2 =
        q2 && typeof (q2 as unknown as { maybeSingle?: () => unknown }).maybeSingle === "function"
          ? await (q2 as unknown as { maybeSingle: () => Promise<{ data?: unknown }> }).maybeSingle()
          : await (q2 as unknown as Promise<{ data?: unknown }>);
      if (r2?.data && typeof r2.data === "object") {
        return r2.data as Record<string, unknown>;
      }
      return {};
    }
    if (r1?.data && typeof r1.data === "object") {
      return r1.data as Record<string, unknown>;
    }
  } catch {
    // Non-blocking fallback when schema/mock omits broker_profiles columns
  }
  return {};
}

/**
 * WP-P2-08 & WP-7.5A: Aggregated Broker Home Data Fetcher
 */
export async function getAggregatedBrokerHomeData(
  supabase: SupabaseClient,
  userId: string,
): Promise<AggregatedBrokerHomeData> {
  let dbClient: SupabaseClient = supabase;
  if (Boolean((supabase as unknown as { auth?: unknown })?.auth)) {
    try {
      dbClient = createServiceClient();
    } catch {
      dbClient = supabase;
    }
  }

  const [profileRes, brokerRow, buildingsRes, activityRes, wsRes] = await Promise.all([
    dbClient
      .from("profiles")
      .select("display_name, photo_url, role, company, phone")
      .eq("id", userId)
      .maybeSingle(),
    fetchBrokerStatutorySummaryRow(dbClient, userId),
    dbClient
      .from("building_ssot_lite")
      .select("id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers")
      .neq("status", "archived")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20),
    dbClient
      .from("activity_events")
      .select("id, entity_type, event_type, entity_id, actor_id, metadata, created_at")
      .or(`actor_id.eq.${userId},broker_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(100),
    listWorkspaceItemsForOwner(dbClient, { ownerId: userId, limit: 200 }).catch(() => ({
      items: [] as WorkspaceItemRecord[],
      tableAvailable: false,
    })),
  ]);

  const profileData = (profileRes?.data ?? {}) as Record<string, unknown>;
  const profile = {
    displayName: (typeof profileData.display_name === "string" && profileData.display_name) || "중개사",
    photoUrl: (typeof profileData.photo_url === "string" && profileData.photo_url) || null,
    role: (typeof profileData.role === "string" && profileData.role) || "broker",
  };

  const initialDisplayName =
    typeof profileData.display_name === "string" ? profileData.display_name : "";
  const initialCompany =
    typeof profileData.company === "string" ? profileData.company : "";
  const initialPhone =
    typeof profileData.phone === "string" ? profileData.phone : "";
  const initialRepName =
    typeof brokerRow.representative_name === "string" ? brokerRow.representative_name : "";
  const initialOfficeRegNumber =
    typeof brokerRow.office_reg_number === "string" ? brokerRow.office_reg_number : "";
  const initialOfficeAddress =
    typeof brokerRow.office_address === "string" ? brokerRow.office_address : "";

  const completeness = computeBrokerStatutoryCompleteness({
    company: initialCompany || null,
    office_address: initialOfficeAddress || null,
    phone: initialPhone || null,
    office_reg_number: initialOfficeRegNumber || null,
    representative_name: initialRepName || null,
    display_name: initialDisplayName || null,
  });

  const statutory: BrokerHomeStatutoryStatus = {
    isComplete: completeness.isComplete,
    filledCount: completeness.filledCount,
    totalCount: completeness.totalCount,
    missingLabels: completeness.missingLabels,
    initialValues: {
      displayName: initialDisplayName,
      company: initialCompany,
      representativeName: initialRepName,
      officeRegNumber: initialOfficeRegNumber,
      officeAddress: initialOfficeAddress,
      phone: initialPhone,
    },
  };

  const allowMem = allowDealPublicMemoryFallback();
  const activities = (activityRes.data || []) as ActivityEventRow[];
  const deletedBuildingIds = new Set<string>();
  const restoredOrActiveBuildingIds = new Set<string>();
  const customUpsertedBuildings = new Map<string, MergedBuildingRow>();
  const deletedImIds = new Set<string>();
  const restoredImIds = new Set<string>();

  for (const act of activities) {
    const meta = (
      act.metadata && typeof act.metadata === "object" ? act.metadata : {}
    ) as Record<string, unknown>;
    const bId = String(meta.building_id || act.entity_id || "").trim();
    if (!bId || bId === userId) continue;

    if (act.event_type === "dealcard_deleted" || act.event_type === "deal_deleted") {
      if (!restoredOrActiveBuildingIds.has(bId)) deletedBuildingIds.add(bId);
    } else if (
      act.event_type === "dealcard_restored" ||
      act.event_type === "dealcard_upserted"
    ) {
      if (!deletedBuildingIds.has(bId)) {
        restoredOrActiveBuildingIds.add(bId);
        if (meta.card4 && typeof meta.card4 === "object" && !customUpsertedBuildings.has(bId)) {
          const c4 = meta.card4 as Record<string, unknown>;
          customUpsertedBuildings.set(bId, {
            id: bId,
            name: `${c4.region || "새"} ${c4.use || "딜카드"}`.trim(),
            area_signal: String(c4.region || "서울 핵심 권역"),
            updated_at: act.created_at ?? null,
            status: meta.status === "sent" ? "published" : "draft",
            kind: "dealcard",
          });
        }
      }
    } else if (act.event_type === "im_deleted") {
      if (!restoredImIds.has(bId)) deletedImIds.add(bId);
    } else if (act.event_type === "im_restored" || act.event_type === "im_upserted") {
      if (!deletedImIds.has(bId)) restoredImIds.add(bId);
    }
  }

  // Canonical workspace_items (dealcard & im) for this owner, excluding deleted/archived
  const wsItems = (wsRes.items || []).filter((item) => item.ownerId === userId);
  const canonicalDealMap = new Map<string, MergedBuildingRow>();
  const seenDealAliases = new Set<string>();
  const canonicalImRows: MergedBuildingRow[] = [];
  const seenImKeys = new Set<string>();

  for (const item of wsItems) {
    const aliases = [item.id, item.buildingId, item.legacyId].filter(
      (x): x is string => Boolean(x),
    );
    if (item.deletedAt || item.status === "archived") {
      if (item.kind === "im") {
        aliases.forEach((k) => deletedImIds.add(k));
      } else {
        aliases.forEach((k) => deletedBuildingIds.add(k));
      }
      continue;
    }

    const canonicalKey = item.buildingId || item.legacyId || item.id;
    const row: MergedBuildingRow = {
      id: canonicalKey,
      address: item.address || undefined,
      name: item.title || item.address || (item.kind === "im" ? "작업 중인 IM" : "작업 중인 딜카드"),
      area_signal: item.address || item.title || "서울 핵심 권역",
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      status: item.status,
      kind: item.kind,
    };

    if (item.kind === "im") {
      if (!seenImKeys.has(canonicalKey)) {
        seenImKeys.add(canonicalKey);
        aliases.forEach((k) => seenImKeys.add(k));
        canonicalImRows.push(row);
      }
    } else {
      if (!canonicalDealMap.has(canonicalKey)) {
        canonicalDealMap.set(canonicalKey, row);
        aliases.forEach((k) => seenDealAliases.add(k));
        restoredOrActiveBuildingIds.add(canonicalKey);
      }
    }
  }

  const dbBuildings: MergedBuildingRow[] = ((buildingsRes.data || []) as DbBuildingRow[]).map(
    (b) => {
      const layers = (
        b.layers && typeof b.layers === "object" ? b.layers : {}
      ) as Record<string, unknown>;
      const assetIdentity = (
        layers.asset_identity && typeof layers.asset_identity === "object"
          ? layers.asset_identity
          : {}
      ) as Record<string, unknown>;
      const region = String(b.area_signal || assetIdentity.address || "서울 핵심 권역").trim();
      const use = String(b.asset_type || "근린생활시설").trim();
      return {
        id: String(b.id),
        address: String(assetIdentity.address || region),
        name: String(assetIdentity.building_name || `${region} ${use}`.trim()),
        area_signal: region,
        created_at: b.updated_at ?? null,
        updated_at: b.updated_at ?? null,
        status: b.status || "draft",
        kind: "dealcard",
      };
    },
  );

  // Gate in-memory quick records strictly behind allowDealPublicMemoryFallback() AND ownerId === userId
  const quickOwned: MergedBuildingRow[] = allowMem
    ? listAllQuickImRecords()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r) => Boolean(r) && (r as any).ownerId === userId && !isDealCardDeleted(r.buildingId))
        .map((r) => ({
          id: r.buildingId,
          address: r.address,
          name: r.buildingName || `${r.card4.region} ${r.card4.use}`.trim(),
          area_signal: r.card4.region,
          created_at: r.createdAt,
          updated_at: r.updatedAt,
          status: "public_signal_ready",
          kind: "dealcard",
        }))
    : [];

  const mergedBuildingMap = new Map<string, MergedBuildingRow>();
  for (const [bId, wsDeal] of canonicalDealMap.entries()) {
    mergedBuildingMap.set(bId, wsDeal);
  }
  for (const [bId, customBld] of customUpsertedBuildings.entries()) {
    if (!mergedBuildingMap.has(bId) && !seenDealAliases.has(bId)) {
      mergedBuildingMap.set(bId, customBld);
    }
  }
  for (const qb of quickOwned) {
    if (!mergedBuildingMap.has(qb.id) && !seenDealAliases.has(qb.id)) {
      mergedBuildingMap.set(qb.id, qb);
    }
  }
  for (const dbB of dbBuildings) {
    if (!mergedBuildingMap.has(dbB.id) && !seenDealAliases.has(dbB.id)) {
      mergedBuildingMap.set(dbB.id, dbB);
    }
  }

  const activeDealcards = Array.from(mergedBuildingMap.values())
    .filter((b) => {
      if (deletedBuildingIds.has(b.id)) return false;
      if (allowMem && isDealCardDeleted(b.id) && !restoredOrActiveBuildingIds.has(b.id)) {
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at || 0).getTime() -
        new Date(a.updated_at || a.created_at || 0).getTime(),
    );

  const totalBuildings = activeDealcards.length;
  const recentBuilding = activeDealcards[0] || null;

  // Compute IM count & pending inbox count accurately
  const distinctImUnits = new Set<string>();
  for (const imItem of canonicalImRows) {
    if (!deletedImIds.has(imItem.id)) {
      distinctImUnits.add(imItem.id);
    }
  }
  for (const qb of quickOwned) {
    if (!deletedImIds.has(qb.id) && !seenImKeys.has(qb.id)) {
      distinctImUnits.add(qb.id);
    }
  }
  for (const restoredId of restoredImIds) {
    if (!deletedImIds.has(restoredId) && !seenImKeys.has(restoredId)) {
      distinctImUnits.add(restoredId);
    }
  }

  let imCount =
    distinctImUnits.size > 0
      ? distinctImUnits.size
      : wsRes.tableAvailable && wsItems.length > 0
        ? 0
        : totalBuildings;

  let pendingInboxCount = 0;
  try {
    const dbBldIds = dbBuildings.map((b) => b.id);
    const [docsRes, computedPending] = await Promise.all([
      dbBldIds.length > 0
        ? safeResolveList<{ id?: string; building_id?: string; document_type?: string; status?: string }>(
            dbClient
              .from("document_objects")
              .select("id, building_id, document_type, status")
              .in("building_id", dbBldIds)
              .in("document_type", ["mobile_im", "im_lite", "im_lite_draft"])
              .neq("status", "archived"),
            30,
          )
        : Promise.resolve({ data: [], error: null }),
      getInboxPendingCount(dbClient, userId, {
        wsItems,
        dbBuildingsRaw: (buildingsRes.data || []) as DbBuildingRow[],
        activities,
      }),
    ]);

    pendingInboxCount = computedPending;

    if (docsRes.data.length > 0) {
      for (const d of docsRes.data) {
        const bId = String(d.building_id || d.id || "");
        if (!bId || deletedImIds.has(bId) || deletedImIds.has(String(d.id || ""))) continue;
        if (!seenImKeys.has(bId)) {
          distinctImUnits.add(bId);
        }
      }
      if (distinctImUnits.size > 0) {
        imCount = distinctImUnits.size;
      }
    }
  } catch {
    // Non-blocking fallback
  }

  const recentImItem = canonicalImRows.sort(
    (a, b) =>
      new Date(b.updated_at || b.created_at || 0).getTime() -
      new Date(a.updated_at || a.created_at || 0).getTime(),
  )[0] || null;

  const latestRecentCandidate = (() => {
    if (recentBuilding && recentImItem) {
      const dcTs = new Date(recentBuilding.updated_at || recentBuilding.created_at || 0).getTime();
      const imTs = new Date(recentImItem.updated_at || recentImItem.created_at || 0).getTime();
      return imTs > dcTs ? recentImItem : recentBuilding;
    }
    return recentBuilding || recentImItem || null;
  })();

  let resumeItem: BrokerHomeResumeItem | null = null;
  if (latestRecentCandidate) {
    const title =
      latestRecentCandidate.name ||
      latestRecentCandidate.address ||
      latestRecentCandidate.area_signal ||
      "작업 중인 매물";
    const targetBase =
      latestRecentCandidate.kind === "im" ? "/broker/w/im" : "/broker/w/dealcards";
    resumeItem = {
      id: latestRecentCandidate.id,
      title,
      timeAgo: formatRelativeTime(
        latestRecentCandidate.updated_at || latestRecentCandidate.created_at,
      ),
      href: `${targetBase}?buildingId=${encodeURIComponent(latestRecentCandidate.id)}`,
      statusText: latestRecentCandidate.status === "archived" ? "보관됨" : "작업 중",
    };
  }

  const viewsCount = activities.filter(
    (a) =>
      a.event_type === "view" ||
      a.event_type === "open" ||
      a.event_type === "mobile_im_view" ||
      a.event_type === "im_lite_view" ||
      a.event_type === "deal_card_view" ||
      a.event_type === "blind_teaser_view" ||
      a.event_type === "magazine_view",
  ).length;

  let publishedEditionsCount = 0;
  try {
    const edRes = await dbClient
      .from("magazine_editions")
      .select("id, status")
      .eq("broker_id", userId)
      .eq("status", "published")
      .limit(50);
    if (Array.isArray(edRes?.data)) {
      publishedEditionsCount = edRes.data.length;
    }
  } catch {
    // Non-blocking fallback
  }
  const rawMagazineCount = activities.filter(
    (a) => a.entity_type === "magazine" || a.event_type === "magazine_published",
  ).length;
  const magazineCount = Math.max(publishedEditionsCount, rawMagazineCount);

  const inboxBadgeCount = pendingInboxCount > 0 ? pendingInboxCount : viewsCount;
  const inboxBadgeLabel =
    pendingInboxCount > 0
      ? `요청 대기 ${pendingInboxCount}건`
      : viewsCount > 0
        ? `열람 ${viewsCount}명`
        : "새 소식 없음";

  const recentImTarget = recentImItem || recentBuilding;

  const doors: AggregatedBrokerHomeData["doors"] = {
    magazine: {
      id: "magazine",
      title: "부동산뉴스",
      subtitle: "주간·월간 고객 소식지",
      href: "/broker/w/newsletter",
      icon: "📰",
      badge: {
        count: magazineCount,
        label: magazineCount > 0 ? `발행 ${magazineCount}건` : "0건",
        href: "/broker/w/newsletter",
        highlight: magazineCount > 0,
      },
      shortcutNumber: 1,
    },
    dealcards: {
      id: "dealcards",
      title: "딜카드",
      subtitle: "30초 생성 / 카카오톡 전송",
      href: "/broker/w/dealcards",
      icon: "📄",
      badge: {
        count: totalBuildings,
        label: totalBuildings > 0 ? `보유 ${totalBuildings}건` : "0건",
        href: recentBuilding
          ? `/broker/w/dealcards?buildingId=${encodeURIComponent(recentBuilding.id)}`
          : "/broker/w/dealcards",
        highlight: totalBuildings > 0,
      },
      shortcutNumber: 2,
    },
    im: {
      id: "im",
      title: "IM",
      subtitle: "3분 완성 / 발표자료 & PDF",
      href: "/broker/w/im",
      icon: "📊",
      badge: {
        count: imCount,
        label: imCount > 0 ? `보유 ${imCount}건` : "0건",
        href: recentImTarget
          ? `/broker/w/im?buildingId=${encodeURIComponent(recentImTarget.id)}`
          : "/broker/w/im",
        highlight: imCount > 0,
      },
      shortcutNumber: 3,
    },
    inbox: {
      id: "inbox",
      title: "고객 소통",
      subtitle: "열람 고객 / 피드백",
      href: "/broker/w/inbox",
      icon: "💬",
      badge: {
        count: inboxBadgeCount,
        label: inboxBadgeLabel,
        href: "/broker/w/inbox",
        highlight: pendingInboxCount > 0 || viewsCount > 0,
      },
      shortcutNumber: 4,
    },
  };

  return {
    profile,
    statutory,
    resumeItem,
    doors,
  };
}
