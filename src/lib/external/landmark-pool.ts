/**
 * @file landmark-pool.ts
 * @description 입지 지도 랜드마크 후보 풀 — **렌더 경로 전용** 결정론적 다중 소스 수집기.
 *
 * 배경 (2026-10-05 실측): 기존 `fetchLocationPoi.candidateSpots` 는 Kakao `sort=distance` 1페이지 → 거리순 60건 절단이라
 * 0~300m 영세 업소(치과·모텔·통신판매)가 상위를 채우고 대형 랜드마크(롯데홈쇼핑 본사·선유도공원·영등포구청 등)가 후보에 아예 없었다.
 * 또한 17~19건 동시 호출 시 소켓 오류가 나도 재시도·캐시가 없어 실행마다 후보가 달라졌다.
 *
 * 구성:
 *  1. Kakao SW8(거리순) + PO3/HP8/MT1/AT4/CT1 카테고리(accuracy, 반경 ≤1500) + 키워드 검색(accuracy) — 고정 쿼리 순서로 병합
 *  2. V-World 건물정보(LT_C_BLDGINFO) 연면적 ≥ 15,000㎡ 비주거 건물을 POI와 점-폴리곤 조인 → gfaSqm/floors/buildingKey 부착
 *     (건축물명 있는 건물은 대장 원문 이름으로 후보가 될 수 있음. 이름 없는 동은 후보가 되지 않음)
 *  3. 클래스별 상한(per-class caps) — "거리순 N건 절단" 대신 클래스 내 정확도/거리순 상한
 *  4. 캐시: (lat,lng 5자리, 풀 버전, 추가쿼리군) 키, TTL 30일 — 메모리 + 파일(.cache/, git 무시). 실패가 있는 풀은 캐시하지 않는다.
 *  5. 오프라인/골든: `fixture` 주입(opt-in) 또는 환경변수 `LANDMARK_POOL_FIXTURE`(파일 경로) / `LANDMARK_POOL_OFFLINE=1`
 *
 * ⚠ LLM 프롬프트 불변 원칙: 이 풀은 `fetchLocationPoi`(keySpots/nearestStation/poiCounts)와 완전히 분리된 별도 필드이며,
 *   externalData 에 부착되지 않는다. (프롬프트에 직렬화되는 값은 kakao-map-api.ts 산식 그대로)
 * 이름·거리는 API 응답 원문(Kakao place_name/distance, V-World bld_nm)만 사용한다 — 날조 금지(Rule 34).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createModuleLogger } from '@/lib/logger';
import { brandTokenOf, classifyPoi, haversineM, type PoiCandidate, type PoiClass } from '@/domain/building/mobile-im/pptx/location-poi-selector';
import { fetchLargeBuildings, findContainingBuilding, type FetchLargeBuildingsResult } from './vworld-building-info';

const log = createModuleLogger('landmark-pool');

/** 풀 스키마/수집 로직 버전 — 변경 시 캐시 무효화 */
export const LANDMARK_POOL_PIPELINE_VERSION = 'lp-v1';
export const LANDMARK_POOL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** 픽스처 중심과 요청 중심이 이 거리(m) 이상 다르면 거리를 실좌표로 재계산한다 */
const FIXTURE_REBASE_THRESHOLD_M = 25;
/** 앵커 테넌트 확인용 추가 키워드 쿼리 상한 */
const MAX_TENANT_QUERIES = 6;

export type PoolExtras = 'road' | 'tour';

export interface LandmarkPoolBuilding {
  key: string;
  name: string | null;
  gfaSqm: number;
  floors: number | null;
  usability: string;
  centroid: { lat: number; lng: number };
}

export interface LandmarkPool {
  version: string;
  center: { lat: number; lng: number };
  /** ISO 시각 — 캐시 TTL 기준 */
  fetchedAt: string;
  /** 추가 쿼리군 (posture/asset 기반) */
  extras: PoolExtras[];
  /** 결정론적 순서: 거리 asc → 이름 asc */
  candidates: PoiCandidate[];
  /** 조인에 사용된 대형 건물 요약 (폴리곤 제외) */
  buildings: LandmarkPoolBuilding[];
  diagnostics: {
    queries: number;
    failedQueries: string[];
    rawCount: number;
    vworld: { ok: boolean; error?: string; buildings: number; joinedPois: number };
  };
}

interface QuerySpec {
  /** 로그/출처 라벨 (예: kw:본사, cat:PO3) */
  label: string;
  type: 'category' | 'keyword';
  /** category_group_code 또는 keyword */
  q: string;
  radius: number;
  sort: 'distance' | 'accuracy';
}

/** 기본 쿼리 (고정 순서 — 병합 순서의 결정성 보장) */
const BASE_QUERIES: QuerySpec[] = [
  { label: 'cat:SW8', type: 'category', q: 'SW8', radius: 2000, sort: 'distance' },
  { label: 'cat:PO3', type: 'category', q: 'PO3', radius: 1500, sort: 'accuracy' },
  { label: 'cat:HP8', type: 'category', q: 'HP8', radius: 1500, sort: 'accuracy' },
  { label: 'cat:MT1', type: 'category', q: 'MT1', radius: 1500, sort: 'accuracy' },
  { label: 'cat:AT4', type: 'category', q: 'AT4', radius: 1500, sort: 'accuracy' },
  { label: 'cat:CT1', type: 'category', q: 'CT1', radius: 1500, sort: 'accuracy' },
  ...['본사', '사옥', '타워', '공원', '한강공원', '구청', '시청', '대학교', '병원', '백화점', '아울렛', '복합쇼핑몰']
    .map((q): QuerySpec => ({ label: `kw:${q}`, type: 'keyword', q, radius: 1500, sort: 'accuracy' })),
];

/** 포스처별 추가 쿼리: development/owner_occupied/industrial → IC·나들목, operating/hotel → 관광·호텔 */
const EXTRA_QUERIES: Record<PoolExtras, QuerySpec[]> = {
  road: [
    { label: 'kw:나들목', type: 'keyword', q: '나들목', radius: 3000, sort: 'accuracy' },
    { label: 'kw:IC', type: 'keyword', q: 'IC', radius: 3000, sort: 'accuracy' },
  ],
  tour: [
    { label: 'kw:관광', type: 'keyword', q: '관광', radius: 1500, sort: 'accuracy' },
    { label: 'kw:호텔', type: 'keyword', q: '호텔', radius: 1500, sort: 'accuracy' },
  ],
};

/** 클래스별 상한 (거리순 절단 대신) — 클래스 내에서 정확도순위 → 거리 → 이름 순으로 상위 N건 유지 */
export const POOL_CLASS_CAPS: Record<PoiClass, number> = {
  station: 8, corporate_hq: 20, major_building: 25, park_major: 15, park_small: 5, park_tourism: 10,
  public_major: 10, public_minor: 6, hospital_major: 10, university: 10, shopping_major: 12,
  shopping_street: 8, supermarket: 6, culture: 8, hotel: 8, road: 8, other: 40,
};

/** 포스처/자산유형 → 추가 쿼리군 */
export function extrasFor(posture?: string | null, assetType?: string | null): PoolExtras[] {
  const p = String(posture ?? '').toLowerCase();
  const a = String(assetType ?? '').toLowerCase();
  const out = new Set<PoolExtras>();
  if (p.includes('develop') || p.includes('value') || p.includes('개발') || p.includes('owner') || p.includes('사옥') || /물류|창고|공장|산업|지식산업|industrial|logistics/.test(a)) out.add('road');
  if (p.includes('operat') || p.includes('hotel') || p.includes('운영') || /호텔|숙박|hotel|리조트|resort/.test(a)) out.add('tour');
  return [...out].sort();
}

export function buildQueryPlan(extras: ReadonlyArray<PoolExtras> = []): QuerySpec[] {
  return [...BASE_QUERIES, ...[...extras].sort().flatMap(e => EXTRA_QUERIES[e])];
}

export interface BuildLandmarkPoolOptions {
  posture?: string | null;
  assetType?: string | null;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Kakao REST 키 (미지정 시 환경변수) */
  kakaoKey?: string;
  /** Kakao 동시성 (기본 4) */
  concurrency?: number;
  /** 요청 타임아웃 ms (기본 4000) */
  timeoutMs?: number;
  /** 재시도 횟수 (기본 2) */
  retries?: number;
  /** V-World 대형건물 조인 사용 여부 (기본 true) */
  useVworld?: boolean;
  /** V-World 조회 주입(테스트) */
  vworldFetcher?: (center: { lat: number; lng: number }) => Promise<FetchLargeBuildingsResult>;
  now?: () => Date;
}

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function kakaoCategoryOf(doc: any): PoiCandidate['category'] {
  switch (String(doc?.category_group_code ?? '')) {
    case 'SW8': return 'subway';
    case 'MT1': return 'shopping';
    case 'HP8': return 'hospital';
    case 'PO3': return 'public';
    case 'SC4': return 'university';
    default: return 'landmark';
  }
}

type QueryOutcome = { spec: QuerySpec; docs: any[] | null; error?: string };

async function runQuery(
  spec: QuerySpec,
  center: { lat: number; lng: number },
  key: string,
  o: { fetchImpl: typeof fetch; sleep: (ms: number) => Promise<void>; timeoutMs: number; retries: number },
): Promise<QueryOutcome> {
  const common = `y=${center.lat}&x=${center.lng}&radius=${spec.radius}&sort=${spec.sort}&size=15&page=1`;
  const url = spec.type === 'category'
    ? `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=${spec.q}&${common}`
    : `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(spec.q)}&${common}`;
  let lastErr = 'unknown';
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    try {
      const res = await o.fetchImpl(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(o.timeoutMs) });
      if (res.ok) {
        const data: any = await res.json();
        return { spec, docs: Array.isArray(data?.documents) ? data.documents : [] };
      }
      lastErr = `HTTP ${res.status}`;
      // 429/5xx 만 재시도 — 그 외 4xx(키/파라미터 오류)는 즉시 실패
      if (res.status !== 429 && res.status < 500) break;
    } catch (err: any) {
      lastErr = err?.message ?? String(err);
    }
    if (attempt < o.retries) await o.sleep(300 * 3 ** attempt);
  }
  log.warn(`[landmark-pool] 쿼리 실패 (${spec.label}): ${lastErr}`);
  return { spec, docs: null, error: lastErr };
}

async function runLimited<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 클래스별 상한 적용 — 결과는 거리 asc → 이름 asc 로 정렬 */
export function capPoolByClass(items: ReadonlyArray<PoiCandidate>, caps: Record<PoiClass, number> = POOL_CLASS_CAPS): PoiCandidate[] {
  const byClass = new Map<PoiClass, PoiCandidate[]>();
  const exempt: PoiCandidate[] = [];
  for (const c of items) {
    const cls = classifyPoi(c);
    // 대형 건물 안의 입주 POI는 앵커 테넌트 판정 근거이므로 상한에서 제외 (대형 건물 수가 곧 상한)
    if (cls === 'other' && c.buildingKey) {
      exempt.push(c);
      continue;
    }
    const arr = byClass.get(cls) ?? [];
    arr.push(c);
    byClass.set(cls, arr);
  }
  const kept: PoiCandidate[] = [...exempt];
  for (const [cls, arr] of byClass) {
    arr.sort((a, b) =>
      (a.accuracyRank ?? 99) - (b.accuracyRank ?? 99)
      || a.distanceM - b.distanceM
      || cmpStr(a.name, b.name));
    kept.push(...arr.slice(0, caps[cls] ?? 20));
  }
  return kept.sort((a, b) => a.distanceM - b.distanceM || cmpStr(a.name, b.name) || a.lat - b.lat || a.lng - b.lng);
}

/**
 * 라이브 풀 구성 (캐시/픽스처 미사용). 쿼리는 동시성 4로 실행하되 병합은 항상 고정 쿼리 순서.
 * Kakao 키가 없으면 null.
 */
export async function buildLandmarkPool(
  center: { lat: number; lng: number },
  options: BuildLandmarkPoolOptions = {},
): Promise<LandmarkPool | null> {
  const key = options.kakaoKey ?? process.env.KAKAO_REST_API_KEY ?? process.env.NEXT_PUBLIC_KAKAO_APP_KEY ?? '';
  if (!key) {
    log.warn('[landmark-pool] Kakao 키 미설정 — 후보 풀 생략');
    return null;
  }
  const extras = extrasFor(options.posture, options.assetType);
  const plan = buildQueryPlan(extras);
  const o = {
    fetchImpl: options.fetchImpl ?? fetch,
    sleep: options.sleep ?? defaultSleep,
    timeoutMs: options.timeoutMs ?? 4000,
    retries: options.retries ?? 2,
  };

  // V-World 는 Kakao 와 독립이므로 병렬 시작 (결과는 병합 후 조인)
  const vworldPromise: Promise<FetchLargeBuildingsResult> = options.useVworld === false
    ? Promise.resolve({ ok: false, buildings: [], error: 'disabled', requests: 0 })
    : (options.vworldFetcher ? options.vworldFetcher(center) : fetchLargeBuildings(center, { fetchImpl: options.fetchImpl, sleep: options.sleep }))
        .catch((err: any): FetchLargeBuildingsResult => ({ ok: false, buildings: [], error: err?.message ?? String(err), requests: 0 }));

  const outcomes = await runLimited(
    plan.map(spec => () => runQuery(spec, center, key, o)),
    options.concurrency ?? 4,
  );

  // 고정 쿼리 순서 병합 (완료 순서 무관) — place id(없으면 이름+좌표) 기준 중복 제거, 정확도 순위 최소값/출처 합집합 유지
  const merged = new Map<string, PoiCandidate & { _sources: string[] }>();
  const failedQueries: string[] = [];
  let rawCount = 0;
  for (const out of outcomes) {
    if (out.docs == null) {
      failedQueries.push(out.spec.label);
      continue;
    }
    out.docs.forEach((doc, rank) => {
      const lat = parseFloat(doc?.y);
      const lng = parseFloat(doc?.x);
      const name = String(doc?.place_name ?? '').trim();
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      rawCount++;
      const parsedDist = parseInt(doc?.distance, 10);
      const distanceM = Number.isFinite(parsedDist) ? parsedDist : Math.round(haversineM(center.lat, center.lng, lat, lng));
      const mk = doc?.id ? `id:${doc.id}` : `n:${name}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
      const accRank = out.spec.sort === 'accuracy' ? rank : undefined;
      const cur = merged.get(mk);
      if (cur) {
        if (accRank != null) cur.accuracyRank = cur.accuracyRank == null ? accRank : Math.min(cur.accuracyRank, accRank);
        if (!cur._sources.includes(out.spec.label)) cur._sources.push(out.spec.label);
        return;
      }
      merged.set(mk, {
        name,
        lat,
        lng,
        distanceM,
        category: kakaoCategoryOf(doc),
        categoryName: doc?.category_name ? String(doc.category_name) : undefined,
        id: doc?.id ? String(doc.id) : undefined,
        ...(accRank != null ? { accuracyRank: accRank } : {}),
        _sources: [out.spec.label],
      });
    });
  }
  if (failedQueries.length > 0) {
    log.warn(`[landmark-pool] ${failedQueries.length}/${plan.length} 쿼리 실패 (${failedQueries.join(', ')}) — 부분 풀`);
  }

  // V-World 대형건물 조인
  const vw = await vworldPromise;
  const items: PoiCandidate[] = [...merged.values()].map(({ _sources: _s, ...rest }) => rest);
  let joinedPois = 0;
  const joinedBuildingKeys = new Set<string>();
  if (vw.ok) {
    for (const c of items) {
      const b = findContainingBuilding(c.lat, c.lng, vw.buildings);
      if (!b) continue;
      c.buildingKey = b.key;
      c.gfaSqm = Math.round(b.gfaSqm);
      if (b.floors != null) c.floors = b.floors;
      joinedPois++;
      joinedBuildingKeys.add(b.key);
    }
    // 건축물명이 있고 조인된 POI가 없는 대형 건물 → 대장 원문 이름으로 후보 (이름 없는 동은 제외)
    for (const b of vw.buildings) {
      if (!b.name || joinedBuildingKeys.has(b.key)) continue;
      items.push({
        name: b.name,
        lat: b.centroid.lat,
        lng: b.centroid.lng,
        distanceM: Math.round(haversineM(center.lat, center.lng, b.centroid.lat, b.centroid.lng)),
        category: 'landmark',
        categoryName: `건축물대장 > ${b.usability}`,
        gfaSqm: Math.round(b.gfaSqm),
        ...(b.floors != null ? { floors: b.floors } : {}),
        buildingKey: b.key,
        registerName: b.name,
      });
    }
  } else if (vw.error !== 'disabled') {
    log.warn(`[landmark-pool] V-World 대형건물 신호 없음 (${vw.error}) — 본사/대형건물 클래스는 연면적 검증 불가`);
  }

  // 앵커 테넌트 확인: 같은 건물에 서로 다른 브랜드의 본사 후보가 2개 이상이면 브랜드별 키워드 검색(건물 중심 반경 300m)으로
  // 건물 안(점-폴리곤)에 입주한 POI를 보강 → 선별기가 "건물 내 POI 최다 브랜드"를 앵커로 판정 (예: 롯데홈쇼핑 > 롯데웰푸드).
  // 거리는 Kakao distance(건물 중심 기준)가 아닌 본건 기준 실좌표 대권거리로 계산한다.
  let tenantQueries = 0;
  if (vw.ok) {
    const brandsByBuilding = new Map<string, Set<string>>();
    for (const c of items) {
      if (!c.buildingKey || c.registerName || classifyPoi(c) !== 'corporate_hq') continue;
      const set = brandsByBuilding.get(c.buildingKey) ?? new Set<string>();
      set.add(brandTokenOf(c.name));
      brandsByBuilding.set(c.buildingKey, set);
    }
    const contenders: Array<{ key: string; brand: string; centroid: { lat: number; lng: number } }> = [];
    for (const bKey of [...brandsByBuilding.keys()].sort()) {
      const brands = [...(brandsByBuilding.get(bKey) ?? [])].sort();
      const bld = vw.buildings.find(b => b.key === bKey);
      if (!bld || brands.length < 2) continue;
      for (const brand of brands) {
        if (brand && contenders.length < MAX_TENANT_QUERIES) contenders.push({ key: bKey, brand, centroid: bld.centroid });
      }
    }
    tenantQueries = contenders.length;
    const tenantOutcomes = await runLimited(
      contenders.map(t => () => runQuery({ label: `tenant:${t.brand}`, type: 'keyword', q: t.brand, radius: 300, sort: 'accuracy' }, t.centroid, key, o)),
      options.concurrency ?? 4,
    );
    const seenIds = new Set(items.map(c => c.id).filter(Boolean) as string[]);
    const seenNameCoord = new Set(items.map(c => `${c.name}|${c.lat.toFixed(6)}|${c.lng.toFixed(6)}`));
    for (const out of tenantOutcomes) {
      if (out.docs == null) {
        failedQueries.push(out.spec.label);
        continue;
      }
      for (const doc of out.docs) {
        const lat = parseFloat(doc?.y);
        const lng = parseFloat(doc?.x);
        const name = String(doc?.place_name ?? '').trim();
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const id = doc?.id ? String(doc.id) : undefined;
        const nc = `${name}|${lat.toFixed(6)}|${lng.toFixed(6)}`;
        if ((id && seenIds.has(id)) || seenNameCoord.has(nc)) continue;
        const b = findContainingBuilding(lat, lng, vw.buildings);
        if (!b) continue; // 건물 안 입주 POI만 보강 (건물 밖은 무시)
        rawCount++;
        if (id) seenIds.add(id);
        seenNameCoord.add(nc);
        joinedPois++;
        items.push({
          name,
          lat,
          lng,
          distanceM: Math.round(haversineM(center.lat, center.lng, lat, lng)),
          category: kakaoCategoryOf(doc),
          categoryName: doc?.category_name ? String(doc.category_name) : undefined,
          ...(id ? { id } : {}),
          buildingKey: b.key,
          gfaSqm: Math.round(b.gfaSqm),
          ...(b.floors != null ? { floors: b.floors } : {}),
        });
      }
    }
    if (tenantOutcomes.some(t => t.docs == null)) {
      log.warn('[landmark-pool] 앵커 테넌트 보강 쿼리 일부 실패 — 부분 풀');
    }
  }

  const candidates = capPoolByClass(items);
  const pool: LandmarkPool = {
    version: LANDMARK_POOL_PIPELINE_VERSION,
    center: { lat: center.lat, lng: center.lng },
    fetchedAt: (options.now?.() ?? new Date()).toISOString(),
    extras,
    candidates,
    buildings: vw.buildings
      .map((b): LandmarkPoolBuilding => ({ key: b.key, name: b.name, gfaSqm: Math.round(b.gfaSqm), floors: b.floors, usability: b.usability, centroid: b.centroid }))
      .sort((a, b) => cmpStr(a.key, b.key)),
    diagnostics: {
      queries: plan.length + tenantQueries,
      failedQueries,
      rawCount,
      vworld: { ok: vw.ok, ...(vw.error ? { error: vw.error } : {}), buildings: vw.buildings.length, joinedPois },
    },
  };
  log.info(`[landmark-pool] 풀 구성: raw=${rawCount} 후보=${candidates.length} 대형건물=${vw.buildings.length} 조인POI=${joinedPois} 실패쿼리=${failedQueries.length}`);
  return pool;
}

// ───────────────────────── 캐시 / 픽스처 ─────────────────────────

const memoryCache = new Map<string, LandmarkPool>();

export function poolCacheKey(center: { lat: number; lng: number }, extras: ReadonlyArray<PoolExtras> = []): string {
  return `${center.lat.toFixed(5)},${center.lng.toFixed(5)}:${LANDMARK_POOL_PIPELINE_VERSION}:${[...extras].sort().join('+') || 'base'}`;
}

function cacheDir(): string {
  if (process.env.LANDMARK_POOL_CACHE_DIR) return process.env.LANDMARK_POOL_CACHE_DIR;
  return process.env.VERCEL ? path.join(os.tmpdir(), 'landmark-pool') : path.join(process.cwd(), '.cache', 'landmark-pool');
}

function cacheFile(key: string): string {
  return path.join(cacheDir(), `${key.replace(/[^0-9A-Za-z.+-]+/g, '_')}.json`);
}

function isFresh(pool: LandmarkPool | null | undefined, now: number): pool is LandmarkPool {
  if (!pool || pool.version !== LANDMARK_POOL_PIPELINE_VERSION || !Array.isArray(pool.candidates)) return false;
  const t = Date.parse(pool.fetchedAt);
  return Number.isFinite(t) && now - t < LANDMARK_POOL_TTL_MS;
}

function readFileCache(key: string, now: number): LandmarkPool | null {
  try {
    const f = cacheFile(key);
    if (!fs.existsSync(f)) return null;
    const pool = JSON.parse(fs.readFileSync(f, 'utf8')) as LandmarkPool;
    return isFresh(pool, now) ? pool : null;
  } catch {
    return null;
  }
}

function writeFileCache(key: string, pool: LandmarkPool): void {
  try {
    const f = cacheFile(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(pool), 'utf8');
  } catch (err) {
    log.warn('[landmark-pool] 파일 캐시 쓰기 실패 (무시):', err);
  }
}

/** 테스트용: 메모리 캐시 초기화 */
export function clearLandmarkPoolMemoryCache(): void {
  memoryCache.clear();
}

/** 픽스처 JSON 로드 (유효하지 않으면 null) */
export function loadLandmarkPoolFixture(file: string): LandmarkPool | null {
  try {
    const p = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    const pool = JSON.parse(fs.readFileSync(p, 'utf8')) as LandmarkPool;
    if (!pool || !Array.isArray(pool.candidates) || !pool.center) return null;
    return pool;
  } catch (err) {
    log.warn(`[landmark-pool] 픽스처 로드 실패 (${file}):`, err);
    return null;
  }
}

/**
 * 풀을 요청 중심에 맞춘다. 중심이 25m 이상 다르면 각 후보의 distanceM 을 후보 실좌표로 재계산(대권거리)한다.
 * (같은 중심이면 풀 원문 distanceM 그대로 — 변경 없음)
 */
export function rebasePoolToCenter(pool: LandmarkPool, center: { lat: number; lng: number }): LandmarkPool {
  const shift = haversineM(pool.center.lat, pool.center.lng, center.lat, center.lng);
  if (shift < FIXTURE_REBASE_THRESHOLD_M) return pool;
  return {
    ...pool,
    center: { lat: center.lat, lng: center.lng },
    candidates: pool.candidates.map(c => ({ ...c, distanceM: Math.round(haversineM(center.lat, center.lng, c.lat, c.lng)) })),
  };
}

export interface ResolveLandmarkPoolOptions extends BuildLandmarkPoolOptions {
  /** 주입 픽스처 (오프라인/골든) — 있으면 네트워크·캐시를 사용하지 않는다 */
  fixture?: LandmarkPool | null;
  /** 캐시 사용 (기본 true) */
  useCache?: boolean;
}

/**
 * 풀 조회: 픽스처(주입/환경변수) → 메모리 캐시 → 파일 캐시 → 라이브. 실패 시 null (호출측은 레거시 후보로 폴백).
 */
export async function resolveLandmarkPool(
  center: { lat: number; lng: number },
  options: ResolveLandmarkPoolOptions = {},
): Promise<LandmarkPool | null> {
  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lng)) return null;
  if (options.fixture) return rebasePoolToCenter(options.fixture, center);
  const envFixture = process.env.LANDMARK_POOL_FIXTURE;
  if (envFixture) {
    const fx = loadLandmarkPoolFixture(envFixture);
    if (fx) return rebasePoolToCenter(fx, center);
  }
  if (process.env.LANDMARK_POOL_OFFLINE === '1' || process.env.OFFLINE_RENDER === '1') return null;

  const extras = extrasFor(options.posture, options.assetType);
  const key = poolCacheKey(center, extras);
  const nowMs = (options.now?.() ?? new Date()).getTime();
  const useCache = options.useCache !== false;
  if (useCache) {
    const mem = memoryCache.get(key);
    if (isFresh(mem, nowMs)) return mem;
    const file = readFileCache(key, nowMs);
    if (file) {
      memoryCache.set(key, file);
      return file;
    }
  }
  const pool = await buildLandmarkPool(center, options);
  // 실패가 있는 부분 풀은 캐시하지 않는다 (30일간 불완전 결과가 고정되는 것 방지)
  if (pool && useCache && pool.diagnostics.failedQueries.length === 0 && pool.diagnostics.vworld.ok) {
    memoryCache.set(key, pool);
    writeFileCache(key, pool);
  }
  return pool;
}
