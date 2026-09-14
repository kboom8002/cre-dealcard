/**
 * GET  /api/broker/notifications        — 알림 목록 조회
 * POST /api/broker/notifications        — 알림 읽음 처리
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from "@/lib/notifications/in-app";

const NotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const NotificationsActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark_read"),
    notification_id: z.string().min(1, "notification_id is required"),
  }),
  z.object({
    action: z.literal("mark_all_read"),
  }),
]);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = NotificationsQuerySchema.safeParse({
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });

  const limit = parseResult.success ? parseResult.data.limit : 50;

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(user.id, limit),
    getUnreadCount(user.id),
  ]);

  return NextResponse.json({
    notifications,
    unread_count: unreadCount,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = NotificationsActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid action payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const input = parsed.data;

  if (input.action === "mark_read") {
    await markAsRead(input.notification_id);
    return NextResponse.json({ ok: true });
  }

  if (input.action === "mark_all_read") {
    await markAllAsRead(user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
