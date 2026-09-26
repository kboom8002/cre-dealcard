/**
 * @file basic-im-enrichment.ts
 * @description Basic IM 렌더링 전 외부 데이터 enrichment 함수.
 *
 * 프로덕션 API route와 Vitest 골든 테스트 모두 이 함수를 사용하여
 * 카카오맵/V-World 지적도를 일관되게 주입합니다.
 */

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('basic-im-enrichment');

import type { LandPriceHistoryResult } from '@/lib/external/land-price-api';

export interface EnrichmentResult {
  cadastralMapImage?: string | null;
  hasCadastralMap: boolean;
  locationPoi?: Record<string, unknown> | null;
  /** 공시지가 10년 추이 (수익률 슬라이드용) */
  landPriceHistory?: LandPriceHistoryResult | null;
}

/**
 * Basic IM enrichment: 좌표 기반으로 카카오맵/V-World 지적도 데이터를 자동 수집.
 * 프로덕션과 테스트 모두 이 함수를 호출하여 데이터 차이를 제거합니다.
 *
 * @param coordinates - WGS84 좌표 { lat, lng }
 * @param options - 선택적 PNU (지적도 정밀 조회용)
 * @returns enrichment 결과 (실패 시 graceful null)
 */
export async function enrichForBasicIm(
  coordinates: { lat: number; lng: number },
  options?: { pnu?: string; pnus?: string[]; address?: string },
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    cadastralMapImage: null,
    hasCadastralMap: false,
    locationPoi: null,
    landPriceHistory: null,
  };

  if (!coordinates?.lat || !coordinates?.lng) {
    log.warn('[enrichForBasicIm] 좌표 미제공 — enrichment 생략');
    return result;
  }

  // 1. V-World 지적도
  let pnu = options?.pnu;
  const pnus = (options?.pnus || []).filter(Boolean);
  if (!pnu && pnus.length > 0) {
    pnu = pnus[0];
  }
  const additionalPnus = pnus.length > 1 ? pnus.filter(p => p !== pnu) : undefined;

  if (!pnu && options?.address) {
    try {
      log.info('[enrichForBasicIm] PNU 미제공 — 주소 기반 지적도는 필지 경계선 없이 렌더링됩니다');
    } catch (err) {
      console.warn('[basic-im-enrichment] PNU auto-fetch failed:', err);
    }
  }

  try {
    const { fetchCadastralMapImage } = await import('@/lib/external/vworld-wms-cadastral');
    const cadastral = await fetchCadastralMapImage(
      coordinates.lat,
      coordinates.lng,
      1120, 840, 150,
      pnu,
      additionalPnus,
    );
    if (cadastral) {
      result.cadastralMapImage = cadastral.base64;
      result.hasCadastralMap = true;
      log.info(`[enrichForBasicIm] 지적도 획득: ${(cadastral.buffer.length / 1024).toFixed(0)}KB`);
    }
  } catch (err) {
    log.warn('[enrichForBasicIm] V-World 지적도 실패 (graceful skip):', err);
  }

  // 2. 카카오 POI (역/랜드마크) — 선택적
  try {
    const { fetchLocationPoi } = await import('@/lib/external/kakao-map-api');
    const poi = await fetchLocationPoi(coordinates.lat, coordinates.lng);
    if (poi) {
      result.locationPoi = poi as unknown as Record<string, unknown>;
    }
  } catch {
    // POI는 선택적 — 실패 시 무시
  }

  // 3. 공시지가 10년 추이 (수익률 슬라이드용) — PNU 필수
  if (pnu) {
    try {
      const { fetchLandPriceHistory } = await import('@/lib/external/land-price-api');
      const history = await fetchLandPriceHistory(pnu, 10);
      if (history) {
        result.landPriceHistory = history;
        log.info(`[enrichForBasicIm] 공시지가 ${history.history.length}개년 조회 (CAGR ${history.cagrPct ?? 'N/A'}%)`);
      }
    } catch (err) {
      log.warn('[enrichForBasicIm] 공시지가 추이 조회 실패 (graceful skip):', err);
    }
  }

  return result;
}
