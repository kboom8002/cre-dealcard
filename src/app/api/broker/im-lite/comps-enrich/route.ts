// src/app/api/broker/im-lite/comps-enrich/route.ts
// R11: 중개인 비교사례(인근 시세) 주소 기반 공공데이터·카카오 로컬 자동 보강 API

import { NextRequest, NextResponse } from 'next/server';
import { resolveAddress } from '@/lib/external/address-resolver';
import { fetchLandUsePlan } from '@/lib/external/land-use-api';
import { fetchBuildingRegister } from '@/lib/external/building-register-api';
import { resolveMergedStations } from '@/domain/building/mobile-im/pptx/station-lines';
import type { MarketCompItem } from '@/domain/building/mobile-im/comps-paste-parser';

const PYEONG_TO_SQM = 3.305785;
const DEFAULT_TIMEOUT_MS = 5000;

export interface EnrichCompRequest {
  address: string;
  price_eok?: number;
  kind?: 'listing' | 'transaction';
}

export interface ResolvedAddressInfo {
  pnu?: string | null;
  lat?: number | null;
  lng?: number | null;
  roadAddress?: string | null;
  jibunAddress?: string | null;
}

export interface LandCharacteristicsLike {
  landArea?: number;
  landAreaPyeong?: number;
  lndpclAr?: number | string;
  zoning?: string;
  zoningDistrict?: string;
  prposArea1Nm?: string;
  roadSide?: string;
  roadAccess?: string;
  roadSideCodeNm?: string;
}

export interface BuildingRegisterLike {
  totalArea?: number;
  totArea?: number | string;
  platArea?: number;
}

export interface EnrichCompDeps {
  resolveAddress?: (address: string) => Promise<ResolvedAddressInfo | null>;
  lookupPnuFromAddress?: (address: string) => Promise<ResolvedAddressInfo | null>;
  fetchLandCharacteristics?: (pnu: string) => Promise<LandCharacteristicsLike | null>;
  fetchBuildingRegisterByPnu?: (pnu: string) => Promise<BuildingRegisterLike | null>;
  fetchSubwayStations?: (lat: number, lng: number) => Promise<any[]>;
  timeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([
    promise.catch(() => fallback),
    timeoutPromise,
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function posNum(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '').trim()) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * V-World 도로접면(roadSideCodeNm: 광대소각, 중로한면, 세로한면 등)을 '대로변' | '이면'으로 매핑한다.
 */
export function mapRoadSideToCondition(raw?: string | null): '대로변' | '이면' | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (/(대로변|광대|중로|대로)/.test(s)) return '대로변';
  if (/(이면|소로|세로)/.test(s)) return '이면';
  return undefined;
}

async function defaultResolveAddress(address: string, timeoutMs: number): Promise<ResolvedAddressInfo | null> {
  const kakaoKey = process.env.KAKAO_REST_API_KEY || process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
  if (kakaoKey) {
    try {
      const url = `https://dapi.kakao.com/v2/local/search/address.json?size=1&query=${encodeURIComponent(address)}`;
      const res = await fetch(url, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const data = await res.json();
        const doc = data?.documents?.[0];
        if (doc) {
          const jibun = doc.address || {};
          const road = doc.road_address || {};
          let pnu: string | null = null;
          if (jibun.b_code && jibun.main_address_no) {
            const isSan = jibun.mountain_yn === 'Y' ? '2' : '1';
            const bun = String(jibun.main_address_no).padStart(4, '0');
            const ji = String(jibun.sub_address_no || '0').padStart(4, '0');
            const candidate = `${jibun.b_code}${isSan}${bun}${ji}`;
            if (/^\d{19}$/.test(candidate)) pnu = candidate;
          }
          const lat = parseFloat(doc.y);
          const lng = parseFloat(doc.x);
          if (pnu || (Number.isFinite(lat) && Number.isFinite(lng))) {
            return {
              pnu,
              lat: Number.isFinite(lat) ? lat : null,
              lng: Number.isFinite(lng) ? lng : null,
              roadAddress: road.address_name || null,
              jibunAddress: jibun.address_name || doc.address_name || null,
            };
          }
        }
      }
    } catch {
      // 폴백으로 진행
    }
  }

  const resolved = await withTimeout(resolveAddress(address), timeoutMs, null);
  if (!resolved) return null;
  return {
    pnu: resolved.pnu && /^\d{19}$/.test(resolved.pnu) ? resolved.pnu : null,
    lat: resolved.lat,
    lng: resolved.lng,
    roadAddress: resolved.roadAddress,
    jibunAddress: resolved.jibunAddress,
  };
}

export async function fetchBuildingRegisterByPnu(pnu: string): Promise<BuildingRegisterLike | null> {
  if (!pnu || !/^\d{19}$/.test(pnu)) return null;
  const sigunguCd = pnu.substring(0, 5);
  const bjdongCd = pnu.substring(5, 10);
  const platGbCd = pnu.charAt(10) === '2' ? '1' : '0';
  const bun = pnu.substring(11, 15);
  const ji = pnu.substring(15, 19);
  return fetchBuildingRegister(sigunguCd, bjdongCd, bun, ji, undefined, platGbCd);
}

async function defaultFetchSubwayStations(lat: number, lng: number, timeoutMs: number): Promise<any[]> {
  const kakaoKey = process.env.KAKAO_REST_API_KEY || process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
  if (!kakaoKey) return [];
  try {
    const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=SW8&y=${lat}&x=${lng}&radius=1500&sort=distance&size=5`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.documents) ? data.documents : [];
  } catch {
    return [];
  }
}

/**
 * 주소 문자열(및 선택적 매매가/구분)로부터 토지면적·연면적·도로조건·지하철도보·토지평당가를 보강한다.
 */
export async function enrichCompByAddress(
  input: EnrichCompRequest | string,
  deps: EnrichCompDeps = {},
): Promise<Partial<MarketCompItem>> {
  const reqObj: EnrichCompRequest = typeof input === 'string' ? { address: input } : input;
  const address = (reqObj.address ?? '').trim();
  const priceEok = posNum(reqObj.price_eok);
  const kind = reqObj.kind === 'transaction' ? 'transaction' : 'listing';
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const item: Partial<MarketCompItem> = {
    location: address,
    kind,
    ...(priceEok !== undefined ? { price_eok: priceEok } : {}),
  };

  if (!address) return item;

  const addrResolver =
    deps.resolveAddress ??
    deps.lookupPnuFromAddress ??
    ((addr: string) => defaultResolveAddress(addr, timeoutMs));

  const resolved = await withTimeout(addrResolver(address), timeoutMs, null);
  const pnu = resolved?.pnu && /^\d{19}$/.test(resolved.pnu) ? resolved.pnu : null;
  const lat = typeof resolved?.lat === 'number' && Number.isFinite(resolved.lat) ? resolved.lat : null;
  const lng = typeof resolved?.lng === 'number' && Number.isFinite(resolved.lng) ? resolved.lng : null;

  const landFetcher: (pnu: string) => Promise<LandCharacteristicsLike | null> =
    deps.fetchLandCharacteristics ?? fetchLandUsePlan;
  const bldFetcher: (pnu: string) => Promise<BuildingRegisterLike | null> =
    deps.fetchBuildingRegisterByPnu ?? fetchBuildingRegisterByPnu;
  const stationFetcher =
    deps.fetchSubwayStations ?? ((y: number, x: number) => defaultFetchSubwayStations(y, x, timeoutMs));

  const [landRes, bldRes, rawStations] = await Promise.all([
    pnu ? withTimeout<LandCharacteristicsLike | null>(landFetcher(pnu), timeoutMs, null) : Promise.resolve(null),
    pnu ? withTimeout<BuildingRegisterLike | null>(bldFetcher(pnu), timeoutMs, null) : Promise.resolve(null),
    lat !== null && lng !== null ? withTimeout<any[]>(stationFetcher(lat, lng), timeoutMs, []) : Promise.resolve([]),
  ]);

  // 1. 토지면적 & 도로 조건
  const landSqm = posNum(landRes?.landArea ?? landRes?.lndpclAr ?? bldRes?.platArea);
  const explicitLandPyeong = posNum(landRes?.landAreaPyeong);
  if (landSqm !== undefined || explicitLandPyeong !== undefined) {
    const resolvedSqm =
      landSqm !== undefined
        ? Math.round(landSqm * 100) / 100
        : Math.round(explicitLandPyeong! * PYEONG_TO_SQM * 100) / 100;
    const resolvedPyeong =
      explicitLandPyeong !== undefined
        ? Math.round(explicitLandPyeong * 10) / 10
        : Math.round((resolvedSqm / PYEONG_TO_SQM) * 10) / 10;
    item.land_area_sqm = resolvedSqm;
    item.land_area_pyeong = resolvedPyeong;
  }

  const rawRoadSide =
    landRes?.roadSide ?? landRes?.roadAccess ?? landRes?.roadSideCodeNm ?? undefined;
  const mappedRoad = mapRoadSideToCondition(rawRoadSide);
  if (mappedRoad) {
    item.road_condition = mappedRoad;
    item.road_side = mappedRoad;
  }

  // 2. 연면적 (건축물대장)
  const gfaSqm = posNum(bldRes?.totalArea ?? bldRes?.totArea);
  if (gfaSqm !== undefined) {
    const roundedGfaSqm = Math.round(gfaSqm * 100) / 100;
    const roundedGfaPy = Math.round((roundedGfaSqm / PYEONG_TO_SQM) * 10) / 10;
    item.gross_floor_area_sqm = roundedGfaSqm;
    item.gfa_sqm = roundedGfaSqm;
    item.gross_floor_area_pyeong = roundedGfaPy;
    item.gfa_pyeong = roundedGfaPy;
  }

  // 3. 최근접 지하철역 노선 병합 및 도보 시간
  if (Array.isArray(rawStations) && rawStations.length > 0) {
    const normalizedCandidates = rawStations.map((s) => ({
      ...s,
      category: 'subway',
      name: s.name ?? s.place_name ?? '',
      distanceM: Number(s.distanceM ?? s.distance_m ?? s.distance ?? 0),
      categoryName: s.categoryName ?? s.category_name ?? s.line ?? '',
    }));
    const mergedStations = resolveMergedStations({ candidateSpots: normalizedCandidates }, undefined, 1500);
    if (mergedStations.length > 0) {
      const primary = mergedStations[0];
      item.station_walk = `${primary.formattedName} 도보 ${primary.walkMinutes}분`;
      item.station_name = primary.formattedName;
      item.station_walk_min = primary.walkMinutes;
    }
  }

  // 4. 토지평당가 자동 계산
  const landPyForCalc =
    item.land_area_pyeong ??
    (item.land_area_sqm !== undefined && item.land_area_sqm > 0
      ? item.land_area_sqm / PYEONG_TO_SQM
      : undefined);
  if (priceEok !== undefined && priceEok > 0 && landPyForCalc !== undefined && landPyForCalc > 0) {
    item.land_price_per_pyeong_manwon = Math.round((priceEok * 10000) / landPyForCalc);
  }

  return item;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
    }

    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address) {
      return NextResponse.json({ ok: false, error: '주소를 입력해주세요.' }, { status: 400 });
    }
    if (address.length > 120) {
      return NextResponse.json({ ok: false, error: '주소는 120자 이하로 입력해주세요.' }, { status: 400 });
    }

    const priceEok = posNum(body.price_eok);
    const kind = body.kind === 'transaction' ? 'transaction' : 'listing';

    const item = await enrichCompByAddress({ address, price_eok: priceEok, kind });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '자동 보강 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
