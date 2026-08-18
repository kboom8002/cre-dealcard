/**
 * Canonical Property Service
 *
 * 물리 건물 1건 = canonical_properties 1 row.
 * PNU 기반 UNIQUE 제약으로 동일 필지를 하나의 정규 엔티티로 통합합니다.
 *
 * 딜카드 생성 시 호출되어:
 *   1. 메모/지오코딩에서 PNU 또는 지번 주소를 추출
 *   2. canonical_properties에서 기존 매칭 검색
 *   3. 없으면 새로 생성, 있으면 기존 ID 반환
 *   4. building_ssot_lite.canonical_property_id에 FK 연결
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractJibunKey } from "./building-dedup";

// ── 타입 ──────────────────────────────────────────────────────────────

export interface CanonicalProperty {
  id: string;
  pnu: string | null;
  road_address: string | null;
  jibun_address: string | null;
  dong_name: string | null;
  coordinates: { lat: number; lng: number } | null;
  sigungu_cd: string | null;
  bjdong_cd: string | null;
  bun: string | null;
  ji: string | null;
  verified: boolean;
}

export interface LinkResult {
  canonicalPropertyId: string;
  isNew: boolean;
}

// ── 핵심 함수 ─────────────────────────────────────────────────────────

/**
 * PNU 또는 지번 주소로 canonical_property를 찾거나 새로 생성합니다.
 * 그 후 해당 building_ssot_lite에 FK를 연결합니다.
 */
export async function linkBuildingToCanonicalProperty(
  supabase: SupabaseClient,
  buildingId: string,
  context: {
    pnu?: string | null;
    jibunAddress?: string | null;
    roadAddress?: string | null;
    dongName?: string | null;
    coordinates?: { lat: number; lng: number } | null;
    sigunguCd?: string | null;
    bjdongCd?: string | null;
    bun?: string | null;
    ji?: string | null;
  },
): Promise<LinkResult | null> {
  // PNU가 없고 지번도 없으면 링크 불가
  if (!context.pnu && !context.jibunAddress) return null;

  let canonicalId: string | null = null;
  let isNew = false;

  // ── Strategy 1: PNU로 기존 검색 ──
  if (context.pnu) {
    const { data: existing } = await supabase
      .from("canonical_properties")
      .select("id")
      .eq("pnu", context.pnu)
      .limit(1)
      .maybeSingle();

    if (existing) {
      canonicalId = existing.id;
    } else {
      // 새로 생성
      const { data: created, error } = await supabase
        .from("canonical_properties")
        .insert({
          pnu: context.pnu,
          road_address: context.roadAddress ?? null,
          jibun_address: context.jibunAddress ?? null,
          dong_name: context.dongName ?? null,
          coordinates: context.coordinates ?? null,
          sigungu_cd: context.sigunguCd ?? null,
          bjdong_cd: context.bjdongCd ?? null,
          bun: context.bun ?? null,
          ji: context.ji ?? null,
          verified: false,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        // UNIQUE 충돌 시 (race condition) 기존 것 조회
        if (error.code === "23505") {
          const { data: raced } = await supabase
            .from("canonical_properties")
            .select("id")
            .eq("pnu", context.pnu)
            .limit(1)
            .maybeSingle();
          canonicalId = raced?.id ?? null;
        } else {
          console.warn("[canonical-property] Insert failed:", error.message);
          return null;
        }
      } else {
        canonicalId = created?.id ?? null;
        isNew = true;
      }
    }
  }

  // ── Strategy 2: PNU 없이 지번 주소로 퍼지 검색 ──
  if (!canonicalId && context.jibunAddress) {
    const jibunKey = extractJibunKey(context.jibunAddress);
    if (jibunKey) {
      const { data: fuzzyMatch } = await supabase
        .from("canonical_properties")
        .select("id")
        .ilike("jibun_address", `%${jibunKey.replace(/-0$/, "")}%`)
        .limit(1)
        .maybeSingle();

      if (fuzzyMatch) {
        canonicalId = fuzzyMatch.id;
      } else {
        // 새로 생성 (PNU 없는 부분 매칭용)
        const { data: created } = await supabase
          .from("canonical_properties")
          .insert({
            pnu: null,
            road_address: context.roadAddress ?? null,
            jibun_address: context.jibunAddress ?? null,
            dong_name: context.dongName ?? null,
            coordinates: context.coordinates ?? null,
            sigungu_cd: context.sigunguCd ?? null,
            bjdong_cd: context.bjdongCd ?? null,
            bun: context.bun ?? null,
            ji: context.ji ?? null,
            verified: false,
          })
          .select("id")
          .maybeSingle();

        canonicalId = created?.id ?? null;
        isNew = !!canonicalId;
      }
    }
  }

  if (!canonicalId) return null;

  // ── building_ssot_lite에 FK 연결 ──
  await supabase
    .from("building_ssot_lite")
    .update({ canonical_property_id: canonicalId })
    .eq("id", buildingId);

  return { canonicalPropertyId: canonicalId, isNew };
}

/**
 * canonical_property_id 기준으로 동일 물리 건물의 모든 딜카드를 조회합니다.
 */
export async function getDealCardsForProperty(
  supabase: SupabaseClient,
  canonicalPropertyId: string,
): Promise<Array<{ id: string; owner_id: string | null; area_signal: string | null; status: string | null; created_at: string }>> {
  const { data, error } = await supabase
    .from("building_ssot_lite")
    .select("id, owner_id, area_signal, status, created_at")
    .eq("canonical_property_id", canonicalPropertyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[canonical-property] Query failed:", error.message);
    return [];
  }

  return data ?? [];
}
