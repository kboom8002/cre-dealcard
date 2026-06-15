"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { headers } from "next/headers";

/**
 * createMobileIMAction — Mobile IM Lite 자동 생성
 *
 * v2 — 딜카드 상세 페이지에서 이미 보유한 데이터를 직접 전달 (무마찰)
 * /api/broker/im-lite/generate → writer.ts → GPT-4o + 공공데이터
 */
export async function createMobileIMAction(
  buildingId: string,
  options?: {
    monthly_rent_total_krw?: number;
    vacancy_status?: string;
    photo_urls?: string[];
    broker_highlight?: string;
    estimated_yield_pct?: number;
    // v2: 딜카드에서 직접 전달하는 보강 데이터
    direct_data?: Record<string, unknown>;
  }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "인증이 필요합니다." };
    }

    // 내부 API 직접 호출 (서버 액션 → API 라우트)
    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const baseUrl = `${protocol}://${host}`;

    const res = await fetch(`${baseUrl}/api/broker/im-lite/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: headersList.get("cookie") ?? "",
      },
      body: JSON.stringify({
        building_id: buildingId,
        monthly_rent_total_krw: options?.monthly_rent_total_krw,
        vacancy_status: options?.vacancy_status,
        photo_urls: options?.photo_urls ?? [],
        broker_highlight: options?.broker_highlight,
        estimated_yield_pct: options?.estimated_yield_pct,
        direct_data: options?.direct_data,
        skip_approval: false, // v2: 리뷰 페이지를 거치도록 false로 변경
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Readiness 부족 → 사용자 친화 에러 메시지
      if (res.status === 400 && data.missing) {
        return {
          success: false,
          error: `데이터가 부족합니다 (${data.score}점 / 40점 기준). 누락 항목: ${data.missing.join(", ")}`,
          readiness: { score: data.score, missing: data.missing },
        };
      }
      return { success: false, error: data.error ?? `API Error: ${res.status}` };
    }

    return {
      success: true,
      url: data.url,
      reviewUrl: data.im_lite_id ? `/broker/im-approval/${data.im_lite_id}` : data.url,
      im_lite_id: data.im_lite_id,
      ai_used: data.ai_used,
      sections_count: data.sections_count,
      message: data.message,
    };
  } catch (err: any) {
    console.error("[createMobileIMAction] Error:", err);
    return { success: false, error: err?.message ?? "알 수 없는 오류가 발생했습니다." };
  }
}
