/**
 * Building Deduplication Service
 *
 * 동일 브로커(owner)가 이미 등록한 물건과 동일한 지번 주소를 가진 건물이
 * 있는지 탐지합니다. 딜카드 생성 전에 호출하여 중복 경고를 제공합니다.
 *
 * 매칭 전략 (우선순위):
 *   1. PNU 정확 매칭 (19자리 필지코드)
 *   2. 정규화된 지번 주소 매칭 ("OO동 NNN-NN" 패턴)
 *   3. 권역 + 자산유형 + 가격대 퍼지 매칭
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── 타입 ──────────────────────────────────────────────────────────────

export interface DuplicateCandidate {
  /** 기존 building_ssot_lite ID */
  existingBuildingId: string;
  /** 매칭 방식 */
  matchType: "pnu" | "jibun_exact" | "fuzzy_area";
  /** 매칭 신뢰도 (0~1) */
  confidence: number;
  /** 기존 물건 요약 (UI 표시용) */
  summary: {
    areaSignal: string | null;
    assetType: string | null;
    priceBand: string | null;
    createdAt: string | null;
    status: string | null;
  };
}

export interface DedupResult {
  /** 중복 후보가 있는지 여부 */
  hasDuplicate: boolean;
  /** 중복 후보 목록 (최대 3건) */
  candidates: DuplicateCandidate[];
}

// ── 지번 정규화 ───────────────────────────────────────────────────────

/**
 * 주소 문자열에서 핵심 지번 패턴을 추출합니다.
 * "서초구 서초동 1320-5" → "서초동 1320-5"
 * "강남구 역삼동 823" → "역삼동 823-0"
 */
export function extractJibunKey(text: string): string | null {
  if (!text) return null;

  const jibunPattern = /([가-힣]+[동리])\s+(\d{1,5})(?:-(\d{1,4}))?/;
  const match = text.match(jibunPattern);
  if (match) {
    const dong = match[1];
    const bun = match[2];
    const ji = match[3] || "0";
    return `${dong} ${bun}-${ji}`;
  }

  return null;
}

/**
 * 여러 필드에서 지번 키 추출을 시도합니다.
 * raw_address → raw_input → layers.location.address → area_signal 순서.
 */
export function extractJibunKeyFromBuilding(building: {
  raw_input?: string | null;
  layers?: Record<string, unknown> | null;
  area_signal?: string | null;
  raw_address?: string | null;
}): string | null {
  // 1. raw_address 직접 체크
  if (building.raw_address) {
    const key = extractJibunKey(building.raw_address);
    if (key) return key;
  }

  // 2. raw_input에서 추출
  if (building.raw_input) {
    const key = extractJibunKey(building.raw_input);
    if (key) return key;
  }

  // 3. layers.location.address
  const layers = building.layers as Record<string, unknown> | null;
  if (layers) {
    const location = layers.location as Record<string, unknown> | undefined;
    if (location) {
      const addr =
        (location.address as string | undefined) ||
        (location.raw_address as string | undefined) ||
        null;
      if (addr) {
        const key = extractJibunKey(addr);
        if (key) return key;
      }
    }

    // 4. layers.pnu → PNU 매칭 키로 변환
    const pnu = layers.pnu as string | undefined;
    if (pnu && pnu.length >= 10) return `PNU:${pnu}`;
  }

  // 5. area_signal에서 추출 (마지막 폴백)
  if (building.area_signal) {
    const key = extractJibunKey(building.area_signal);
    if (key) return key;
  }

  return null;
}

// ── 헬퍼 함수 ─────────────────────────────────────────────────────────

/** 메모 원문에서 19자리 PNU 코드를 추출합니다. */
function extractPnuFromMemo(memo: string): string | null {
  const pnuPattern = /\d{19}/;
  const match = memo.match(pnuPattern);
  return match ? match[0] : null;
}

/** 권역 신호를 정규화합니다. "서초구 잠원권역" → "잠원" */
function normalizeArea(area: string | null): string | null {
  if (!area) return null;
  return area
    .replace(/[구시군]\s*/g, "")
    .replace(/권역|권|동|이면|인근|도보\s*\d+분/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 4);
}

// ── 핵심 탐지 함수 ────────────────────────────────────────────────────

interface ExistingBuildingRow {
  id: string;
  raw_input: string | null;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
  layers: Record<string, unknown> | null;
  raw_address: string | null;
  status: string | null;
  created_at: string | null;
}

/**
 * 동일 owner의 기존 건물 중 동일한 물건이 있는지 탐지합니다.
 */
export async function detectDuplicateBuilding(
  supabase: SupabaseClient,
  ownerId: string,
  newMemo: string,
  newAreaSignal?: string | null,
  newAssetType?: string | null,
  newPriceBand?: string | null,
): Promise<DedupResult> {
  const EMPTY: DedupResult = { hasDuplicate: false, candidates: [] };

  const newJibunKey = extractJibunKey(newMemo);
  const newPnu = extractPnuFromMemo(newMemo);

  const { data: existingBuildings, error } = await supabase
    .from("building_ssot_lite")
    .select("id, raw_input, area_signal, asset_type, price_band, layers, raw_address, status, created_at")
    .eq("owner_id", ownerId)
    .in("status", ["public_signal_ready", "draft", "active"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !existingBuildings?.length) return EMPTY;

  const candidates: DuplicateCandidate[] = [];

  for (const existing of existingBuildings as ExistingBuildingRow[]) {
    // Strategy 1: PNU 매칭
    const existingLayers = existing.layers as Record<string, unknown> | null;
    const existingPnu = (existingLayers?.pnu as string | undefined) ?? null;

    if (existingPnu && newPnu && existingPnu === newPnu) {
      candidates.push({
        existingBuildingId: existing.id,
        matchType: "pnu",
        confidence: 0.99,
        summary: {
          areaSignal: existing.area_signal,
          assetType: existing.asset_type,
          priceBand: existing.price_band,
          createdAt: existing.created_at,
          status: existing.status,
        },
      });
      continue;
    }

    // Strategy 2: 지번 정확 매칭
    if (newJibunKey && !newJibunKey.startsWith("PNU:")) {
      const existingJibunKey = extractJibunKeyFromBuilding(existing);
      if (existingJibunKey && existingJibunKey === newJibunKey) {
        candidates.push({
          existingBuildingId: existing.id,
          matchType: "jibun_exact",
          confidence: 0.95,
          summary: {
            areaSignal: existing.area_signal,
            assetType: existing.asset_type,
            priceBand: existing.price_band,
            createdAt: existing.created_at,
            status: existing.status,
          },
        });
        continue;
      }
    }

    // Strategy 3: 권역 + 자산유형 + 가격대 퍼지 매칭
    if (newAreaSignal && newAssetType) {
      const areaMatch = normalizeArea(existing.area_signal) === normalizeArea(newAreaSignal);
      const typeMatch = existing.asset_type === newAssetType;
      const priceMatch = newPriceBand ? existing.price_band === newPriceBand : false;

      if (areaMatch && typeMatch && priceMatch) {
        candidates.push({
          existingBuildingId: existing.id,
          matchType: "fuzzy_area",
          confidence: 0.6,
          summary: {
            areaSignal: existing.area_signal,
            assetType: existing.asset_type,
            priceBand: existing.price_band,
            createdAt: existing.created_at,
            status: existing.status,
          },
        });
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const topCandidates = candidates.slice(0, 3);

  return {
    hasDuplicate: topCandidates.length > 0,
    candidates: topCandidates,
  };
}
