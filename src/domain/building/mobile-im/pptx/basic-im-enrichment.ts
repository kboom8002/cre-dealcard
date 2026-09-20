/**
 * @file basic-im-enrichment.ts
 * @description Basic IM 렌더링 전 외부 데이터 enrichment 함수.
 *
 * 프로덕션 API route와 Vitest 골든 테스트 모두 이 함수를 사용하여
 * 카카오맵/V-World 지적도를 일관되게 주입합니다.
 */

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('basic-im-enrichment');

export interface EnrichmentResult {
  cadastralMapImage?: string | null;
  hasCadastralMap: boolean;
  locationPoi?: Record<string, unknown> | null;
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
      const { getVWorldApiKey, getVWorldReferer } = await import('@/lib/external/vworld-config');
      const apiKey = getVWorldApiKey();
      const referer = getVWorldReferer();
      const searchAddr = encodeURIComponent(options.address);
      const geocodeUrl = `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&address=${searchAddr}&refine=true&simple=false&format=json&type=PARCEL&key=${apiKey}`;
      const geoRes = await fetch(geocodeUrl, { headers: { 'Referer': referer }, signal: AbortSignal.timeout(5000) });
      if (geoRes.ok) {
        const geoJson = await geoRes.json();
        const result = geoJson?.response?.result;
        if (result?.point) {
          pnu = result.id; // V-World returns PNU as result.id
        }
      }
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

  return result;
}
