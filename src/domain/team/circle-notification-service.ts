import { createServiceClient } from "@/lib/supabase/service";
import { createNotification, type NotificationType } from "@/lib/notifications/in-app";

export async function notifyCircleMembers(input: {
  circleId: string;
  excludeBrokerId?: string;
  title: string;
  body: string;
  link: string;
  type: NotificationType;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient();
  const { data: members } = await supabase
    .from("broker_circle_members")
    .select("broker_id")
    .eq("circle_id", input.circleId)
    .eq("status", "active");

  if (!members || members.length === 0) return;

  const targetMembers = members.filter((m) => m.broker_id !== input.excludeBrokerId);

  await Promise.all(
    targetMembers.map((m) =>
      createNotification({
        user_id: m.broker_id,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        metadata: input.metadata,
      })
    )
  );
}

export async function notifyMatchParties(input: {
  circleMatchId: string;
  title: string;
  body: string;
  link: string;
  type: NotificationType;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient();
  const { data: match } = await supabase
    .from("circle_match_results")
    .select("building_broker_id, buyer_broker_id")
    .eq("id", input.circleMatchId)
    .single();

  if (!match) return;

  const brokers = Array.from(new Set([match.building_broker_id, match.buyer_broker_id]));

  await Promise.all(
    brokers.map((brokerId) =>
      createNotification({
        user_id: brokerId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        metadata: input.metadata,
      })
    )
  );
}

export async function notifyCircleMatch(match: {
  circleId: string;
  matchGrade: string;
  circleName: string;
  buildingName?: string;
}) {
  const supabase = createServiceClient();
  
  // 1. In-app notification
  const { data: members } = await supabase
    .from('circle_members')
    .select('user_id, profiles(display_name, phone)')
    .eq('circle_id', match.circleId);
  
  if (members) {
    for (const member of members) {
      await createNotification({
        user_id: member.user_id,
        type: 'circle_match' as any,
        title: `${match.circleName}에 새 매칭이 등록되었습니다`,
        body: `${match.buildingName || '새 매물'} - 매칭등급 ${match.matchGrade}`,
        link: `/broker/circle/${match.circleId}`,
        metadata: { circleId: match.circleId },
      });
    }
  }
  
  // 2. Kakao alimtalk (best-effort)
  try {
    if (process.env.KAKAO_ALIMTALK_API_KEY) {
      // Future integration point
      console.log('[Circle] Kakao alimtalk integration pending:', match.circleName);
    }
  } catch (e) {
    console.error('[Circle] Kakao notification failed:', e);
  }
}
