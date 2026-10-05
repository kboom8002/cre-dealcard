/**
 * @file location-poi-selector.ts
 * @description 입지 지도(A06 Location)용 POI 정밀 선별기 — 순수 함수 (외부 I/O 없음).
 *
 * 입력: 카카오 로컬 API에서 실제로 조회된 POI 후보(이름·좌표·직선거리·카테고리)만 사용합니다.
 *       (Rule 34: 이름/거리를 임의 생성하지 않음 — 후보에 없는 랜드마크는 절대 만들지 않는다)
 * 출력: 포스처(income/trading/owner_occupied/development/operating)와 자산유형(오피스/리테일/호텔 등)에
 *       맞춰 3~5건을 다양성 있게 선별한 목록 (번호 1..N, 지도 마커 번호 = 범례 번호).
 *
 * 선별 원칙:
 *  1. 최근접 지하철역 우선 (동일 역 다른 노선은 1건으로 병합: "당산역(2·9호선)")
 *  2. 두 번째 역은 신규 노선을 추가하거나 도보권(≤1km)일 때만
 *  3. 랜드마크는 포스처/자산유형별 가중치 × 거리 감쇠 점수로 선별, 클래스당 1건 (다양성)
 *  4. 이름 접두 중복(예: "선유도공원 전망대" / "선유도공원 식물원") 제거, 거리 상한 적용
 *  5. 지도 뷰 밖 후보는 `isInView` 콜백으로 제외 (마커 번호와 범례 번호 1:1 보장)
 *
 * LLM 미사용 — 결정론적 규칙만 사용하므로 e2e/llm-recordings 리플레이에 영향이 없습니다.
 */

/** 카카오 POI 후보 (kakao-map-api.ts PoiSpot 호환 + 선택적 카카오 category_name) */
export interface PoiCandidate {
  name: string;
  lat: number;
  lng: number;
  /** 본건 좌표 기준 직선거리 (m) — 카카오 응답 distance */
  distanceM: number;
  /** kakao-map-api.ts 의 단순 카테고리 */
  category: string;
  /** 카카오 category_name (예: "교통,수송 > 지하철,전철 > 수도권9호선") */
  categoryName?: string;
}

/** 선별 결과 1건 */
export interface SelectedPoi {
  /** 1-based 번호 (지도 마커 번호 = 범례 번호) */
  index: number;
  kind: 'station' | 'landmark' | 'road';
  /** 선별에 사용된 랜드마크 클래스 (station/road 포함) */
  poiClass: PoiClass;
  /** 범례 표기명 (예: "선유도역(9호선)") */
  displayName: string;
  /** 원본 이름 (카카오 place_name) */
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  /** 도보 분 (80m/분, 최소 1분) */
  walkMinutes: number;
  /** 거리 표기 (예: "도보 2분" 또는 "약 1.3km") */
  distanceLabel: string;
  /** 범례 한 줄 (예: "선유도역(9호선) 도보 2분") */
  label: string;
  /** 선별 사유 (디버그/리포트용) */
  reason: string;
}

export type PoiClass =
  | 'station'
  | 'road'
  | 'public_major'
  | 'public_minor'
  | 'shopping_major'
  | 'shopping_street'
  | 'supermarket'
  | 'hospital_major'
  | 'university'
  | 'park_tourism'
  | 'culture'
  | 'hotel'
  | 'other';

export type SelectorPosture = 'income' | 'trading' | 'owner_occupied' | 'development' | 'operating';
export type SelectorAssetKind = 'office' | 'retail' | 'hotel' | 'residential' | 'industrial' | 'unknown';

export interface SelectLocationPoisOptions {
  posture?: string | null;
  assetType?: string | null;
  /** 최대 선별 수 (기본 5) */
  maxCount?: number;
  /** 최소 목표 수 (기본 3) — 후보가 부족하면 그보다 적을 수 있음 (데이터 날조 금지) */
  minCount?: number;
  /** 랜드마크 거리 상한 (m, 기본 1500) */
  maxLandmarkDistanceM?: number;
  /** 역 거리 상한 (m, 기본 1500) */
  maxStationDistanceM?: number;
  /** 지도 뷰 안에 있는지 판정 (마커를 그릴 수 있는 후보만 선별) */
  isInView?: (c: PoiCandidate) => boolean;
  /** 선택 POI 간 최소 이격 (m, 기본 20) — 지도 마커 중첩 방지 */
  minSeparationM?: number;
}

const WALK_M_PER_MIN = 80;

export function walkMinutesOf(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / WALK_M_PER_MIN));
}

export function formatDistanceLabel(distanceM: number): string {
  if (distanceM > 1200) return `약 ${(distanceM / 1000).toFixed(1)}km`;
  return `도보 ${walkMinutesOf(distanceM)}분`;
}

/** 포스처 문자열 정규화 (value_add 등 비표준 값 → 가장 가까운 포스처) */
export function normalizePosture(posture?: string | null): SelectorPosture {
  const p = String(posture ?? '').toLowerCase();
  if (p.includes('owner') || p.includes('사옥')) return 'owner_occupied';
  if (p.includes('develop') || p.includes('value') || p.includes('개발')) return 'development';
  if (p.includes('operat') || p.includes('hotel') || p.includes('운영')) return 'operating';
  if (p.includes('trad') || p.includes('매매')) return 'trading';
  return 'income';
}

/** 자산유형 문자열 → 자산 성격 분류 */
export function classifyAssetType(assetType?: string | null): SelectorAssetKind {
  const a = String(assetType ?? '').toLowerCase();
  if (!a) return 'unknown';
  if (/호텔|숙박|hotel|resort|리조트|모텔/.test(a)) return 'hotel';
  if (/물류|창고|공장|산업|industrial|logistics|warehouse|지식산업/.test(a)) return 'industrial';
  if (/근생|근린|상가|리테일|retail|판매|쇼핑|상업시설/.test(a)) return 'retail';
  if (/주거|아파트|다가구|다세대|주택|residential|오피스텔|기숙사/.test(a)) return 'residential';
  if (/오피스|업무|사무|office|빌딩/.test(a)) return 'office';
  return 'unknown';
}

/** 후보 1건의 랜드마크 클래스 판정 (카카오 category_name 우선, 없으면 단순 category) */
export function classifyPoi(c: PoiCandidate): PoiClass {
  const name = String(c.name ?? '');
  const cn = String(c.categoryName ?? '');
  const cat = String(c.category ?? '');

  if (cat === 'subway' || /지하철,전철/.test(cn)) return 'station';

  // 도로 시설 (IC/JC/나들목/톨게이트) — 한강공원 진출입로 등 보행 출입구는 제외
  if (cat === 'road' || /도로시설/.test(cn)) {
    if (/진출입로|출입구|육교|계단/.test(name)) return 'other';
    if (/(IC|JC|나들목|톨게이트|분기점|인터체인지)/.test(name)) return 'road';
    return 'other';
  }

  if (/사회,공공기관/.test(cn) || cat === 'public') {
    if (/(시청|구청|군청|도청|법원|검찰청|세무서|경찰서|소방서|우체국|국세청|등기소|출입국)/.test(name)
      && !/(민원실|부속|희망|무인|별관식당)/.test(name)) return 'public_major';
    if (/(주민센터|행정복지센터|지구대|파출소|119안전센터)/.test(name)) return 'public_minor';
    return 'public_minor';
  }

  if (/백화점/.test(cn) && /가정,생활\s*>\s*백화점/.test(cn)) return 'shopping_major';
  if (/대형마트|복합쇼핑몰|쇼핑센터|아울렛/.test(cn)) return 'shopping_major';
  if (/슈퍼마켓|대형슈퍼/.test(cn)) return 'supermarket';
  if (cat === 'shopping' && !cn) {
    // 레거시 keySpots(category_name 없음): 대형마트 그룹(MT1)은 슈퍼마켓 포함 — 이름으로 판정
    if (/(백화점|코스트코|이마트(?!24|에브리데이)|롯데마트|홈플러스(?!익스프레스)|트레이더스|아울렛|몰$|타임스퀘어)/.test(name)) return 'shopping_major';
    return 'supermarket';
  }

  if (/테마거리|상점가|먹자골목|시장/.test(cn) || /(골목형상점가|전통시장|상점가)$/.test(name)) return 'shopping_street';

  if (/의료,건강/.test(cn) || cat === 'hospital') {
    if (/(종합병원|대학병원|상급종합)/.test(cn) || /(대학교병원|대학병원|의료원|성모병원|세브란스|아산병원|삼성서울병원|종합병원)/.test(name)) return 'hospital_major';
    return 'other';
  }

  if (/교육,학문/.test(cn) || cat === 'university') {
    if (/대학교|대학$|University/.test(name) && !/(대학원$|평생교육|어학원)/.test(name)) return 'university';
    return 'other';
  }

  if (/관광,명소|공원/.test(cn) || /공원$/.test(name)) {
    // 둘레길/도보여행 코스는 지점형 랜드마크가 아님
    if (/도보여행|둘레길/.test(cn) || /둘레길|코스$/.test(name)) return 'other';
    return 'park_tourism';
  }
  if (/문화,예술/.test(cn)) return 'culture';
  if (/숙박\s*>\s*호텔/.test(cn) || (/숙박/.test(cn) && /호텔|hotel/i.test(name))) return 'hotel';

  if (cat === 'landmark') {
    // 레거시 키워드 보충 검색 결과 (아파트단지/쇼핑몰/백화점) — 주거 단지·온라인몰은 랜드마크 아님
    if (/부동산\s*>\s*주거시설|아파트/.test(cn) || /아파트|빌라|오피스텔/.test(name)) return 'other';
    if (/통신판매|인터넷쇼핑몰/.test(cn)) return 'other';
    if (/백화점|쇼핑몰|아울렛/.test(name) && !/(중고차|열쇠|축산)/.test(name)) return 'shopping_major';
  }
  return 'other';
}

/** 포스처 × 자산유형별 랜드마크 클래스 가중치 (0 = 선별 제외) */
export function classWeights(posture: SelectorPosture, asset: SelectorAssetKind): Record<PoiClass, number> {
  const base: Record<PoiClass, number> = {
    station: 0, road: 0.3, public_major: 0.9, public_minor: 0.25, shopping_major: 0.8, shopping_street: 0.45,
    supermarket: 0.15, hospital_major: 0.7, university: 0.7, park_tourism: 0.55, culture: 0.2, hotel: 0.45, other: 0,
  };
  const w = { ...base };
  switch (posture) {
    case 'trading':
      Object.assign(w, { public_major: 0.9, shopping_major: 0.8, university: 0.8, hospital_major: 0.75, park_tourism: 0.65, road: 0.4 });
      break;
    case 'owner_occupied':
      // 사옥: 역 + 주요 도로(차량 접근) + 업무/관공서
      Object.assign(w, { road: 1.0, public_major: 0.9, shopping_major: 0.5, hotel: 0.45, hospital_major: 0.5, park_tourism: 0.45, shopping_street: 0.3 });
      break;
    case 'development':
      // 개발: 대로/IC + 쾌적성(공원) + 관공서/대형 상업 (개발 호재성 시설)
      Object.assign(w, { road: 0.95, park_tourism: 0.85, public_major: 0.8, university: 0.6, shopping_major: 0.75, hospital_major: 0.5 });
      break;
    case 'operating':
      // 운영형(호텔 등): 관광지/문화/상권
      Object.assign(w, { park_tourism: 1.0, culture: 0.65, shopping_major: 0.8, shopping_street: 0.8, hotel: 0.3, road: 0.4, public_major: 0.35, university: 0.4, hospital_major: 0.3 });
      break;
    case 'income':
    default:
      break;
  }
  switch (asset) {
    case 'retail':
      Object.assign(w, { shopping_street: 1.0, shopping_major: 0.95, culture: Math.max(w.culture, 0.5), park_tourism: Math.max(w.park_tourism, 0.55), public_major: Math.min(w.public_major, 0.6) });
      break;
    case 'hotel':
      Object.assign(w, { park_tourism: 1.0, culture: 0.7, shopping_major: Math.max(w.shopping_major, 0.8), shopping_street: Math.max(w.shopping_street, 0.75), hotel: 0.3 });
      break;
    case 'industrial':
      Object.assign(w, { road: 1.2, shopping_street: 0.15, culture: 0.1, park_tourism: 0.3 });
      break;
    case 'residential':
      Object.assign(w, { park_tourism: Math.max(w.park_tourism, 0.8), university: Math.max(w.university, 0.75), hospital_major: Math.max(w.hospital_major, 0.75), supermarket: 0.4 });
      break;
    case 'office':
      Object.assign(w, { public_major: Math.max(w.public_major, 0.9), hotel: Math.max(w.hotel, 0.5) });
      break;
    default:
      break;
  }
  return w;
}

/** 역 이름 파싱: "선유도역 9호선" / "선유도역 9호선역" / "당산역" → { base: '선유도역', line: '9호선' } */
export function parseStation(c: PoiCandidate): { base: string; line: string | null } {
  const raw = String(c.name ?? '').trim();
  let m = raw.match(/^(.*?역)\s+(.+?)(?:역)?$/);
  let base = raw;
  let line: string | null = null;
  if (m) {
    base = m[1].trim();
    line = m[2].trim();
  } else {
    base = raw.endsWith('역') ? raw : `${raw}역`;
  }
  if (!line && c.categoryName) {
    m = c.categoryName.match(/지하철,전철\s*>\s*(.+)$/);
    if (m) line = m[1].replace(/^수도권/, '').trim();
  }
  if (line) line = line.replace(/^수도권/, '').trim() || null;
  return { base, line };
}

/** 이름 정규화 (공백/괄호 제거) — 중복 판정용 */
function normName(name: string): string {
  return String(name ?? '').replace(/\s+/g, '').replace(/[()（）]/g, '');
}

/** 두 이름이 같은 장소군인지 (정규화 후 동일하거나 4자 이상 공통 접두 + 첫 토큰 동일) */
function isSamePlaceFamily(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  // 정규화 후 5자 이상 공통 접두 (예: "선유도공원선유도전망대" / "선유도공원수생식물원")
  let k = 0;
  while (k < na.length && k < nb.length && na[k] === nb[k]) k++;
  if (k >= 5) return true;
  const ta = String(a).trim().split(/\s+/)[0];
  const tb = String(b).trim().split(/\s+/)[0];
  return ta.length >= 4 && ta === tb;
}

const POI_DISPLAY_MAX = 16;

function trimDisplayName(name: string): string {
  const n = String(name ?? '').trim();
  return n.length > POI_DISPLAY_MAX ? `${n.slice(0, POI_DISPLAY_MAX - 1)}…` : n;
}

const CLASS_REASON: Record<PoiClass, string> = {
  station: '최근접 지하철역',
  road: '주요 도로·IC 접근성',
  public_major: '관공서·행정 랜드마크',
  public_minor: '생활 행정시설',
  shopping_major: '대형 상업시설',
  shopping_street: '상권(상점가)',
  supermarket: '생활 상업시설',
  hospital_major: '대형 의료시설',
  university: '대학교',
  park_tourism: '관광·녹지 랜드마크',
  culture: '문화시설',
  hotel: '호텔',
  other: '기타',
};

function isValidCandidate(c: PoiCandidate | null | undefined): c is PoiCandidate {
  return !!c
    && typeof c.name === 'string' && c.name.trim().length > 0
    && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))
    && Number.isFinite(Number(c.distanceM)) && Number(c.distanceM) >= 0;
}

/**
 * 실제 카카오 POI 후보에서 포스처/자산유형 맞춤 3~5건을 선별합니다.
 * 후보가 부족하면 있는 만큼만 반환합니다 (임의 생성 금지).
 */
export function selectLocationPois(
  candidates: ReadonlyArray<PoiCandidate> | null | undefined,
  options: SelectLocationPoisOptions = {},
): SelectedPoi[] {
  const maxCount = Math.max(1, Math.min(9, options.maxCount ?? 5));
  const minCount = Math.max(1, Math.min(maxCount, options.minCount ?? 3));
  const maxLandmarkM = options.maxLandmarkDistanceM ?? 1500;
  const maxStationM = options.maxStationDistanceM ?? 1500;
  const inView = options.isInView ?? (() => true);
  const minSepM = Math.max(0, options.minSeparationM ?? 20);
  const posture = normalizePosture(options.posture);
  const asset = classifyAssetType(options.assetType);
  const weights = classWeights(posture, asset);

  const pool = (candidates ?? [])
    .filter(isValidCandidate)
    .map(c => ({ ...c, lat: Number(c.lat), lng: Number(c.lng), distanceM: Math.round(Number(c.distanceM)) }))
    .filter(c => inView(c));

  // ── 1. 역: 동일 역명(base) 병합 → 노선 합치기 ──
  const stationMap = new Map<string, { c: PoiCandidate; lines: string[] }>();
  for (const c of pool) {
    if (classifyPoi(c) !== 'station' || c.distanceM > maxStationM) continue;
    const { base, line } = parseStation(c);
    const cur = stationMap.get(base);
    if (!cur) {
      stationMap.set(base, { c, lines: line ? [line] : [] });
    } else {
      if (c.distanceM < cur.c.distanceM) cur.c = c;
      if (line && !cur.lines.includes(line)) cur.lines.push(line);
    }
  }
  const stations = [...stationMap.entries()]
    .map(([base, v]) => ({ base, ...v }))
    .sort((a, b) => a.c.distanceM - b.c.distanceM);

  const picked: Array<Omit<SelectedPoi, 'index'>> = [];
  const coveredLines = new Set<string>();
  const STATION_CAP = 2;
  // 두 번째 역: 신규 노선을 추가하면서 도보권(사옥/운영형은 1.5km)이거나, 500m 이내 초역세권일 때만
  const secondStationMaxM = posture === 'owner_occupied' || posture === 'operating' ? 1500 : 1000;
  for (const s of stations) {
    if (picked.length >= STATION_CAP) break;
    const isFirst = picked.length === 0;
    const newLines = s.lines.filter(l => !coveredLines.has(l));
    const allowed = isFirst
      || (newLines.length > 0 && s.c.distanceM <= secondStationMaxM)
      || s.c.distanceM <= 500;
    if (!allowed) continue;
    const sortedLines = [...s.lines].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    const allNumbered = sortedLines.length > 0 && sortedLines.every(l => /^\d+호선$/.test(l));
    const lineLabel = sortedLines.length === 0
      ? ''
      : allNumbered
        ? `(${sortedLines.map(l => l.replace(/호선$/, '')).join('·')}호선)`
        : `(${sortedLines.join('·')})`;
    const displayName = `${s.base}${lineLabel}`;
    const distanceLabel = formatDistanceLabel(s.c.distanceM);
    picked.push({
      kind: 'station',
      poiClass: 'station',
      displayName,
      name: s.c.name,
      lat: s.c.lat,
      lng: s.c.lng,
      distanceM: s.c.distanceM,
      walkMinutes: walkMinutesOf(s.c.distanceM),
      distanceLabel,
      label: `${displayName} ${distanceLabel}`,
      reason: isFirst ? '최근접 지하철역' : `추가 노선(${newLines.join('·') || '인접 역'})`,
    });
    s.lines.forEach(l => coveredLines.add(l));
  }

  // ── 2. 랜드마크/도로: 가중치 × 거리 감쇠 ──
  const scored = pool
    .map(c => ({ c, cls: classifyPoi(c) }))
    .filter(({ c, cls }) => cls !== 'station' && cls !== 'other' && c.distanceM <= (cls === 'road' ? Math.max(maxLandmarkM, 3000) : maxLandmarkM))
    .map(({ c, cls }) => ({
      c,
      cls,
      // 별관/분관/출장소 등 부속 시설은 본 시설보다 후순위
      score: ((weights[cls] ?? 0) / (1 + c.distanceM / 700)) * (/(별관|분관|출장소|민원실|부속)/.test(c.name) ? 0.75 : 1),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.distanceM - b.c.distanceM);

  const usedClasses = new Set<PoiClass>();
  const isDupName = (name: string) => picked.some(p => isSamePlaceFamily(p.name, name) || isSamePlaceFamily(p.displayName, name));

  const tryAdd = (x: { c: PoiCandidate; cls: PoiClass; score: number }, relaxed: boolean): boolean => {
    if (picked.length >= maxCount) return false;
    if (!relaxed && usedClasses.has(x.cls)) return false;
    if (isDupName(x.c.name)) return false;
    // 지도 상 마커 중첩 방지: 이미 선택된 POI와 minSeparationM 이내면 제외
    if (picked.some(p => approxDistM(p.lat, p.lng, x.c.lat, x.c.lng) < minSepM)) return false;
    const displayName = trimDisplayName(x.c.name);
    const distanceLabel = formatDistanceLabel(x.c.distanceM);
    picked.push({
      kind: x.cls === 'road' ? 'road' : 'landmark',
      poiClass: x.cls,
      displayName,
      name: x.c.name,
      lat: x.c.lat,
      lng: x.c.lng,
      distanceM: x.c.distanceM,
      walkMinutes: walkMinutesOf(x.c.distanceM),
      distanceLabel,
      label: `${displayName} ${distanceLabel}`,
      reason: CLASS_REASON[x.cls],
    });
    usedClasses.add(x.cls);
    return true;
  };

  // 1차: 의미 있는 점수(≥0.2) + 클래스당 1건
  for (const x of scored) {
    if (picked.length >= maxCount) break;
    if (x.score < 0.2) continue;
    tryAdd(x, false);
  }
  // 2차: 최소 수 미달 시 점수 하한 해제 (여전히 클래스 다양성 유지)
  if (picked.length < minCount) {
    for (const x of scored) {
      if (picked.length >= minCount) break;
      tryAdd(x, false);
    }
  }
  // 3차: 그래도 미달이면 클래스 중복 허용
  if (picked.length < minCount) {
    for (const x of scored) {
      if (picked.length >= minCount) break;
      tryAdd(x, true);
    }
  }

  // 번호: 역 먼저, 이후 거리순 (지도 독해 동선)
  const stationsPicked = picked.filter(p => p.kind === 'station');
  const others = picked.filter(p => p.kind !== 'station').sort((a, b) => a.distanceM - b.distanceM);
  return [...stationsPicked, ...others].slice(0, maxCount).map((p, i) => ({ ...p, index: i + 1 }));
}

function approxDistM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dy = (lat2 - lat1) * 111320;
  const dx = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}
