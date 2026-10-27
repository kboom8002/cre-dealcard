import type { SupabaseClient } from "@supabase/supabase-js";

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
  // 1. Try single roundtrip RPC if available
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_broker_home_summary",
      { p_user_id: userId }
    );

    if (!rpcError && rpcData && typeof rpcData === "object") {
      const typed = rpcData as Partial<AggregatedBrokerHomeData>;
      if (typed.profile && typed.doors) {
        return typed as AggregatedBrokerHomeData;
      }
    }
  } catch {
    // Graceful fallback to aggregated multi-table query budget <= 3
  }

  // 2. Fallback: strictly at most 3 coordinated queries
  // Query 1: Profile information
  // Query 2: Most recent buildings for resume bar & dealcard count
  // Query 3: Activity events for recent interactions / inbox badge
  const [profileRes, buildingsRes, activityRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, photo_url, role")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("building_ssot_lite")
      .select("id, address, name, area_signal, created_at, updated_at, status")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10),
    supabase
      .from("activity_events")
      .select("id, entity_type, event_type, created_at")
      .or(`actor_id.eq.${userId},broker_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const profile = {
    displayName: profileRes.data?.display_name || "중개사",
    photoUrl: profileRes.data?.photo_url || null,
    role: profileRes.data?.role || "broker",
  };

  const buildings = buildingsRes.data || [];
  const totalBuildings = buildings.length;
  const recentBuilding = buildings[0] || null;

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

  const activities = activityRes.data || [];
  const viewsCount = activities.filter(
    (a) => a.event_type === "view" || a.event_type === "open"
  ).length;

  const doors: AggregatedBrokerHomeData["doors"] = {
    dealcards: {
      id: "dealcards",
      title: "딜카드",
      subtitle: "30초 생성 / 카카오톡 전송",
      href: "/broker/w/dealcards",
      icon: "📄",
      badge: {
        count: totalBuildings,
        label: totalBuildings > 0 ? `작성 중 ${totalBuildings}건` : "0건",
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
        count: totalBuildings,
        label: totalBuildings > 0 ? `관리 중 ${totalBuildings}건` : "0건",
        href: recentBuilding
          ? `/broker/w/im?buildingId=${recentBuilding.id}`
          : "/broker/w/im",
        highlight: false,
      },
      shortcutNumber: 2,
    },
    magazine: {
      id: "magazine",
      title: "뉴스레터",
      subtitle: "주간 매물 소식지",
      href: "/broker/w/magazine",
      icon: "📰",
      badge: {
        count: 1,
        label: "이번 주 발행",
        href: "/broker/w/magazine",
        highlight: true,
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
        count: viewsCount || activities.length,
        label:
          viewsCount > 0
            ? `열람 ${viewsCount}명`
            : activities.length > 0
            ? `알림 ${activities.length}건`
            : "새 소식 없음",
        href: "/broker/w/inbox",
        highlight: viewsCount > 0,
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
