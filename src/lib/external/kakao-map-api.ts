
import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('kakao-map-api');

// src/lib/external/kakao-map-api.ts
// 카카오 로컬 API — 최근접 지하철역, 반경 500m POI 카운트, 주요 스폿 좌표

export interface PoiSpot {
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  category: 'subway' | 'landmark' | 'hospital' | 'university' | 'shopping' | 'public';
}

export interface LocationPoiData {
  nearestStation: {
    name: string;
    lat: number;
    lng: number;
    distanceM: number;
    walkMinutes: number;
  } | null;
  poiCounts: {
    subway: number;
    busStop: number;
    cafe: number;
    parking: number;
    restaurant: number;
    convenience: number;
  };
  /** 지도 오버레이용 주요 스폿 (최대 5개) */
  keySpots: PoiSpot[];
  _isFallback?: boolean;
}

export async function fetchLocationPoi(lat: number, lng: number): Promise<LocationPoiData | null> {
  if (!lat || !lng || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)
      || lat < 33 || lat > 43 || lng < 124 || lng > 132) {
    log.warn({ latlng: { lat, lng } }, '[kakao-map-api] Invalid coordinates, returning null:');
    return null;
  }

  const restKey = process.env.KAKAO_REST_API_KEY || process.env.NEXT_PUBLIC_KAKAO_APP_KEY;

  if (restKey && restKey !== "") {
    try {
      // ── 1. 지하철역 (1km 반경, 최대 5개) ──
      const stationUrl = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&y=${lat}&x=${lng}&radius=2000&sort=distance&size=8`;
      let stations: any[] = [];
      try {
        const stationRes = await fetch(stationUrl, {
          headers: { Authorization: `KakaoAK ${restKey}` },
          signal: AbortSignal.timeout(3000),
        });
        if (!stationRes.ok) {
          log.warn(`[kakao-map-api] Station search returned HTTP ${stationRes.status} (401/429/error)`);
        } else {
          const stationData = await stationRes.json();
          stations = stationData?.documents || [];
        }
      } catch (err) {
        log.warn({ err: err }, '[kakao-map-api] Station search failed:');
      }

      let nearestStation: LocationPoiData['nearestStation'] = null;
      const keySpots: PoiSpot[] = [];

      // 모든 역을 keySpots에 추가 (좌표 포함)
      for (const s of stations) {
        const sLat = parseFloat(s.y);
        const sLng = parseFloat(s.x);
        const distanceM = parseInt(s.distance, 10) || 500;
        if (!isNaN(sLat) && !isNaN(sLng)) {
          keySpots.push({
            name: String(s.place_name).replace(/역$/, '') + '역',
            lat: sLat,
            lng: sLng,
            distanceM,
            category: 'subway',
          });
        }
      }

      if (stations.length > 0) {
        const topStation = stations[0];
        const distanceM = parseInt(topStation.distance, 10) || 500;
        const walkMinutes = Math.max(1, Math.round(distanceM / 80));
        nearestStation = {
          name: String(topStation.place_name),
          lat: parseFloat(topStation.y) || lat,
          lng: parseFloat(topStation.x) || lng,
          distanceM,
          walkMinutes,
        };
      }

      // ── 2. 주변 POI 카운트 (500m) ──
      const counts: Record<string, number> = {
        subway: stations.length, busStop: 0, cafe: 0, parking: 0, restaurant: 0, convenience: 0,
      };

      const categories = [
        { key: "busStop", code: "BZ2" },
        { key: "cafe", code: "CE7" },
        { key: "parking", code: "PK6" },
        { key: "restaurant", code: "FD6" },
        { key: "convenience", code: "CS2" },
      ];

      await Promise.all(
        categories.map(async (cat) => {
          try {
            const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${cat.code}&y=${lat}&x=${lng}&radius=500&size=15`;
            const res = await fetch(url, {
              headers: { Authorization: `KakaoAK ${restKey}` },
              signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) {
              if (res.status === 401 || res.status === 429) {
                log.warn(`[kakao-map-api] POI search HTTP ${res.status} for category ${cat.key}`);
              }
              return;
            }
            const data = await res.json();
            counts[cat.key] = data?.meta?.total_count || data?.documents?.length || 0;
          } catch {
            // 개별 카테고리 실패 시 디폴트값 유지
          }
        })
      );

      // ── 3. 상권 랜드마크 (대형마트, 백화점, 대학, 병원, 공공기관 — 2km) ──
      const landmarkCategories = [
        { code: "MT1", category: 'shopping' as const },  // 대형마트
        { code: "HP8", category: 'hospital' as const },   // 병원
        { code: "SC4", category: 'university' as const }, // 학교(대학)
        { code: "PO3", category: 'public' as const },  // 공공기관 (구청, 시청, 경찰서 등)
      ];

      await Promise.all(
        landmarkCategories.map(async (lm) => {
          try {
            const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${lm.code}&y=${lat}&x=${lng}&radius=2000&sort=distance&size=8`;
            const res = await fetch(url, {
              headers: { Authorization: `KakaoAK ${restKey}` },
              signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) {
              if (res.status === 401 || res.status === 429) {
                log.warn(`[kakao-map-api] Landmark search HTTP ${res.status} for category ${lm.category}`);
              }
              return;
            }
            const data = await res.json();
            const docs = data?.documents || [];
            for (const doc of docs) {
              const dLat = parseFloat(doc.y);
              const dLng = parseFloat(doc.x);
              const distanceM = parseInt(doc.distance, 10) || 500;
              if (!isNaN(dLat) && !isNaN(dLng)) {
                // 대학교만 필터 (초/중/고 제외)
                if (lm.code === 'SC4') {
                  const name = String(doc.place_name);
                  if (!name.includes('대학') && !name.includes('University')) continue;
                }
                // 대형 병원만 필터 (약국, 의원 제외)
                if (lm.code === 'HP8') {
                  const name = String(doc.place_name);
                  if (!name.includes('병원') && !name.includes('의료원')) continue;
                }
                keySpots.push({
                  name: String(doc.place_name),
                  lat: dLat,
                  lng: dLng,
                  distanceM,
                  category: lm.category,
                });
              }
            }
          } catch {
            // 랜드마크 조회 실패 시 무시
          }
        })
      );
      // keySpots 중복 제거 및 5개 제한 (역 우선, 거리순)
      // ── 3.5 F5: 키워드 기반 보충 검색 (백화점, 아파트단지, 대형 상업시설) ──
      const keywordSearchTerms = ['백화점', '아파트단지', '쇼핑몰'];
      await Promise.all(
        keywordSearchTerms.map(async (keyword) => {
          try {
            const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}&y=${lat}&x=${lng}&radius=2000&sort=distance&size=3`;
            const res = await fetch(url, {
              headers: { Authorization: `KakaoAK ${restKey}` },
              signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) return;
            const data = await res.json();
            const docs = data?.documents || [];
            for (const doc of docs) {
              const dLat = parseFloat(doc.y);
              const dLng = parseFloat(doc.x);
              const distanceM = parseInt(doc.distance, 10) || 500;
              if (!isNaN(dLat) && !isNaN(dLng) && distanceM <= 2500) {
                keySpots.push({
                  name: String(doc.place_name),
                  lat: dLat,
                  lng: dLng,
                  distanceM,
                  category: 'landmark' as const,
                });
              }
            }
          } catch {
            // 키워드 검색 실패 시 무시
          }
        })
      );

      const uniqueSpots = keySpots.reduce((acc, spot) => {
        const exists = acc.find(s => Math.abs(s.lat - spot.lat) < 0.0001 && Math.abs(s.lng - spot.lng) < 0.0001);
        if (!exists) acc.push(spot);
        return acc;
      }, [] as PoiSpot[]);

      // 카테고리 쿼터제: 지하철 max 2개 + 비지하철 min 3개 보장
      const subways = uniqueSpots.filter(s => s.category === 'subway').slice(0, 2);
      const others = uniqueSpots.filter(s => s.category !== 'subway')
        .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
        .slice(0, 4);
      const balancedSpots = [...subways, ...others].slice(0, 5);

      return {
        nearestStation,
        poiCounts: {
          subway: counts.subway, busStop: counts.busStop, cafe: counts.cafe,
          parking: counts.parking, restaurant: counts.restaurant, convenience: counts.convenience,
        },
        keySpots: balancedSpots,
      };
    } catch (err) {
      log.warn({ err: err }, "[kakao-map-api] API failed, returning null to prevent hallucination:");
    }
  }

  return null;
}
