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
import type { LandmarkPool } from '@/lib/external/landmark-pool';
import type { LandUsePlanData, LandUseRegulationSummary } from '@/lib/external/land-use-api';

export interface EnrichmentResult {
  cadastralMapImage?: string | null;
  hasCadastralMap: boolean;
  locationPoi?: Record<string, unknown> | null;
  /**
   * 입지 지도 렌더 전용 랜드마크 후보 풀 (Kakao 다중 쿼리 + V-World 건축물대장 조인).
   * ⚠ LLM 프롬프트에 직렬화되는 locationPoi(keySpots/nearestStation/poiCounts)와 별개 필드 — externalData 에 부착하지 않는다.
   */
  landmarkPool?: LandmarkPool | null;
  /** 공시지가 10년 추이 (수익률 슬라이드용) */
  landPriceHistory?: LandPriceHistoryResult | null;
  /** 토지이용계획 (F-07) */
  landUsePlan?: (Partial<LandUsePlanData> & {
    zoningShares?: Array<{ zoneName: string; areaSqm?: number; ratioPct: number }>;
  }) | null;
  /** 토지이용계획확인원 법령별 지역·지구 지정 현황 (V-World getLandUseAttr) */
  landUseRegulations?: LandUseRegulationSummary | null;
  /** K-apt / 건축물대장 총괄표제부 인근 공동주택 세대수 집계 (R5 배후세대) */
  apartmentHouseholds?: {
    totalHouseholds: number;
    complexCount: number;
    topComplexes?: Array<{ name: string; households: number; distanceM?: number }>;
  } | null;
  /**
   * 다필지: 필지별 용도지역 (대표 필지 포함, 조회 성공분만).
   * 2필지 이상일 때만 채워진다 — 필지마다 용도지역이 다를 수 있어 대표 필지 값만 쓰면 오표기 위험.
   */
  landUseByParcel?: Array<{ pnu: string; zoningDistrict: string }> | null;
}

export type BasicImEnrichment = EnrichmentResult;

/** 다필지 필지별 용도지역 조회 상한 (외부 API 호출 폭주 방지) */
const MAX_PARCEL_LANDUSE_LOOKUPS = 10;

/** OFFLINE_RENDER=1 일 때 enrichForBasicIm 이 대신 반환할 스냅샷 enrichment (scripts/golden-snapshot 전용) */
let _offlineEnrichment: Partial<EnrichmentResult> | null = null;
export function setOfflineEnrichment(e: Partial<EnrichmentResult> | null): void {
  _offlineEnrichment = e;
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
  options?: {
    pnu?: string;
    pnus?: string[];
    address?: string;
    landAreaSqm?: number;
    /** 랜드마크 풀 추가 쿼리군 결정용 (development/owner → IC, operating → 관광/호텔) */
    posture?: string | null;
    assetType?: string | null;
    /** 오프라인/골든: 주입 시 네트워크·캐시 없이 이 풀을 사용 */
    landmarkPoolFixture?: LandmarkPool | null;
  },
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    cadastralMapImage: null,
    hasCadastralMap: false,
    locationPoi: null,
    landPriceHistory: null,
    landUseRegulations: null,
  };

  // 오프라인 재렌더(scripts/golden-snapshot): 외부 API 호출 없이 스냅샷에 저장된 enrichment 만 사용 (기본 동작 불변)
  if (process.env.OFFLINE_RENDER === '1') return { ...result, ...(_offlineEnrichment ?? {}) };

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

  // PNU가 없는 경우 주소로부터 PNU 자동 조회
  if (!pnu && options?.address) {
    try {
      const { resolveAddress } = await import('@/lib/external/address-resolver');
      const resolved = await resolveAddress(options.address);
      if (resolved?.pnu) {
        pnu = resolved.pnu;
        log.info(`[enrichForBasicIm] 주소로부터 PNU 자동 조회 성공: ${pnu} (${options.address})`);
      }
    } catch (err) {
      console.warn('[basic-im-enrichment] PNU auto-fetch failed:', err);
    }
  }

  // 대지면적 기반 적응형 줌 반경 산출 (필지가 지면의 10% 이상, 15~25%를 채우도록 확대)
  const landArea = options?.landAreaSqm || 500;
  const parcelSide = Math.sqrt(Number(landArea) || 500);
  const adaptiveRadiusM = Math.max(45, Math.min(150, Math.round(parcelSide * 2.5)));
  log.info(`[enrichForBasicIm] 지적도 적응형 반경 산출: ${landArea}㎡ → ${adaptiveRadiusM}m (PNU: ${pnu || '없음'})`);

  try {
    const { fetchCadastralMapImage } = await import('@/lib/external/vworld-wms-cadastral');
    const cadastral = await fetchCadastralMapImage(
      coordinates.lat,
      coordinates.lng,
      1120, 840, adaptiveRadiusM,
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

  // 2.1 입지 지도 렌더 전용 랜드마크 후보 풀 (결정론적 다중 소스, 30일 캐시) — 실패 시 레거시 후보로 폴백
  // 포스처/픽스처 없는 호출(writer 단계, 결과 미사용)에서는 불필요한 외부 호출을 하지 않는다.
  if (options?.posture || options?.landmarkPoolFixture) try {
    const { resolveLandmarkPool } = await import('@/lib/external/landmark-pool');
    const pool = await resolveLandmarkPool(coordinates, {
      posture: options?.posture,
      assetType: options?.assetType,
      fixture: options?.landmarkPoolFixture ?? null,
    });
    if (pool) result.landmarkPool = pool;
  } catch (err) {
    log.warn('[enrichForBasicIm] 랜드마크 후보 풀 실패 (레거시 후보 폴백):', err);
  }

  // 2.5 토지이용계획 (F-07) + 토지이용계획확인원 법령별 지역·지구 (getLandUseAttr)
  if (pnu) {
    try {
      const { fetchLandUsePlan, fetchLandUseRegulations } = await import('@/lib/external/land-use-api');
      const [lup, regs] = await Promise.all([
        fetchLandUsePlan(pnu).catch((err) => {
          console.warn('[basic-im-enrichment] landUsePlan fetch failed:', err);
          return null;
        }),
        fetchLandUseRegulations(pnu).catch((err) => {
          console.warn('[basic-im-enrichment] landUseRegulations fetch failed:', err);
          return null;
        }),
      ]);
      if (lup && lup.zoningDistrict) {
        result.landUsePlan = lup;
      }
      if (regs && (regs.nationalLaw || regs.otherLaws)) {
        result.landUseRegulations = regs;
      }

      // 복수 용도지역(2개 이상) 혼재 필지일 때 WFS 폴리곤 교차로 용도지역별 비율 산출
      const candidateZones = Array.from(
        new Set(
          [
            result.landUsePlan?.zoningDistrict,
            ...(result.landUsePlan?.zoningOverlap || []),
            ...(result.landUseRegulations?.nationalItems?.map((i) => i.name) || []),
          ]
            .map((z) =>
              String(z || '')
                .replace(/\((?:포함|저촉|접합|접함)\)$/g, '')
                .trim(),
            )
            .filter(Boolean),
        ),
      );
      const specificUseZones = candidateZones.filter(
        (z) => /지역$/.test(z) && z !== '도시지역',
      );
      if (specificUseZones.length >= 2) {
        try {
          const { fetchParcelZoningShares } = await import('@/lib/external/zoning-share-wfs');
          const shares = await fetchParcelZoningShares(pnu, candidateZones);
          const validShares = shares.filter((s) => s.ratioPct > 0);
          if (validShares.length >= 2) {
            result.landUsePlan = {
              ...(result.landUsePlan || {}),
              zoningShares: validShares,
            };
          }
        } catch (err) {
          console.warn('[basic-im-enrichment] zoningShares WFS fetch failed:', err);
        }
      }
    } catch (err) {
      console.warn('[basic-im-enrichment] landUsePlan/Regulations fetch failed:', err);
    }
  }

  // 2.6 다필지: 필지별 용도지역 (추가 필지 병렬 조회, 실패 필지는 생략 — 값을 만들어내지 않음)
  if (pnu && additionalPnus && additionalPnus.length > 0) {
    try {
      const { fetchLandUsePlan } = await import('@/lib/external/land-use-api');
      const targets = [pnu, ...additionalPnus].slice(0, MAX_PARCEL_LANDUSE_LOOKUPS);
      const settled = await Promise.all(targets.map(async (p) => {
        if (p === pnu && result.landUsePlan?.zoningDistrict) {
          return { pnu: p, zoningDistrict: result.landUsePlan.zoningDistrict };
        }
        try {
          const r = await fetchLandUsePlan(p);
          return r?.zoningDistrict ? { pnu: p, zoningDistrict: r.zoningDistrict as string } : null;
        } catch {
          return null;
        }
      }));
      const ok = settled.filter((x): x is { pnu: string; zoningDistrict: string } => !!x);
      if (ok.length > 0) result.landUseByParcel = ok;
    } catch (err) {
      console.warn('[basic-im-enrichment] landUseByParcel fetch failed:', err);
    }
  }

  // 3. 공시지가 10년 추이 (수익률 슬라이드용) + K-apt 배후 공동주택 세대수 (입지 슬라이드용) 병렬 조회
  if (pnu) {
    await Promise.all([
      (async () => {
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
      })(),
      (async () => {
        if (pnu.length < 10) return;
        try {
          const { fetchNearbyApartmentHouseholds } = await import('@/lib/external/kapt-api');
          const kapt = await fetchNearbyApartmentHouseholds({
            lat: coordinates.lat,
            lng: coordinates.lng,
            sigunguCd: pnu.slice(0, 5),
            bjdongCd: pnu.slice(5, 10),
          });
          if (kapt && kapt.totalHouseholds > 0) {
            result.apartmentHouseholds = {
              totalHouseholds: kapt.totalHouseholds,
              complexCount: kapt.complexCount,
              topComplexes: kapt.topComplexes,
            };
            if (result.locationPoi && typeof result.locationPoi === 'object') {
              result.locationPoi.apartmentHouseholds = kapt.totalHouseholds;
              result.locationPoi.apartmentComplexCount = kapt.complexCount;
              result.locationPoi.apartmentTopComplexes = kapt.topComplexes;
            } else {
              result.locationPoi = {
                apartmentHouseholds: kapt.totalHouseholds,
                apartmentComplexCount: kapt.complexCount,
                apartmentTopComplexes: kapt.topComplexes,
              };
            }
          }
        } catch (err) {
          log.warn('[enrichForBasicIm] K-apt 세대수 조회 실패 (graceful skip):', err);
        }
      })(),
    ]);
  }

  return result;
}
