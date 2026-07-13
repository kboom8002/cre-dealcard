/**
 * GET  /api/broker/notifications        — 알림 목록 조회
 * POST /api/broker/notifications        — 알림 읽음 처리
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getNotifications, getUnreadCount, markAsRead, markAllAsRead } from "@/lib/notifications/in-app";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit")) || 50;
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

  const body = await req.json();
  const { action, notification_id } = body;

  if (action === "mark_read" && notification_id) {
    await markAsRead(notification_id);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_all_read") {
    await markAllAsRead(user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
