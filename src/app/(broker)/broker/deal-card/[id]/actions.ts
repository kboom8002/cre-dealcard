"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { headers } from "next/headers";

/**
 * createMobileIMAction — Mobile IM Lite 자동 생성
 *
 * cre-fullim 외부 API 호출 방식을 제거하고 내부 API를 직접 호출합니다.
 * /api/broker/im-lite/generate → writer.ts → GPT-4o + 공공데이터
 *
 * [Full IM 핸드오프는 별도 full-im-handoff-button.tsx에서 유지]
 */
export async function createMobileIMAction(
  buildingId: string,
  options?: {
    monthly_rent_total_krw?: number;
    vacancy_status?: string;
    photo_urls?: string[];
    broker_highlight?: string;
    estimated_yield_pct?: number;
  }
) {
  try {
    const supabase = createServiceClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return { success: false, error: "인증이 필요합니다." };
    }

    // SSoT Lite에서 보강 데이터 자동 읽기 (supplemental 파라미터 우선)
    const { data: ssot } = await supabase
      .from("building_ssot_lite")
      .select("lease_summary, vacancy_signal, raw_address, ssot_data")
      .eq("building_id", buildingId)
      .maybeSingle();

    const leaseSummary = ssot?.lease_summary as Record<string, unknown> | null;
    const monthlyRentKrw = options?.monthly_rent_total_krw
      ?? (typeof leaseSummary?.monthly_rent_total_krw === "number" ? leaseSummary.monthly_rent_total_krw : undefined);
    const vacancyStatus = options?.vacancy_status
      ?? (ssot?.vacancy_signal ? String(ssot.vacancy_signal) : undefined);

    // 내부 API 직접 호출 (서버 액션 → API 라우트)
    const headersList = await headers();
    const host = headersList.get("host") ?? "localhost:3000";
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const baseUrl = `${protocol}://${host}`;

    const res = await fetch(`${baseUrl}/api/broker/im-lite/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 서버 액션은 쿠키 기반 세션을 포함하지 않으므로, service role 토큰으로 직접 통과
        // 실제 인증은 내부 API에서 auth.getUser()로 처리됨
        Cookie: headersList.get("cookie") ?? "",
      },
      body: JSON.stringify({
        building_id: buildingId,
        monthly_rent_total_krw: monthlyRentKrw,
        vacancy_status: vacancyStatus,
        photo_urls: options?.photo_urls ?? [],
        broker_highlight: options?.broker_highlight,
        estimated_yield_pct: options?.estimated_yield_pct,
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

