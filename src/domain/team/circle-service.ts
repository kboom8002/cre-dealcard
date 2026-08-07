import { createServiceClient } from "@/lib/supabase/service";
import { notifyCircleMembers } from "./circle-notification-service";
import { createNotification } from "@/lib/notifications/in-app";

export interface Circle {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  avatar_emoji: string;
  invite_code: string;
  max_members: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CircleMember {
  id: string;
  circle_id: string;
  broker_id: string;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'active' | 'left' | 'removed';
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
  profile?: {
    display_name: string | null;
    company: string | null;
    phone: string | null;
  };
}

export interface CircleWithStats extends Circle {
  member_count: number;
  shared_asset_count: number;
  pending_match_count: number;
  my_role: string;
}

export interface PendingInvitation {
  membership_id: string;
  circle: Circle;
  inviter: {
    display_name: string | null;
    company: string | null;
  } | null;
}

export async function createCircle(input: {
  name: string;
  description?: string;
  avatarEmoji?: string;
  createdBy: string;
}): Promise<Circle> {
  const supabase = createServiceClient();

  // 1. Create circle
  const { data: circle, error: circleErr } = await supabase
    .from("broker_circles")
    .insert({
      name: input.name,
      description: input.description || null,
      avatar_emoji: input.avatarEmoji || "🤝",
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (circleErr || !circle) {
    throw new Error(`Failed to create circle: ${circleErr?.message}`);
  }

  // 2. Add owner membership
  const { error: memberErr } = await supabase
    .from("broker_circle_members")
    .insert({
      circle_id: circle.id,
      broker_id: input.createdBy,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    });

  if (memberErr) {
    console.error("[createCircle] Add owner error:", memberErr.message);
  }

  // 3. Activity event
  await supabase.from("activity_events").insert({
    actor_id: input.createdBy,
    event_type: "circle_created",
    entity_type: "broker_circles",
    entity_id: circle.id,
    metadata: { name: circle.name },
  });

  return circle as Circle;
}

export async function inviteMember(input: {
  circleId: string;
  inviterBrokerId: string;
  inviteeIdentifier: string; // phone or profile_id
}): Promise<{ status: 'invited' | 'already_member' | 'not_found' }> {
  const supabase = createServiceClient();

  // Find user by phone or id
  let targetUserId: string | null = null;

  if (/^[0-9a-f-]{36}$/i.test(input.inviteeIdentifier)) {
    targetUserId = input.inviteeIdentifier;
  } else {
    // Search profile by phone
    const cleaned = input.inviteeIdentifier.replace(/[^0-9]/g, "");
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .or(`phone.eq.${input.inviteeIdentifier},phone.eq.${cleaned}`)
      .limit(1)
      .maybeSingle();

    if (profile) {
      targetUserId = profile.id;
    }
  }

  if (!targetUserId) {
    return { status: 'not_found' };
  }

  // Check if already member
  const { data: existing } = await supabase
    .from("broker_circle_members")
    .select("status")
    .eq("circle_id", input.circleId)
    .eq("broker_id", targetUserId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "active" || existing.status === "pending") {
      return { status: 'already_member' };
    }
  }

  // Check max members
  const { count } = await supabase
    .from("broker_circle_members")
    .select("id", { count: "exact", head: true })
    .eq("circle_id", input.circleId)
    .eq("status", "active");

  const { data: circle } = await supabase
    .from("broker_circles")
    .select("max_members, name")
    .eq("id", input.circleId)
    .single();

  if ((count ?? 0) >= (circle?.max_members ?? 10)) {
    throw new Error("서클 최대 인원 초과입니다.");
  }

  // Upsert member
  await supabase
    .from("broker_circle_members")
    .upsert({
      circle_id: input.circleId,
      broker_id: targetUserId,
      role: "member",
      status: "pending",
      invited_by: input.inviterBrokerId,
    }, { onConflict: "circle_id,broker_id" });

  // Send notification
  const { data: inviterProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", input.inviterBrokerId)
    .maybeSingle();

  const inviterName = inviterProfile?.display_name || "동료 중개사";

  await createNotification({
    user_id: targetUserId,
    type: "circle_invite",
    title: "🤝 서클 초대 알림",
    body: `${inviterName} 님이 "${circle?.name || "서클"}"에 초대했습니다.`,
    link: `/broker/circles/join?circleId=${input.circleId}`,
    metadata: { circle_id: input.circleId, inviter_id: input.inviterBrokerId },
  });

  return { status: 'invited' };
}

export async function joinByInviteCode(input: {
  inviteCode: string;
  brokerId: string;
}): Promise<{ circleId: string; status: 'joined' | 'already_member' | 'invalid_code' | 'full' }> {
  const supabase = createServiceClient();

  const { data: circle } = await supabase
    .from("broker_circles")
    .select("id, name, max_members, created_by")
    .eq("invite_code", input.inviteCode)
    .eq("is_active", true)
    .maybeSingle();

  if (!circle) {
    return { circleId: "", status: 'invalid_code' };
  }

  // Check existing
  const { data: existing } = await supabase
    .from("broker_circle_members")
    .select("status")
    .eq("circle_id", circle.id)
    .eq("broker_id", input.brokerId)
    .maybeSingle();

  if (existing && existing.status === "active") {
    return { circleId: circle.id, status: 'already_member' };
  }

  // Check count
  const { count } = await supabase
    .from("broker_circle_members")
    .select("id", { count: "exact", head: true })
    .eq("circle_id", circle.id)
    .eq("status", "active");

  if ((count ?? 0) >= circle.max_members) {
    return { circleId: circle.id, status: 'full' };
  }

  // Upsert active member
  await supabase
    .from("broker_circle_members")
    .upsert({
      circle_id: circle.id,
      broker_id: input.brokerId,
      role: "member",
      status: "active",
      joined_at: new Date().toISOString(),
    }, { onConflict: "circle_id,broker_id" });

  // Notify circle owner
  const { data: joinerProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", input.brokerId)
    .maybeSingle();

  const joinerName = joinerProfile?.display_name || "새 중개사";

  await notifyCircleMembers({
    circleId: circle.id,
    excludeBrokerId: input.brokerId,
    title: "🎉 서클 새 멤버 가입",
    body: `${joinerName} 님이 "${circle.name}" 서클에 가입했습니다.`,
    link: `/broker/circles/${circle.id}`,
    type: "circle_joined",
  });

  return { circleId: circle.id, status: 'joined' };
}

export async function acceptInvitation(circleId: string, brokerId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("broker_circle_members")
    .update({
      status: "active",
      joined_at: new Date().toISOString(),
    })
    .eq("circle_id", circleId)
    .eq("broker_id", brokerId);

  const { data: circle } = await supabase
    .from("broker_circles")
    .select("name")
    .eq("id", circleId)
    .single();

  const { data: joinerProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", brokerId)
    .maybeSingle();

  const joinerName = joinerProfile?.display_name || "중개사";

  await notifyCircleMembers({
    circleId,
    excludeBrokerId: brokerId,
    title: "🎉 서클 초대 수락",
    body: `${joinerName} 님이 "${circle?.name || "서클"}" 초대를 수락하고 가입했습니다.`,
    link: `/broker/circles/${circleId}`,
    type: "circle_joined",
  });
}

export async function declineInvitation(circleId: string, brokerId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("broker_circle_members")
    .update({ status: "left" })
    .eq("circle_id", circleId)
    .eq("broker_id", brokerId);
}

export async function leaveCircle(circleId: string, brokerId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: member } = await supabase
    .from("broker_circle_members")
    .select("role")
    .eq("circle_id", circleId)
    .eq("broker_id", brokerId)
    .maybeSingle();

  if (member?.role === "owner") {
    throw new Error("서클 개설자는 서클을 탈퇴할 수 없습니다. 서클 삭제를 진행해주세요.");
  }

  await supabase
    .from("broker_circle_members")
    .update({ status: "left" })
    .eq("circle_id", circleId)
    .eq("broker_id", brokerId);

  // Clean shared assets
  await supabase
    .from("circle_shared_assets")
    .delete()
    .eq("circle_id", circleId)
    .eq("broker_id", brokerId);
}

export async function removeMember(input: {
  circleId: string;
  adminBrokerId: string;
  targetBrokerId: string;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: adminMember } = await supabase
    .from("broker_circle_members")
    .select("role")
    .eq("circle_id", input.circleId)
    .eq("broker_id", input.adminBrokerId)
    .eq("status", "active")
    .maybeSingle();

  if (!adminMember || (adminMember.role !== "owner" && adminMember.role !== "admin")) {
    throw new Error("권한이 없습니다.");
  }

  await supabase
    .from("broker_circle_members")
    .update({ status: "removed" })
    .eq("circle_id", input.circleId)
    .eq("broker_id", input.targetBrokerId);

  await supabase
    .from("circle_shared_assets")
    .delete()
    .eq("circle_id", input.circleId)
    .eq("broker_id", input.targetBrokerId);
}

export async function getMyCircles(brokerId: string): Promise<CircleWithStats[]> {
  const supabase = createServiceClient();

  const { data: memberships } = await supabase
    .from("broker_circle_members")
    .select("circle_id, role")
    .eq("broker_id", brokerId)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) return [];

  const circleIds = memberships.map((m) => m.circle_id);
  const roleMap = new Map(memberships.map((m) => [m.circle_id, m.role]));

  const { data: circles } = await supabase
    .from("broker_circles")
    .select("*")
    .in("id", circleIds)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (!circles) return [];

  const result: CircleWithStats[] = await Promise.all(
    circles.map(async (c) => {
      const [{ count: mCount }, { count: aCount }, { count: matchCount }] = await Promise.all([
        supabase.from("broker_circle_members").select("id", { count: "exact", head: true }).eq("circle_id", c.id).eq("status", "active"),
        supabase.from("circle_shared_assets").select("id", { count: "exact", head: true }).eq("circle_id", c.id),
        supabase.from("circle_match_results").select("id", { count: "exact", head: true }).eq("circle_id", c.id).in("grade", ["S", "A"]),
      ]);

      return {
        ...(c as Circle),
        member_count: mCount ?? 0,
        shared_asset_count: aCount ?? 0,
        pending_match_count: matchCount ?? 0,
        my_role: roleMap.get(c.id) || "member",
      };
    })
  );

  return result;
}

export async function getCircleDetail(circleId: string, brokerId: string) {
  const supabase = createServiceClient();

  const { data: circle } = await supabase
    .from("broker_circles")
    .select("*")
    .eq("id", circleId)
    .single();

  if (!circle) throw new Error("서클을 찾을 수 없습니다.");

  const { data: members } = await supabase
    .from("broker_circle_members")
    .select("*, profile:profiles(display_name, company, phone)")
    .eq("circle_id", circleId)
    .in("status", ["active", "pending"]);

  return {
    circle: circle as Circle,
    members: (members || []) as CircleMember[],
  };
}

export async function getPendingInvitations(brokerId: string): Promise<PendingInvitation[]> {
  const supabase = createServiceClient();

  const { data: memberships } = await supabase
    .from("broker_circle_members")
    .select("id, circle_id, invited_by")
    .eq("broker_id", brokerId)
    .eq("status", "pending");

  if (!memberships || memberships.length === 0) return [];

  const result: PendingInvitation[] = [];
  for (const m of memberships) {
    const { data: circle } = await supabase
      .from("broker_circles")
      .select("*")
      .eq("id", m.circle_id)
      .single();

    let inviter = null;
    if (m.invited_by) {
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, company")
        .eq("id", m.invited_by)
        .maybeSingle();
      inviter = p;
    }

    if (circle) {
      result.push({
        membership_id: m.id,
        circle: circle as Circle,
        inviter,
      });
    }
  }

  return result;
}

export async function updateCircle(circleId: string, ownerId: string, updates: {
  name?: string;
  description?: string;
  avatarEmoji?: string;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("broker_circles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", circleId)
    .eq("created_by", ownerId);
}

export async function deleteCircle(circleId: string, ownerId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("broker_circles")
    .delete()
    .eq("id", circleId)
    .eq("created_by", ownerId);
}
