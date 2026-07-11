/**
 * IM 생성 후 매거진 추천 매물 스니펫 자동 추출 브릿지
 * - HeroCard에서 핵심 투자포인트 추출
 * - 블라인드 매물명 생성 (area_signal 기반)
 * - RPC append_magazine_deal_snippet 호출
 */
import { createServiceClient } from "@/lib/supabase/service";
import type { HeroCardData } from "@/domain/building/mobile-im/types";

interface DealSnippet {
  buildingId: string;
  blindName: string;          // "성수 · 꼬마빌딩"
  investmentPoint: string;    // heroCard.keyInvestmentPoint
  assetType: string;          // "꼬마빌딩"
  priceBand: string;          // "50억"
  photoUrl: string | null;    // 대표사진
  imUrl: string;              // /im-lite/{buildingId}
  createdAt: string;          // ISO
}

export async function extractAndAppendDealSnippet(opts: {
  userId: string;
  buildingId: string;
  heroCard: HeroCardData;
  ssot: { area_signal?: string; asset_type?: string; price_band?: string };
  photoUrls?: string[];
}): Promise<void> {
  const { userId, buildingId, heroCard, ssot, photoUrls } = opts;

  // 블라인드 매물명: 성수 · 꼬마빌딩
  const blindName = [ssot.area_signal, ssot.asset_type]
    .filter(Boolean)
    .join(" · ") || "미공개 매물";

  const snippet: DealSnippet = {
    buildingId,
    blindName,
    investmentPoint: heroCard.keyInvestmentPoint || "",
    assetType: heroCard.assetType || ssot.asset_type || "",
    priceBand: heroCard.askingPriceDisplay || ssot.price_band || "",
    photoUrl: photoUrls?.[0] ?? null,
    imUrl: `/im-lite/${buildingId}`,
    createdAt: new Date().toISOString(),
  };

  try {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("append_magazine_deal_snippet", {
      p_user_id: userId,
      p_snippet: snippet,
    });
    if (error) {
      console.error("[im-to-magazine-bridge] RPC error:", error);
    }
  } catch (err) {
    console.error("[im-to-magazine-bridge] Failed to call RPC:", err);
  }
}
