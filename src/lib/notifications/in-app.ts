/**
 * 인앱 알림 유틸리티
 * 
 * Supabase `in_app_notifications` 테이블에 알림을 저장합니다.
 * 브로커가 대시보드에서 확인할 수 있습니다.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("in-app-notification");

export type NotificationType =
  | "im_inquiry"       // 프라이빗 IM 신청
  | "im_generated"     // IM 생성 완료
  | "im_viewed"        // IM 열람 (Hot Lead)
  | "deal_update"      // 딜카드 업데이트
  | "system"           // 시스템 알림
  | "circle_invite"    // 서클 초대
  | "circle_match"     // 팀 매칭 발견
  | "circle_approval"  // 승인 요청/완료
  | "circle_revealed"  // 신원 공개 완료
  | "circle_joined"    // 새 멤버 가입
  | "circle_shared";   // 새 자산 공유

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
    // Note: The in_app_notifications table should be created via proper Supabase migration.
    // We no longer use exec_sql to create tables at runtime.
    log.error("Failed to insert in-app notification", error, { userId: input.user_id, type: input.type });
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

