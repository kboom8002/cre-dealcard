/**
 * @module CircleMatchNotifier
 * @description 서클 내 S/A 등급 교차 매칭 발생 시 멤버 알림 및 서클 매칭 속보 브리핑 생성
 */
import { createServiceClient } from "@/lib/supabase/service";
import { createNotification } from "@/lib/notifications/in-app";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("circle-match-notifier");

export interface CircleMatchNotificationParams {
  circleId: string;
  circleMatchId: string;
  grade: "S" | "A";
  score: number;
  buildingId: string;
  buyerIntentId: string;
  buildingBrokerId: string;
  buyerBrokerId: string;
}

export async function notifyCircleMatchBulletin(
  params: CircleMatchNotificationParams
): Promise<void> {
  const {
    circleId,
    circleMatchId,
    grade,
    score,
    buildingId,
    buyerIntentId,
  } = params;

  const supabase = createServiceClient();

  try {
    // 1. Fetch circle details & members
    const [{ data: circle }, { data: members }, { data: building }] = await Promise.all([
      supabase.from("broker_circles").select("name").eq("id", circleId).maybeSingle(),
      supabase.from("broker_circle_members").select("broker_id").eq("circle_id", circleId).eq("status", "active"),
      supabase.from("building_ssot_lite").select("area_signal, asset_type, price_band").eq("id", buildingId).maybeSingle(),
    ]);

    const circleName = circle?.name || "공동중개 서클";
    const blindName = building ? [building.area_signal, building.asset_type].filter(Boolean).join(" · ") : "신규 매물";

    // 2. Notify all active circle members with in-app notification
    if (members && members.length > 0) {
      await Promise.all(
        members.map((m) =>
          createNotification({
            user_id: m.broker_id,
            type: "circle_match" as any,
            title: `⚡ [${circleName}] ${grade}등급 교차 매칭 속보!`,
            body: `${blindName} (${Math.round(score)}점) 교차 매칭이 성사되었습니다. 서클 대시보드에서 공동중개를 검토하세요.`,
            link: `/broker/circles/${circleId}`,
            metadata: {
              circleId,
              circleMatchId,
              grade,
              score,
              buildingId,
              buyerIntentId,
            },
          }).catch((err) => log.warn("[circle-match-notifier] In-app notification error:", err))
        )
      );
    }

    log.info(`[circle-match-notifier] Sent ${grade} match bulletin to ${members?.length || 0} members of circle ${circleId}`);
  } catch (err: any) {
    log.error("[circle-match-notifier] Failed to notify circle match bulletin:", err);
  }
}
