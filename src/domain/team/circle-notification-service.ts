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
