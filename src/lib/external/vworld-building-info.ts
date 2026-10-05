/**
 * @file vworld-building-info.ts
 * @description V-World 데이터 API `LT_C_BLDGINFO`(건물정보) — 본건 주변 대형 비주거 건물(연면적·층수·건축물명) 조회 + POI 점-폴리곤 조인.
 *
 * 용도: 입지 지도 랜드마크 후보 풀(landmark-pool.ts)의 "대형건물 신호".
 *  - 카카오 POI 좌표가 대형 건물 폴리곤 안에 있으면 gfaSqm/floors/buildingKey 를 부착한다.
 *  - 건축물명(bld_nm)이 있는 대형 건물은 대장 원문 이름 그대로 후보가 될 수 있다 (미등록 이름은 만들지 않음 — Rule 34).
 *  - 이름 없는 동(棟)은 단독 후보가 되지 않는다 (날조 금지) — 조인 대상으로만 사용.
 *
 * 실패 정책: 502/타임아웃은 재시도(백오프) 후에도 실패하면 `ok:false` 로 반환 — 호출측은 대장 신호 없이 풀을 계속 구성한다.
 * 호출은 읽기 전용이며 LLM과 무관하다.
 */
import { createModuleLogger } from '@/lib/logger';
import { getVWorldApiKey, getVWorldDomain, getVWorldReferer } from './vworld-config';

const log = createModuleLogger('vworld-building-info');

/** 조회 반경(박스 반변, m) */
export const BLDGINFO_HALF_WIDTH_M = 1000;
/** 대형 건물 최소 연면적(㎡) */
export const BLDGINFO_MIN_GFA_SQM = 15000;
/** 주거 용도 코드 (01000 단독주택, 02000 공동주택) — 비주거만 대형건물 신호로 사용 */
const RESIDENTIAL_USABILITY = new Set(['01000', '02000']);

type Ring = Array<[number, number]>;
/** GeoJSON Polygon(외곽 + 홀) */
type Poly = Ring[];

export interface LargeBuilding {
  /** V-World feature id (예: LT_C_BLDGINFO.6789497) — 같은 건물 판정 키 */
  key: string;
  /** 건축물명 (없으면 null — 이름 없는 동은 후보가 될 수 없음) */
  name: string | null;
  /** 동명 (참고용) */
  dongName: string | null;
  usability: string;
  floors: number | null;
  gfaSqm: number;
  /** 폴리곤 대표점(외곽링 평균) — 건물이 후보가 될 때의 좌표 */
  centroid: { lat: number; lng: number };
  polys: Poly[];
}

export interface FetchLargeBuildingsResult {
  ok: boolean;
  buildings: LargeBuilding[];
  /** 실패 사유 (ok=false) */
  error?: string;
  /** 총 요청 수 (재시도 포함) */
  requests: number;
}

export interface FetchLargeBuildingsOptions {
  halfWidthM?: number;
  minGfaSqm?: number;
  /** 테스트 주입용 */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** 요청당 타임아웃 (ms, 기본 8000) */
  timeoutMs?: number;
  /** 재시도 횟수 (기본 2 → 최대 3회 시도) */
  retries?: number;
  apiKey?: string;
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ringCentroid(ring: Ring): { lat: number; lng: number } | null {
  if (!ring || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  // 닫힌 링의 마지막 중복점 제외
  const n = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  return { lat: sy / n, lng: sx / n };
}

/** 짝홀(ray casting) 점-링 포함 판정 */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 점-폴리곤(MultiPolygon) 포함 — 외곽링 안 & 홀 밖 */
export function pointInPolys(lng: number, lat: number, polys: Poly[]): boolean {
  for (const poly of polys) {
    if (!poly[0] || !pointInRing(lng, lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lng, lat, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/** GeoJSON geometry → Poly[] (Polygon | MultiPolygon) */
function toPolys(geom: any): Poly[] {
  if (!geom || !Array.isArray(geom.coordinates)) return [];
  if (geom.type === 'Polygon') return [geom.coordinates as Poly];
  if (geom.type === 'MultiPolygon') return geom.coordinates as Poly[];
  return [];
}

/** V-World featureCollection feature → LargeBuilding (조건 미달이면 null) */
export function parseBuildingFeature(feature: any, minGfaSqm = BLDGINFO_MIN_GFA_SQM): LargeBuilding | null {
  const p = feature?.properties ?? {};
  const gfa = toNumber(p.totalarea);
  if (gfa == null || gfa < minGfaSqm) return null;
  const usability = String(p.usability ?? '');
  if (RESIDENTIAL_USABILITY.has(usability)) return null;
  const polys = toPolys(feature?.geometry);
  if (polys.length === 0 || !polys[0][0]) return null;
  const centroid = ringCentroid(polys[0][0]);
  if (!centroid) return null;
  const rawName = String(p.bld_nm ?? '').trim();
  const rawDong = String(p.dong_nm ?? '').trim();
  const floors = toNumber(p.grnd_flr);
  return {
    key: String(feature?.id ?? `${centroid.lat.toFixed(6)},${centroid.lng.toFixed(6)}`),
    name: rawName && !/^\(?무명\)?$/.test(rawName) ? rawName : null,
    dongName: rawDong || null,
    usability,
    floors: floors != null && floors > 0 ? floors : null,
    gfaSqm: gfa,
    centroid,
    polys,
  };
}

async function fetchPage(
  url: string,
  referer: string,
  opts: Required<Pick<FetchLargeBuildingsOptions, 'timeoutMs' | 'retries'>> & { fetchImpl: typeof fetch; sleep: (ms: number) => Promise<void> },
  counter: { n: number },
): Promise<any> {
  let lastErr = 'unknown';
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    counter.n += 1;
    try {
      const res = await opts.fetchImpl(url, { headers: { Referer: referer }, signal: AbortSignal.timeout(opts.timeoutMs) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = `HTTP ${res.status}`;
        log.warn(`[vworld-bldginfo] ${lastErr} — 재시도 ${attempt + 1}/${opts.retries + 1}`);
      } else if (!res.ok) {
        // 4xx 는 재시도 무의미
        throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      } else {
        const json = await res.json();
        const status = json?.response?.status;
        if (status === 'OK' || status === 'NOT_FOUND') return json;
        lastErr = `V-World status=${String(status)} ${String(json?.response?.error?.text ?? '')}`.trim();
        log.warn(`[vworld-bldginfo] ${lastErr} — 재시도 ${attempt + 1}/${opts.retries + 1}`);
      }
    } catch (err: any) {
      lastErr = err?.message ?? String(err);
      if (err?.fatal) throw new Error(lastErr);
      log.warn(`[vworld-bldginfo] 요청 실패(${lastErr}) — 재시도 ${attempt + 1}/${opts.retries + 1}`);
    }
    if (attempt < opts.retries) await opts.sleep(500 * 3 ** attempt);
  }
  throw new Error(lastErr);
}

/**
 * 본건 중심 ±halfWidthM 박스 안의 대형 비주거 건물을 조회한다.
 * attrFilter(totalarea>=min)로 서버에서 선필터 + 클라이언트에서 재검증. 페이지네이션(최대 5페이지).
 */
export async function fetchLargeBuildings(
  center: { lat: number; lng: number },
  options: FetchLargeBuildingsOptions = {},
): Promise<FetchLargeBuildingsResult> {
  const apiKey = (options.apiKey ?? getVWorldApiKey()).toUpperCase();
  if (!apiKey) return { ok: false, buildings: [], error: 'V-World API 키 미설정', requests: 0 };
  const half = options.halfWidthM ?? BLDGINFO_HALF_WIDTH_M;
  const minGfa = options.minGfaSqm ?? BLDGINFO_MIN_GFA_SQM;
  const referer = getVWorldReferer();
  const domain = getVWorldDomain();
  const dLat = half / 111320;
  const dLng = half / (111320 * Math.cos((center.lat * Math.PI) / 180));
  const box = `BOX(${center.lng - dLng},${center.lat - dLat},${center.lng + dLng},${center.lat + dLat})`;
  const counter = { n: 0 };
  const fetchOpts = {
    timeoutMs: options.timeoutMs ?? 8000,
    retries: options.retries ?? 2,
    fetchImpl: options.fetchImpl ?? fetch,
    sleep: options.sleep ?? defaultSleep,
  };
  const SIZE = 1000;
  const MAX_PAGES = 5;
  const byKey = new Map<string, LargeBuilding>();
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_BLDGINFO`
        + `&key=${apiKey}&domain=${encodeURIComponent(domain)}&format=json&geometry=true&attribute=true&crs=EPSG:4326`
        + `&attrFilter=${encodeURIComponent(`totalarea:>=:${minGfa}`)}`
        + `&size=${SIZE}&page=${page}&geomFilter=${encodeURIComponent(box)}`;
      const json = await fetchPage(url, referer, fetchOpts, counter);
      const features: any[] = json?.response?.result?.featureCollection?.features ?? [];
      for (const f of features) {
        const b = parseBuildingFeature(f, minGfa);
        if (b && !byKey.has(b.key)) byKey.set(b.key, b);
      }
      const totalPages = Number(json?.response?.page?.total ?? 1);
      if (features.length < SIZE || page >= totalPages) break;
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    log.warn(`[vworld-bldginfo] 대형건물 조회 실패 — 건축물대장 신호 없이 진행: ${msg}`);
    return { ok: false, buildings: [], error: msg, requests: counter.n };
  }
  // 결정성: key 오름차순
  const buildings = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { ok: true, buildings, requests: counter.n };
}

/** 건물 조인 결과 (POI 하나가 속한 건물) */
export interface BuildingJoin {
  buildingKey: string;
  gfaSqm: number;
  floors: number | null;
}

/**
 * POI 좌표가 포함된 대형 건물 조회 (점-폴리곤). 여러 건물에 겹치면 연면적이 큰 쪽(동률은 key 오름차순).
 */
export function findContainingBuilding(lat: number, lng: number, buildings: ReadonlyArray<LargeBuilding>): LargeBuilding | null {
  let best: LargeBuilding | null = null;
  for (const b of buildings) {
    if (!pointInPolys(lng, lat, b.polys)) continue;
    if (!best || b.gfaSqm > best.gfaSqm || (b.gfaSqm === best.gfaSqm && b.key < best.key)) best = b;
  }
  return best;
}
