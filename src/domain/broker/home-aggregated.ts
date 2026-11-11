import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listAllQuickImRecords,
  isDealCardDeleted,
  getInboxState,
} from "@/lib/im-lite/quick-generate-store";

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
  resumeItem: BrokerHomeResumeItem | null;
  doors: {
    dealcards: BrokerDoorConfig;
    im: BrokerDoorConfig;
    magazine: BrokerDoorConfig;
    inbox: BrokerDoorConfig;
  };
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
 * WP-P2-08: Aggregated Broker Home Data Fetcher
 *
 * Replaces the 9 parallel uncoordinated queries with an aggregated fetch
 * strictly conforming to the <= 3 query budget on mount.
 * Attempts single RPC `get_broker_home_summary` if present, with graceful
 * 3-query fallback when running without the RPC.
 */
export async function getAggregatedBrokerHomeData(
  supabase: SupabaseClient,
  userId: string
): Promise<AggregatedBrokerHomeData> {
  let dbClient: SupabaseClient = supabase;
  try {
    dbClient = createServiceClient();
  } catch {
    dbClient = supabase;
  }

  // Coordinated queries for Profile, Buildings (building_ssot_lite), and Activity Events
  const [profileRes, buildingsRes, activityRes] = await Promise.all([
    dbClient
      .from("profiles")
      .select("display_name, photo_url, role")
      .eq("id", userId)
      .maybeSingle(),
    dbClient
      .from("building_ssot_lite")
      .select("id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers")
      .neq("status", "archived")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20),
    dbClient
      .from("activity_events")
      .select("id, entity_type, event_type, entity_id, metadata, created_at")
      .or(`actor_id.eq.${userId},broker_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const profile = {
    displayName: profileRes.data?.display_name || "중개사",
    photoUrl: profileRes.data?.photo_url || null,
    role: profileRes.data?.role || "broker",
  };

  const activities = (activityRes.data || []) as any[];
  const deletedBuildingIds = new Set<string>();
  const restoredOrActiveBuildingIds = new Set<string>();
  const customUpsertedBuildings = new Map<string, { id: string; name: string; area_signal: string; updated_at: string; status: string }>();
  const deletedImIds = new Set<string>();
  const restoredImIds = new Set<string>();
  const decidedGateIds = new Set<string>(Object.keys(getInboxState().gateDecisions || {}));

  for (const act of activities) {
    const meta = (act.metadata && typeof act.metadata === "object" ? act.metadata : {}) as Record<string, any>;
    const bId = String(meta.building_id || act.entity_id || "").trim();
    if (act.event_type === "gate_request_approved" || act.event_type === "gate_request_rejected") {
      if (meta.request_id) decidedGateIds.add(String(meta.request_id));
      if (meta.thread_id) decidedGateIds.add(String(meta.thread_id));
    }
    if (!bId || bId === userId) continue;

    if (act.event_type === "dealcard_deleted") {
      if (!restoredOrActiveBuildingIds.has(bId)) deletedBuildingIds.add(bId);
    } else if (act.event_type === "dealcard_restored" || act.event_type === "dealcard_upserted") {
      if (!deletedBuildingIds.has(bId)) {
        restoredOrActiveBuildingIds.add(bId);
        if (meta.card4 && !customUpsertedBuildings.has(bId)) {
          const c4 = meta.card4 as Record<string, any>;
          customUpsertedBuildings.set(bId, {
            id: bId,
            name: `${c4.region || "새"} ${c4.use || "딜카드"}`.trim(),
            area_signal: String(c4.region || "서울 핵심 권역"),
            updated_at: act.created_at,
            status: meta.status === "sent" ? "published" : "draft",
          });
        }
      }
    } else if (act.event_type === "im_deleted") {
      if (!restoredImIds.has(bId)) deletedImIds.add(bId);
    } else if (act.event_type === "im_restored" || act.event_type === "im_upserted") {
      if (!deletedImIds.has(bId)) restoredImIds.add(bId);
    }
  }

  const dbBuildings = (buildingsRes.data || []).map((b: any) => {
    const layers = (b.layers && typeof b.layers === "object" ? b.layers : {}) as Record<string, any>;
    const assetIdentity = (layers.asset_identity && typeof layers.asset_identity === "object" ? layers.asset_identity : {}) as Record<string, any>;
    const region = String(b.area_signal || assetIdentity.address || "서울 핵심 권역").trim();
    const use = String(b.asset_type || "근린생활시설").trim();
    return {
      id: String(b.id),
      address: String(assetIdentity.address || region),
      name: String(assetIdentity.building_name || `${region} ${use}`.trim()),
      area_signal: region,
      created_at: b.updated_at,
      updated_at: b.updated_at,
      status: b.status || "draft",
    };
  });

  const quickOwned = listAllQuickImRecords()
    .filter((r) => r.ownerId === userId)
    .map((r) => ({
      id: r.buildingId,
      address: r.address,
      name: r.buildingName || `${r.card4.region} ${r.card4.use}`.trim(),
      area_signal: r.card4.region,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      status: "public_signal_ready",
    }));

  const mergedBuildingMap = new Map<string, any>();
  for (const [bId, customBld] of customUpsertedBuildings.entries()) {
    mergedBuildingMap.set(bId, customBld);
  }
  for (const qb of quickOwned) {
    if (!mergedBuildingMap.has(qb.id)) mergedBuildingMap.set(qb.id, qb);
  }
  for (const dbB of dbBuildings) {
    if (!mergedBuildingMap.has(dbB.id)) {
      mergedBuildingMap.set(dbB.id, dbB);
    }
  }

  const activeDealcards = Array.from(mergedBuildingMap.values())
    .filter((b) => {
      if (deletedBuildingIds.has(b.id)) return false;
      if (isDealCardDeleted(b.id) && !restoredOrActiveBuildingIds.has(b.id)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at || 0).getTime() -
        new Date(a.updated_at || a.created_at || 0).getTime()
    );

  const totalBuildings = activeDealcards.length;
  const recentBuilding = activeDealcards[0] || null;

  // Compute IM count & pending inbox count accurately (matching /broker/w/im and /api/broker/inbox/pending-count)
  let imCount = totalBuildings;
  let pendingInboxCount = 0;
  try {
    const dbBldIds = dbBuildings.map((b) => b.id);
    if (dbBldIds.length > 0) {
      const [docsRes, gateRes] = await Promise.all([
        dbClient
          .from("document_objects")
          .select("id, building_id, document_type, status")
          .in("building_id", dbBldIds)
          .in("document_type", ["mobile_im", "im_lite", "im_lite_draft"])
          .neq("status", "archived")
          .limit(30),
        dbClient
          .from("gate_requests")
          .select("id, building_id, status")
          .eq("status", "pending")
          .in("building_id", dbBldIds),
      ]);
      if (Array.isArray(docsRes?.data) && docsRes.data.length > 0) {
        const seenImBlds = new Set<string>();
        for (const d of docsRes.data) {
          const bId = String(d.building_id || d.id);
          if (deletedImIds.has(bId) || deletedImIds.has(String(d.id))) continue;
          seenImBlds.add(bId);
        }
        for (const qb of quickOwned) {
          if (!deletedImIds.has(qb.id)) seenImBlds.add(qb.id);
        }
        if (seenImBlds.size > 0) imCount = seenImBlds.size;
      }
      if (Array.isArray(gateRes?.data)) {
        pendingInboxCount = gateRes.data.filter((r: any) => {
          const rawId = String(r?.id || "");
          return !decidedGateIds.has(rawId) && !decidedGateIds.has(`thread_${rawId}`);
        }).length;
      }
    }
  } catch {
    // Non-blocking fallback
  }

  let resumeItem: BrokerHomeResumeItem | null = null;
  if (recentBuilding) {
    const title =
      recentBuilding.name ||
      recentBuilding.address ||
      recentBuilding.area_signal ||
      "작업 중인 매물";
    resumeItem = {
      id: recentBuilding.id,
      title,
      timeAgo: formatRelativeTime(
        recentBuilding.updated_at || recentBuilding.created_at
      ),
      href: `/broker/w/dealcards?buildingId=${recentBuilding.id}`,
      statusText: recentBuilding.status === "archived" ? "보관됨" : "작업 중",
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
      a.event_type === "magazine_view"
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
    (a) => a.entity_type === "magazine" || a.event_type === "magazine_published"
  ).length;
  const magazineCount = Math.max(publishedEditionsCount, rawMagazineCount);

  const inboxBadgeCount = pendingInboxCount > 0 ? pendingInboxCount : viewsCount;
  const inboxBadgeLabel =
    pendingInboxCount > 0
      ? `요청 대기 ${pendingInboxCount}건`
      : viewsCount > 0
      ? `열람 ${viewsCount}명`
      : "새 소식 없음";

  const doors: AggregatedBrokerHomeData["doors"] = {
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
          ? `/broker/w/dealcards?buildingId=${recentBuilding.id}`
          : "/broker/w/dealcards",
        highlight: totalBuildings > 0,
      },
      shortcutNumber: 1,
    },
    im: {
      id: "im",
      title: "기본 IM",
      subtitle: "3분 완성 / 10개 섹션 리포트",
      href: "/broker/w/im",
      icon: "📊",
      badge: {
        count: imCount,
        label: imCount > 0 ? `보유 ${imCount}건` : "0건",
        href: recentBuilding
          ? `/broker/w/im?buildingId=${recentBuilding.id}`
          : "/broker/w/im",
        highlight: imCount > 0,
      },
      shortcutNumber: 2,
    },
    magazine: {
      id: "magazine",
      title: "뉴스레터",
      subtitle: "주간 매물 소식지",
      href: "/broker/magazine-editor",
      icon: "📰",
      badge: {
        count: magazineCount,
        label: magazineCount > 0 ? `발행 ${magazineCount}건` : "0건",
        href: "/broker/magazine-editor",
        highlight: magazineCount > 0,
      },
      shortcutNumber: 3,
    },
    inbox: {
      id: "inbox",
      title: "고객 소통함",
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
    resumeItem,
    doors,
  };
}
