"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateMobileIMHandler } from "@/app/api/broker/im-lite/generate/handler";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";

/**
 * createMobileIMAction — Mobile IM Lite 자동 생성
 *
 * v3 — self-fetch 제거. handler.ts를 직접 호출하여 데드락 방지.
 */
export async function createMobileIMAction(
  buildingId: string,
  options?: {
    monthly_rent_total_krw?: number;
    vacancy_status?: string;
    photo_urls?: string[];
    broker_highlight?: string;
    estimated_yield_pct?: number;
    direct_data?: Record<string, unknown>;
    vacancy_pct?: number;
    resolved_address?: string;
    resolved_pnu?: string;
    total_deposit_manwon?: number;
    mgmt_fee_total_manwon?: number;
    loan_amount_manwon?: number;
    asking_price_manwon?: number;
    photo_captions?: Record<number, string>;
    logistics?: MobileIMSupplementalInput["logistics"];
  }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "인증이 필요합니다." };
    }

    // 핸들러 직접 호출 (self-fetch 제거)
    const supplemental: MobileIMSupplementalInput = {
      monthly_rent_total_krw: options?.monthly_rent_total_krw,
      vacancy_status: options?.vacancy_status,
      vacancy_pct: options?.vacancy_pct,
      resolved_address: options?.resolved_address,
      resolved_pnu: options?.resolved_pnu,
      photo_urls: options?.photo_urls ?? [],
      photo_captions: options?.photo_captions,
      broker_highlight: options?.broker_highlight,
      estimated_yield_pct: options?.estimated_yield_pct,
      total_deposit_manwon: options?.total_deposit_manwon,
      mgmt_fee_total_manwon: options?.mgmt_fee_total_manwon,
      loan_amount_manwon: options?.loan_amount_manwon,
      asking_price_manwon: options?.asking_price_manwon,
      logistics: options?.logistics,
    };

    const result = await generateMobileIMHandler({
      buildingId,
      userId: user.id,
      supplemental,
      skipApproval: false,
      directData: options?.direct_data ?? null,
    });

    if (!result.ok) {
      // Readiness 부족 → 사용자 친화 에러 메시지
      if (result.statusCode === 400 && result.missing) {
        return {
          success: false,
          error: `데이터가 부족합니다 (${result.score}점 / ${result.threshold}점 기준). 누락 항목: ${result.missing.join(", ")}`,
          readiness: { score: result.score, missing: result.missing },
        };
      }
      return { success: false, error: result.error ?? "알 수 없는 오류가 발생했습니다." };
    }

    return {
      success: true,
      url: result.url,
      reviewUrl: result.im_lite_id ? `/broker/im-approval/${result.im_lite_id}` : result.url,
      im_lite_id: result.im_lite_id,
      ai_used: result.ai_used,
      sections_count: result.sections_count,
      message: result.message,
    };
  } catch (err: any) {
    console.error("[createMobileIMAction] Error:", err);
    return { success: false, error: err?.message ?? "알 수 없는 오류가 발생했습니다." };
  }
}
