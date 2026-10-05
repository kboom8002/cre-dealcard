/**
 * IM 생성 후 매거진 추천 매물 스니펫 자동 추출 브릿지
 * - HeroCard에서 핵심 투자포인트 추출
 * - 블라인드 매물명 생성 (area_signal 기반)
 * - RPC append_magazine_deal_snippet 호출
 *
 * [C-05 / D2-26 / M2-29]
 *  - 동일 buildingId 는 `broker_profiles.pending_magazine_deals` 에 1건만 유지한다 (호출 전 조회로 dedupe).
 *  - 최근 MAX_PENDING_MAGAZINE_DEALS(20)건만 유지한다. 한도를 넘거나 기존 목록에 중복이 있으면
 *    정리된 목록으로 교체한다(RPC 는 append 전용이라 trim 불가).
 *  - export 시그니처(`extractAndAppendDealSnippet`)는 im-lite handler 가 dynamic import 하므로 불변.
 */
import { createServiceClient } from "@/lib/supabase/service";
import type { HeroCardData } from "@/domain/building/mobile-im/types";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('im-to-magazine-bridge');

/** pending_magazine_deals 에 유지할 최대 건수(최근 N건). */
export const MAX_PENDING_MAGAZINE_DEALS = 20;

export interface DealSnippet {
  buildingId: string;
  blindName: string;          // "성수 · 꼬마빌딩"
  investmentPoint: string;    // heroCard.keyInvestmentPoint
  assetType: string;          // "꼬마빌딩"
  priceBand: string;          // "50억"
  photoUrl: string | null;    // 대표사진
  imUrl: string;              // /im-lite/{buildingId}
  createdAt: string;          // ISO
}

export type PendingDealsPlan =
  | { action: "skip" }
  | { action: "append" }
  | { action: "replace"; list: DealSnippet[] };

/**
 * 순수 함수: 기존 pending 목록과 새 스니펫으로 어떤 조치를 할지 결정한다.
 *  - skip    : 이미 같은 buildingId 가 있고 기존 목록도 깨끗함 → 아무것도 하지 않음 (동일 건물 2회 → 1건)
 *  - append  : 새 건물이고 목록이 깨끗하며 한도 이내 → 원자적 RPC append
 *  - replace : 기존 목록에 중복/ID 없는 항목이 있거나 한도를 넘음 → 정리된 목록(최근 N건)으로 교체
 */
export function planPendingDeals(
  existing: unknown,
  snippet: Pick<DealSnippet, "buildingId"> & Partial<DealSnippet>,
  max: number = MAX_PENDING_MAGAZINE_DEALS,
): PendingDealsPlan {
  const raw = Array.isArray(existing) ? existing : [];
  // 같은 buildingId 는 마지막(최신) 항목만 유지, buildingId 없는 항목은 버린다
  const byId = new Map<string, DealSnippet>();
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const id = (d as { buildingId?: unknown }).buildingId;
    if (typeof id !== "string" || !id) continue;
    byId.delete(id);
    byId.set(id, d as DealSnippet);
  }
  const cleaned = Array.from(byId.values());
  const dirty = cleaned.length !== raw.length;

  if (byId.has(snippet.buildingId)) {
    return dirty ? { action: "replace", list: cleaned.slice(-max) } : { action: "skip" };
  }
  const next = [...cleaned, snippet as DealSnippet];
  if (!dirty && next.length <= max) return { action: "append" };
  return { action: "replace", list: next.slice(-max) };
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

    // 1) 기존 목록 조회 (dedupe/상한 판단). 조회 실패 시 중복 위험이 있어 append 하지 않는다.
    const { data: profile, error: readErr } = await supabase
      .from("broker_profiles")
      .select("pending_magazine_deals")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) {
      log.error("[im-to-magazine-bridge] pending_magazine_deals read failed — append skipped:", readErr);
      return;
    }
    if (!profile) {
      log.warn("[im-to-magazine-bridge] broker_profiles row not found — append skipped");
      return;
    }

    const plan = planPendingDeals(profile.pending_magazine_deals, snippet);
    if (plan.action === "skip") return;

    if (plan.action === "replace") {
      const { error: updErr } = await supabase
        .from("broker_profiles")
        .update({ pending_magazine_deals: plan.list })
        .eq("user_id", userId);
      if (updErr) log.error("[im-to-magazine-bridge] pending_magazine_deals trim/update failed:", updErr);
      return;
    }

    // 2) 새 건물 + 깨끗한 목록 + 한도 이내 → 기존 원자적 RPC append
    const { error } = await supabase.rpc("append_magazine_deal_snippet", {
      p_user_id: userId,
      p_snippet: snippet,
    });
    if (error) {
      log.error("[im-to-magazine-bridge] RPC error:", error);
    }
  } catch (err) {
    log.error("[im-to-magazine-bridge] Failed to call RPC:", err);
  }
}
