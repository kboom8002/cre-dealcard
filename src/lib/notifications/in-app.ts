/**
 * 인앱 알림 유틸리티
 * 
 * Supabase `in_app_notifications` 테이블에 알림을 저장합니다.
 * 브로커가 대시보드에서 확인할 수 있습니다.
 */
import { createServiceClient } from "@/lib/supabase/service";

export type NotificationType =
  | "im_inquiry"       // 프라이빗 IM 신청
  | "im_generated"     // IM 생성 완료
  | "im_viewed"        // IM 열람 (Hot Lead)
  | "deal_update"      // 딜카드 업데이트
  | "system";          // 시스템 알림

export interface CreateNotificationInput {
  user_id: string;           // 수신자 (브로커 user id)
  type: NotificationType;
  title: string;
  body: string;
  link?: string;             // 클릭 시 이동할 앱 내 경로
  metadata?: Record<string, unknown>; // 추가 데이터
}

/**
 * 인앱 알림 생성
 * 
 * 테이블이 없으면 자동 생성을 시도합니다.
 */
export async function createNotification(input: CreateNotificationInput): Promise<boolean> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("in_app_notifications")
    .insert({
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link || null,
      metadata: input.metadata || null,
      is_read: false,
    });

  if (error) {
    // 테이블 미존재 시 자동 생성 시도
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[notification] Table not found. Creating...");
      const created = await ensureNotificationTable(supabase);
      if (created) {
        // 재시도
        const { error: retryErr } = await supabase
          .from("in_app_notifications")
          .insert({
            user_id: input.user_id,
            type: input.type,
            title: input.title,
            body: input.body,
            link: input.link || null,
            metadata: input.metadata || null,
            is_read: false,
          });
        if (retryErr) {
          console.error("[notification] Retry insert failed:", retryErr.message);
          return false;
        }
        return true;
      }
      return false;
    }
    console.error("[notification] Insert error:", error.message);
    return false;
  }

  return true;
}

/**
 * 읽지 않은 알림 수 조회
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("in_app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) return 0;
  return count ?? 0;
}

/**
 * 알림 목록 조회 (최근 50개)
 */
export async function getNotifications(userId: string, limit = 50) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("in_app_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

/**
 * 알림 읽음 처리
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("in_app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId);

  return !error;
}

/**
 * 모든 알림 읽음 처리
 */
export async function markAllAsRead(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("in_app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_read", false);

  return !error;
}

// ── 테이블 자동 생성 ──
async function ensureNotificationTable(supabase: ReturnType<typeof createServiceClient>): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE TABLE IF NOT EXISTS public.in_app_notifications (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
          type text NOT NULL DEFAULT 'system',
          title text NOT NULL,
          body text NOT NULL,
          link text,
          metadata jsonb,
          is_read boolean NOT NULL DEFAULT false,
          read_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_notif_user_unread 
          ON public.in_app_notifications(user_id, is_read) 
          WHERE is_read = false;
      `,
    });
    if (error) {
      console.error("[notification] Table creation failed:", error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
