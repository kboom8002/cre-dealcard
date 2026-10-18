/**
 * @file kapt-api.ts
 * @description 국토교통부 공동주택 단지 목록/기본정보(K-apt) Open API 클라이언트 (R5 배후 세대수)
 *
 * - 법정동코드(10자리 = sigunguCd 5자리 + bjdongCd 5자리) 기반 단지 목록(`getLegaldongAptList3`) 및
 *   단지별 세대수(`getAphusBassInfoV3` -> `kaptdaCnt`) 조회
 * - API 키 미설정 또는 호출 실패 시 절대 추정치를 생성하지 않고 `{ totalHouseholds: 0, complexCount: 0, topComplexes: [], source: 'none' }` 반환
 */

import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('kapt-api');

export interface NearbyApartmentComplex {
  name: string;
  households: number;
  distanceM?: number;
}

export interface NearbyApartmentHouseholdsResult {
  totalHouseholds: number;
  complexCount: number;
  topComplexes: NearbyApartmentComplex[];
  source: 'kapt_api' | 'none';
}

const EMPTY_RESULT: NearbyApartmentHouseholdsResult = {
  totalHouseholds: 0,
  complexCount: 0,
  topComplexes: [],
  source: 'none',
};

const MAX_CACHE_ENTRIES = 200;
const kaptCache = new Map<string, NearbyApartmentHouseholdsResult>();

export function clearKaptCache(): void {
  kaptCache.clear();
}

function normalizeItemsArray(rawItems: any): any[] {
  if (!rawItems) return [];
  if (Array.isArray(rawItems)) return rawItems;
  if (Array.isArray(rawItems.item)) return rawItems.item;
  if (rawItems.item && typeof rawItems.item === 'object') return [rawItems.item];
  if (typeof rawItems === 'object' && (rawItems.kaptCode || rawItems.kaptName)) return [rawItems];
  return [];
}

/**
 * 법정동(시군구 5자리 + 법정동 5자리) 내 K-apt 의무관리대상 공동주택 단지 세대수를 조회합니다.
 */
export async function fetchNearbyApartmentHouseholds(params: {
  lat: number;
  lng: number;
  sigunguCd?: string;
  bjdongCd?: string;
  radiusM?: number;
}): Promise<NearbyApartmentHouseholdsResult> {
  const apiKey = (
    process.env.DATA_GO_KR_API_KEY ||
    process.env.PUBLIC_DATA_API_KEY ||
    ''
  ).trim();
  if (!apiKey) {
    return { ...EMPTY_RESULT, topComplexes: [] };
  }

  const sigunguCd = String(params?.sigunguCd || '').trim();
  const bjdongCd = String(params?.bjdongCd || '').trim();
  if (sigunguCd.length !== 5 || bjdongCd.length !== 5) {
    return { ...EMPTY_RESULT, topComplexes: [] };
  }

  const bjdCode = `${sigunguCd}${bjdongCd}`;
  const cached = kaptCache.get(bjdCode);
  if (cached) {
    return {
      ...cached,
      topComplexes: [...cached.topComplexes],
    };
  }

  const encodedKey = apiKey.includes('%') ? apiKey : encodeURIComponent(apiKey);

  // 1차(주 경로): 건축물대장 총괄표제부(BldRgstHubService/getBrRecapTitleInfo) — 단일 호출로 법정동 내 공동주택 단지명·세대수(hhldCnt) 정확 조회
  // (구 AptListService3/getLegaldongAptList3 오픈API 폐기에 대응)
  try {
    const recapUrl =
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo` +
      `?serviceKey=${encodedKey}&sigunguCd=${encodeURIComponent(sigunguCd)}&bjdongCd=${encodeURIComponent(bjdongCd)}&numOfRows=100&pageNo=1&_type=json`;

    const recapRes = await fetch(recapUrl, {
      signal: AbortSignal.timeout(5_000),
    });

    if (recapRes.ok) {
      const recapJson = await recapRes.json();
      const recapItems = normalizeItemsArray(recapJson?.response?.body?.items);
      if (recapItems.length > 0) {
        const seenKeys = new Set<string>();
        const namedComplexes: NearbyApartmentComplex[] = [];
        let totalHouseholds = 0;
        let complexCount = 0;

        for (const item of recapItems) {
          const hhldCnt = Math.round(Number(item?.hhldCnt ?? item?.hoCnt ?? 0));
          const mainPurps = String(item?.mainPurpsCdNm || item?.etcPurps || '').trim();
          const bldNm = String(item?.bldNm || '').trim();
          const platPlc = String(item?.platPlc || '').trim();
          if (!Number.isFinite(hhldCnt) || hhldCnt < 30) continue;
          if (!/(공동주택|아파트)/.test(mainPurps) && !/아파트/.test(bldNm)) continue;

          const dedupKey = String(item?.mgmBldrgstPk || `${platPlc}:${hhldCnt}`);
          if (seenKeys.has(dedupKey)) continue;
          seenKeys.add(dedupKey);

          totalHouseholds += hhldCnt;
          complexCount += 1;

          const fallbackName = platPlc
            ? platPlc.replace(/^.*?\s+([가-힣0-9]+동\d*가?\s+[\d-]+).*$/, '$1 공동주택')
            : '';
          const displayName = bldNm || fallbackName;
          if (displayName) {
            namedComplexes.push({
              name: displayName,
              households: hhldCnt,
            });
          }
        }

        if (totalHouseholds > 0) {
          // 고유 단지명이 있는 대단지를 우선 정렬
          namedComplexes.sort((a, b) => {
            const aNamed = a.name.endsWith('공동주택') ? 0 : 1;
            const bNamed = b.name.endsWith('공동주택') ? 0 : 1;
            if (aNamed !== bNamed) return bNamed - aNamed;
            return b.households - a.households;
          });

          const result: NearbyApartmentHouseholdsResult = {
            totalHouseholds,
            complexCount,
            topComplexes: namedComplexes.slice(0, 10),
            source: 'kapt_api',
          };

          if (kaptCache.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = kaptCache.keys().next().value;
            if (oldestKey) kaptCache.delete(oldestKey);
          }
          kaptCache.set(bjdCode, result);
          return result;
        }
      }
    }
  } catch (err) {
    log.warn({ err }, `[kapt-api] 건축물대장 총괄표제부 세대수 조회 실패 — 레거시 K-apt 폴백 시도 (${bjdCode})`);
  }

  // 2차 폴백: 레거시 K-apt 목록/기본정보 서비스
  const listUrl =
    `http://apis.data.go.kr/1613000/AptListService3/getLegaldongAptList3` +
    `?serviceKey=${encodedKey}&bjdCode=${encodeURIComponent(bjdCode)}&numOfRows=100&pageNo=1&_type=json`;

  try {
    const listRes = await fetch(listUrl, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!listRes.ok) {
      return { ...EMPTY_RESULT, topComplexes: [] };
    }

    const listJson = await listRes.json();
    const rawList = normalizeItemsArray(listJson?.response?.body?.items);
    if (rawList.length === 0) {
      return { ...EMPTY_RESULT, topComplexes: [] };
    }

    const targets = rawList.slice(0, 20);
    const complexes = await Promise.all(
      targets.map(async (entry): Promise<NearbyApartmentComplex | null> => {
        const kaptCode = String(entry?.kaptCode || '').trim();
        const kaptName = String(entry?.kaptName || '').trim();
        if (!kaptCode && !kaptName) return null;

        // 목록 응답에 이미 세대수가 포함된 경우 즉시 사용
        const directCnt = Number(entry?.kaptdaCnt ?? entry?.hoCnt ?? 0);
        if (Number.isFinite(directCnt) && directCnt > 0 && kaptName) {
          return { name: kaptName, households: Math.round(directCnt) };
        }

        if (!kaptCode) return null;

        const infoUrl =
          `http://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusBassInfoV3` +
          `?serviceKey=${encodedKey}&kaptCode=${encodeURIComponent(kaptCode)}&_type=json`;

        try {
          const infoRes = await fetch(infoUrl, {
            signal: AbortSignal.timeout(4_000),
          });
          if (!infoRes.ok) return null;
          const infoJson = await infoRes.json();
          const item = infoJson?.response?.body?.item ?? infoJson?.item;
          const cnt = Number(item?.kaptdaCnt ?? item?.hoCnt ?? 0);
          const name = String(item?.kaptName || kaptName || '').trim();
          if (!name || !Number.isFinite(cnt) || cnt <= 0) return null;
          return {
            name,
            households: Math.round(cnt),
          };
        } catch {
          return null;
        }
      }),
    );

    const validComplexes = complexes
      .filter((c): c is NearbyApartmentComplex => !!c && c.households > 0)
      .sort((a, b) => b.households - a.households);

    if (validComplexes.length === 0) {
      return { ...EMPTY_RESULT, topComplexes: [] };
    }

    const totalHouseholds = validComplexes.reduce((sum, c) => sum + c.households, 0);
    const result: NearbyApartmentHouseholdsResult = {
      totalHouseholds,
      complexCount: validComplexes.length,
      topComplexes: validComplexes.slice(0, 10),
      source: 'kapt_api',
    };

    if (kaptCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = kaptCache.keys().next().value;
      if (oldestKey) kaptCache.delete(oldestKey);
    }
    kaptCache.set(bjdCode, result);

    return result;
  } catch (err) {
    log.warn({ err }, `[kapt-api] 법정동 ${bjdCode} 공동주택 세대수 조회 실패 (graceful skip)`);
    return { ...EMPTY_RESULT, topComplexes: [] };
  }
}
