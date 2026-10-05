/**
 * @file location-poi-selector.ts
 * @description 입지 지도(A06 Location)용 POI 정밀 선별기 — 순수 함수 (외부 I/O 없음).
 *
 * 입력: 카카오 로컬 API / V-World 건축물대장에서 실제로 조회된 POI 후보(이름·좌표·직선거리·카테고리)만 사용합니다.
 *       (Rule 34: 이름/거리를 임의 생성하지 않음 — 후보에 없는 랜드마크는 절대 만들지 않는다)
 * 출력: 포스처(income/trading/owner_occupied/development/operating)와 자산유형(오피스/리테일/호텔 등)에
 *       맞춰 3~5건을 다양성 있게 선별한 목록 (번호 1..N, 지도 마커 번호 = 범례 번호).
 *
 * 선별 원칙:
 *  1. 최근접 지하철역 우선 (동일 역 다른 노선은 1건으로 병합: "당산역(2·9호선)")
 *  2. 두 번째 역은 신규 노선을 추가하거나 도보권(≤1km)일 때만
 *  3. 랜드마크 점수 = 클래스가중치(포스처×자산) × 존재감 ÷ (1 + d/900)
 *     존재감 = (1+0.35·log10(연면적/1만㎡)) × (1+0.5/(1+검색정확도순위)) × (1+0.1·min(6, 하위시설수-1))
 *  4. 클래스당 1건 (다양성) — 단, 공원/본사는 점수 ≥ 0.9×최상위일 때 2건까지
 *  5. 같은 건물(폴리곤)·40m 이내·이름 접두 중복은 1건만 — 같은 건물이면 앵커 테넌트(건물 내 POI 최다 브랜드) 우선
 *  6. 노이즈(주차장·출입구·충전소·ATM·어린이집·구내식당·장례식장·응급실·음식점·카페·통신판매·중개·은행·
 *     공원시설물·둘레길·오피스텔·모텔·지구대/파출소)는 후보에서 제외
 *  7. 지도 뷰 밖 후보도 버리지 않는다 — 방향/거리는 bearing 계산으로 제공하고, 마커 배치(가장자리 마커)는 호출측이 담당.
 *     (과거 `isInView` 제외 옵션은 하위 호환으로 유지)
 *
 * 결정성: 입력 순서와 무관 (입력 정규화 정렬 + 명시적 타이브레이커: 점수 desc, 거리 asc, 이름 asc).
 * LLM 미사용 — 결정론적 규칙만 사용하므로 e2e/llm-recordings 리플레이에 영향이 없습니다.
 */

/** 카카오 POI 후보 (kakao-map-api.ts PoiSpot 호환 + 선택적 카카오 category_name / 건축물대장 조인 필드) */
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
  /** 카카오 place id (풀 병합 키) */
  id?: string;
  /** V-World 건축물대장 연면적(㎡) — 건물 폴리곤과 점-폴리곤 조인에 성공한 경우만 */
  gfaSqm?: number;
  /** V-World 건축물대장 지상층수 */
  floors?: number;
  /** 같은 건물 폴리곤 식별자 (V-World feature id) — 같은 건물 중복 제거/앵커 테넌트 판정용 */
  buildingKey?: string;
  /** 건축물대장 건축물명 (건물 자체가 후보인 경우 — 이름은 대장 원문) */
  registerName?: string;
  /** sort=accuracy 검색 응답 내 최고 순위 (0-based, 낮을수록 대표성 높음) */
  accuracyRank?: number;
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
  /** 본건→POI 실제 방위각 (0=북, 시계방향, 도) — `center` 옵션이 주어진 경우만 */
  bearingDeg?: number;
  /** 8방위 한글 (북/북동/동/남동/남/남서/서/북서) */
  direction?: string;
  /** 연면적(㎡) — 건축물대장 조인 값 (있을 때) */
  gfaSqm?: number;
  /** 지도 뷰 밖(가장자리 마커 + 방향 범례) — 호출측(image-optimizer)이 설정 */
  offView?: boolean;
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
  | 'park_major'
  | 'park_small'
  | 'park_tourism'
  | 'corporate_hq'
  | 'major_building'
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
  /** (하위 호환) 지도 뷰 안에 있는지 판정 — 뷰 밖 후보를 선별에서 제외한다. 신규 경로는 isPlaceable 사용 */
  isInView?: (c: PoiCandidate) => boolean;
  /** 마커를 놓을 수 없는 후보(예: 본건 핀 영역과 겹침)만 제외. 뷰 밖 후보는 제외하지 않는다 */
  isPlaceable?: (c: PoiCandidate) => boolean;
  /** 선택 POI 간 최소 이격 (m, 기본 20) — 지도 마커 중첩 방지 */
  minSeparationM?: number;
  /**
   * 중개인이 실제로 입력한 원문 텍스트들 (메모/raw_input/입지 설명/주소 등 — Rule 34: 실입력만, 생성 문구 금지).
   * 후보 풀 안의 대형 기관명이 원문에 언급되면 해당 장소군의 본체 1건에 랜드마크 슬롯을 보장한다 (최대 2건).
   * 미지정/빈 배열이면 기존 선별 결과와 동일하다.
   */
  mentionTexts?: ReadonlyArray<string | null | undefined> | null;
  /**
   * 대형 기관 하한 (렌더 경로 opt-in, 기본 false): 반경 내 대학교/대학병원(≤1km)·대형 문화시설(≤500m)이
   * 점수 경쟁에서 탈락해 아예 빠지는 것을 막는다 — 1차 선별 후 해당 클래스가 비어 있으면 최상위 1건을
   * 가장 낮은 점수의 (보장되지 않은) 랜드마크 자리에 승격한다.
   */
  guaranteeMajorInstitutions?: boolean;
  /** 본건 좌표 — 주어지면 실제 방위각/8방위를 계산해 결과에 포함 */
  center?: { lat: number; lng: number } | null;
  /** 진단용: 중복 제거 후 랜드마크 점수 순위를 전달받는 콜백 (결과에 영향 없음) */
  explain?: (rows: Array<{ name: string; poiClass: PoiClass; score: number; distanceM: number; gfaSqm: number | null; accuracyRank: number | null; isAnchor: boolean }>) => void;
}

/** 대형 본사(사옥) 최소 연면적 (㎡) */
export const HQ_MIN_GFA_SQM = 15000;
/** 대형 건물 최소 연면적 (㎡) */
export const MAJOR_BUILDING_MIN_GFA_SQM = 20000;
/** 동일 위치 중복 판정 거리 (m) */
export const DEDUPE_RADIUS_M = 40;

const WALK_M_PER_MIN = 80;

export function walkMinutesOf(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / WALK_M_PER_MIN));
}

export function formatDistanceLabel(distanceM: number): string {
  if (distanceM > 1200) return `약 ${(distanceM / 1000).toFixed(1)}km`;
  return `도보 ${walkMinutesOf(distanceM)}분`;
}

/** 두 좌표 간 대권거리 (m, haversine) */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 본건(1)→대상(2) 초기 방위각 (도, 0=북, 시계방향, 0~360 미만) */
export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  const norm = ((deg % 360) + 360) % 360;
  // 부동소수 오차로 359.9999… → 360 이 되는 경우 방지
  return norm >= 359.9999995 ? 0 : norm;
}

const DIRECTIONS_KO = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'] as const;

/** 방위각 → 8방위 한글 (경계 ±22.5°: 22.5° 는 북동, 337.5° 는 북) */
export function directionKo(bearing: number): string {
  const b = ((Number(bearing) % 360) + 360) % 360;
  const idx = Math.floor((b + 22.5) / 45) % 8;
  return DIRECTIONS_KO[idx];
}

/** 뷰 밖 POI 범례 한 줄 (예: "선유도공원 북동 0.8km") — 거리·방향은 실제 값, 한글은 네이티브 텍스트로만 렌더 */
export function formatOffViewLabel(displayName: string, direction: string, distanceM: number): string {
  return `${displayName} ${direction} ${(distanceM / 1000).toFixed(1)}km`;
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

/** 노이즈 장소 (이름 기준) — 랜드마크가 될 수 없는 부속·생활 시설 */
const NOISE_NAME = /(주차장|입구|출구|충전소|ATM|어린이집|구내식당|장례식장|응급실|둘레길|오피스텔|모텔|지구대|파출소|공원시설물|진출입로|출입구|통신판매|공인중개)/;
/** 노이즈 장소 (카카오 category_name 기준) */
const NOISE_CATEGORY = /(음식점|카페|통신판매|인터넷쇼핑몰|중개|금융,보험|공원시설물|주차)/;
/** 소규모 공원 (감점) */
const SMALL_PARK_NAME = /(어린이|소공원|쌈지|마을공원|놀이터|꿈나무)/;

/** 후보 1건의 랜드마크 클래스 판정 (카카오 category_name 우선, 없으면 단순 category) */
export function classifyPoi(c: PoiCandidate): PoiClass {
  const name = String(c.name ?? '');
  const cn = String(c.categoryName ?? '');
  const cat = String(c.category ?? '');
  const gfa = Number(c.gfaSqm);
  const hasGfa = Number.isFinite(gfa) && gfa > 0;

  if (cat === 'subway' || /지하철,전철/.test(cn)) return 'station';

  // 노이즈: 이름 기준 → (본사/사옥은 연면적 검증 후) → 카테고리 기준
  if (NOISE_NAME.test(name)) return 'other';

  // 대형 본사/사옥: 이름에 본사/사옥 + 연면적 ≥ 15,000㎡ 필수 (소형 입주사 본사 배제)
  if (/(본사|사옥)/.test(name) && hasGfa && gfa >= HQ_MIN_GFA_SQM && !/프랜차이즈/.test(cn)) return 'corporate_hq';

  if (NOISE_CATEGORY.test(cn)) return 'other';

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

  // 공원: 대형(본체) vs 소형(어린이/소/쌈지/마을공원 — 감점)
  if (/공원/.test(cn) || /공원$/.test(name)) {
    if (/도보여행|둘레길/.test(cn) || /둘레길|코스$/.test(name)) return 'other';
    return SMALL_PARK_NAME.test(name) ? 'park_small' : 'park_major';
  }
  if (/관광,명소/.test(cn)) {
    // 둘레길/도보여행 코스는 지점형 랜드마크가 아님
    if (/도보여행|둘레길/.test(cn) || /둘레길|코스$/.test(name)) return 'other';
    return 'park_tourism';
  }
  if (/문화,예술/.test(cn)) return 'culture';
  if (/숙박\s*>\s*호텔/.test(cn) || (/숙박/.test(cn) && /호텔|hotel/i.test(name))) return 'hotel';

  // 대형 건물: 연면적 ≥ 20,000㎡ 비주거 (카카오 빌딩/기업 카테고리 또는 건축물대장 원천)
  if (hasGfa && gfa >= MAJOR_BUILDING_MIN_GFA_SQM
    && !/주거시설|아파트|빌라/.test(cn) && !/아파트|빌라/.test(name)
    && (c.registerName || cat === 'landmark' || /빌딩|기업|건축물대장|타워|부동산|시설,건물/.test(cn))) return 'major_building';

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
    supermarket: 0.15, hospital_major: 0.7, university: 0.7,
    park_major: 0.7, park_small: 0.12, park_tourism: 0.55,
    corporate_hq: 0.9, major_building: 0.7,
    culture: 0.2, hotel: 0.45, other: 0,
  };
  const w = { ...base };
  switch (posture) {
    case 'trading':
      Object.assign(w, { public_major: 0.9, shopping_major: 0.8, university: 0.8, hospital_major: 0.75, park_tourism: 0.65, park_major: 0.75, road: 0.4 });
      break;
    case 'owner_occupied':
      // 사옥: 역 + 주요 도로(차량 접근) + 업무/관공서 + 인접 대형 사옥
      Object.assign(w, { road: 1.0, public_major: 0.9, shopping_major: 0.5, hotel: 0.45, hospital_major: 0.5, park_tourism: 0.45, park_major: 0.5, shopping_street: 0.3, corporate_hq: 1.0, major_building: 0.8 });
      break;
    case 'development':
      // 개발: 대로/IC + 쾌적성(공원) + 관공서/대형 상업 (개발 호재성 시설)
      Object.assign(w, { road: 0.95, park_tourism: 0.85, park_major: 0.85, public_major: 0.8, university: 0.6, shopping_major: 0.75, hospital_major: 0.5, corporate_hq: 0.7, major_building: 0.6 });
      break;
    case 'operating':
      // 운영형(호텔 등): 관광지/문화/상권
      Object.assign(w, { park_tourism: 1.0, park_major: 1.0, culture: 0.65, shopping_major: 0.8, shopping_street: 0.8, hotel: 0.3, road: 0.4, public_major: 0.35, university: 0.4, hospital_major: 0.3, corporate_hq: 0.3, major_building: 0.3 });
      break;
    case 'income':
    default:
      break;
  }
  switch (asset) {
    case 'retail':
      Object.assign(w, { shopping_street: 1.0, shopping_major: 0.95, culture: Math.max(w.culture, 0.5), park_tourism: Math.max(w.park_tourism, 0.55), park_major: Math.max(w.park_major, 0.55), public_major: Math.min(w.public_major, 0.6), corporate_hq: Math.min(w.corporate_hq, 0.5), major_building: Math.min(w.major_building, 0.5) });
      break;
    case 'hotel':
      Object.assign(w, { park_tourism: 1.0, park_major: 1.0, culture: 0.7, shopping_major: Math.max(w.shopping_major, 0.8), shopping_street: Math.max(w.shopping_street, 0.75), hotel: 0.3, corporate_hq: Math.min(w.corporate_hq, 0.4), major_building: Math.min(w.major_building, 0.4) });
      break;
    case 'industrial':
      Object.assign(w, { road: 1.2, shopping_street: 0.15, culture: 0.1, park_tourism: 0.3, park_major: 0.3, corporate_hq: Math.min(w.corporate_hq, 0.6), major_building: Math.min(w.major_building, 0.5) });
      break;
    case 'residential':
      Object.assign(w, { park_tourism: Math.max(w.park_tourism, 0.8), park_major: Math.max(w.park_major, 0.8), university: Math.max(w.university, 0.75), hospital_major: Math.max(w.hospital_major, 0.75), supermarket: 0.4, corporate_hq: Math.min(w.corporate_hq, 0.3), major_building: Math.min(w.major_building, 0.3) });
      break;
    case 'office':
      Object.assign(w, { public_major: Math.max(w.public_major, 0.9), hotel: Math.max(w.hotel, 0.5), corporate_hq: Math.max(w.corporate_hq, 0.95), major_building: Math.max(w.major_building, 0.75) });
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

/** 라벨 길이 초과 시 말줄임('…') 없이 축약: 단어 경계 축약 → (단일 단어) 최대 길이 절단. 고유명 자체는 치환하지 않는다 */
function trimDisplayName(name: string): string {
  const n = String(name ?? '').trim();
  if (n.length <= POI_DISPLAY_MAX) return n;
  const words = n.split(/\s+/).filter(Boolean);
  for (let k = words.length - 1; k >= 1; k--) {
    const c = words.slice(0, k).join(' ');
    if (c.length <= POI_DISPLAY_MAX) return c;
  }
  return n.slice(0, POI_DISPLAY_MAX);
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
  park_major: '대형 공원·녹지',
  park_small: '소규모 공원',
  park_tourism: '관광·녹지 랜드마크',
  corporate_hq: '대기업 본사·사옥',
  major_building: '대형 업무·복합 건물',
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

/** 존재감 계수: (1+0.35·log10(gfa/1만)) × (1+0.5/(1+정확도순위)) × (1+0.1·min(6, 하위시설수-1)) */
export function prominenceOf(c: Pick<PoiCandidate, 'gfaSqm' | 'accuracyRank'>, subfacilities = 1): number {
  const gfa = Number(c.gfaSqm);
  const gfaF = Number.isFinite(gfa) && gfa > 0 ? Math.max(0.5, 1 + 0.35 * Math.log10(gfa / 10000)) : 1;
  const rank = Number(c.accuracyRank);
  const rankF = c.accuracyRank != null && Number.isFinite(rank) && rank >= 0 ? 1 + 0.5 / (1 + rank) : 1;
  const subF = 1 + 0.1 * Math.min(6, Math.max(0, subfacilities - 1));
  return gfaF * rankF * subF;
}

/** 브랜드 토큰 (앵커 테넌트 판정용): 첫 공백 토큰, 공백이 없고 긴 이름은 앞 4자 */
export function brandTokenOf(name: string): string {
  const n = String(name ?? '').replace(/[(（][^)）]*[)）]/g, '').trim();
  const first = n.split(/\s+/)[0] ?? '';
  return first.length > 6 && first === n ? first.slice(0, 4) : first;
}
const brandOf = brandTokenOf;

/** 이름 오름차순 비교 (로케일 비의존 — 결정성) */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 기관 본체가 될 수 없는 부속명 (정문/응급센터/주차/신관 등) — 언급·하한 보장의 앵커 후보에서 제외 */
const ACCESSORY_NAME = /(정문|후문|쪽문|응급|주차|장례|신관|별관|본관|동관|서관|남관|북관|분관|부속|민원|무인|편의점|카페|식당|매점|기숙사|입구|출구)/;
/** 대형 문화시설 이름 패턴 (하한 보장 대상 — 일반 갤러리/소규모 전시관은 제외) */
const MAJOR_CULTURE_NAME = /(아트센터|아트홀|문화예술회관|문화회관|예술의전당|오페라|콘서트홀|박물관|미술관|국립극장|대극장)/;
/** 캠퍼스 본체가 아닌 대학 부속·대학원 전용·연구/교육 시설 (대학교 하한 보장 대상 제외) */
const NON_CAMPUS_NAME = /(대학원|SLP|평생|교육원|연구|산학|어학|도서관|기숙사|캠퍼스타운|창업|보육|센터)/;
/** 원문 언급 보장 대상 클래스 — 호텔/본사/대형건물은 본건·동일 브랜드 오매칭 위험이 있어 제외 */
const MENTION_ANCHOR_CLASSES: ReadonlySet<PoiClass> = new Set<PoiClass>(['university', 'hospital_major', 'culture', 'park_major', 'park_tourism', 'public_major', 'shopping_major', 'shopping_street']);

/**
 * 장소명이 중개인 원문에서 어떻게 언급될 수 있는지의 키 집합 (공백 제거 정규화 기준, 3자 이상만).
 * 예: "이화여자대학교" → 이화여자대학교/이화여자대/이화여대, "강남을지대학교병원" → …/을지병원,
 *     "한양대학교 구리병원" → 한양대/한양대구리병원/구리병원, "롯데백화점 구리점" → 롯데백화점.
 * 후보 이름에서만 파생 — 원문에 없는 이름을 만들지 않는다 (Rule 34).
 */
export function mentionKeysOf(name: string): string[] {
  const n = normName(name);
  const keys = new Set<string>();
  const add = (k: string) => { if (k.length >= 3) keys.add(k); };
  add(n);
  // 첫 토큰(브랜드/고유명) — 4자 이상일 때만 (예: "롯데백화점", "선유도공원")
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  if (first && first !== String(name ?? '').trim() && normName(first).length >= 4) add(normName(first));
  const m = n.match(/^(.*?)(여자)?(대학교|대학)(.*)$/);
  if (m && (m[1] + (m[2] ?? '')).length >= 2) {
    const base = m[1] + (m[2] ?? '');
    const rest = m[4] ?? '';
    add(`${base}대`);
    add(`${base}대학교`);
    if (m[2]) add(`${m[1]}여대`);
    if (/(병원|의료원)$/.test(rest)) {
      add(`${base}대${rest}`);
      if (rest.length >= 4) add(rest);
      // "강남을지대학교병원" ← "을지병원": 앞 지역 접두를 떼어낸 접미 조합
      if (rest === '병원' || rest === '의료원') for (let i = 0; i + 2 <= base.length; i++) add(`${base.slice(i)}${rest}`);
    }
  }
  return [...keys];
}

/** 원문 텍스트들을 공백 제거·결합한 검색용 문자열 */
function normalizeMentionText(texts: ReadonlyArray<string | null | undefined> | null | undefined): string {
  return (texts ?? []).map(t => normName(String(t ?? ''))).filter(Boolean).join('|');
}

/** 입력 정규화 정렬 키: 입력 순서와 무관한 결과를 위해 후보를 (거리, 이름, 좌표, id) 순으로 고정 */
function canonicalCompare(a: PoiCandidate, b: PoiCandidate): number {
  return a.distanceM - b.distanceM
    || cmpStr(a.name, b.name)
    || a.lat - b.lat
    || a.lng - b.lng
    || cmpStr(String(a.id ?? ''), String(b.id ?? ''))
    || cmpStr(String(a.buildingKey ?? ''), String(b.buildingKey ?? ''));
}

/**
 * 실제 POI 후보에서 포스처/자산유형 맞춤 3~5건을 선별합니다.
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
  const placeable = options.isPlaceable ?? (() => true);
  const minSepM = Math.max(0, options.minSeparationM ?? 20);
  const posture = normalizePosture(options.posture);
  const asset = classifyAssetType(options.assetType);
  const weights = classWeights(posture, asset);
  const center = options.center && Number.isFinite(Number(options.center.lat)) && Number.isFinite(Number(options.center.lng))
    ? { lat: Number(options.center.lat), lng: Number(options.center.lng) }
    : null;

  const pool = (candidates ?? [])
    .filter(isValidCandidate)
    .map(c => ({ ...c, lat: Number(c.lat), lng: Number(c.lng), distanceM: Math.round(Number(c.distanceM)) }))
    .sort(canonicalCompare)
    .filter(c => inView(c) && placeable(c));

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
    .sort((a, b) => a.c.distanceM - b.c.distanceM || cmpStr(a.base, b.base));

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

  // ── 2. 랜드마크/도로: 클래스가중치 × 존재감 ÷ 거리 감쇠 ──
  const classified = pool.map(c => ({ c, cls: classifyPoi(c) }));

  // 하위시설 수: 같은 장소군(이름 접두 공유) 비-역·비-노이즈 후보 수 (자기 포함) — 입력 순서와 무관
  const eligible = classified.filter(x => x.cls !== 'station' && x.cls !== 'other');
  const subCount = (c: PoiCandidate): number => {
    let n = 0;
    for (const o of eligible) if (isSamePlaceFamily(o.c.name, c.name)) n++;
    return Math.max(1, n);
  };

  // 앵커 테넌트: 같은 건물(buildingKey) 안에서 POI가 가장 많은 브랜드 (동수면 정확도 순위 → 이름)
  const anchorBrandByBuilding = new Map<string, string>();
  {
    const perBuilding = new Map<string, Map<string, { n: number; rank: number }>>();
    for (const { c } of classified) {
      if (!c.buildingKey || c.registerName) continue;
      const brand = brandOf(c.name);
      if (!brand) continue;
      const m = perBuilding.get(c.buildingKey) ?? new Map<string, { n: number; rank: number }>();
      const cur = m.get(brand) ?? { n: 0, rank: Infinity };
      cur.n += 1;
      cur.rank = Math.min(cur.rank, c.accuracyRank != null && Number.isFinite(Number(c.accuracyRank)) ? Number(c.accuracyRank) : 99);
      m.set(brand, cur);
      perBuilding.set(c.buildingKey, m);
    }
    for (const [key, m] of perBuilding) {
      const best = [...m.entries()].sort((a, b) => b[1].n - a[1].n || a[1].rank - b[1].rank || cmpStr(a[0], b[0]))[0];
      if (best) anchorBrandByBuilding.set(key, best[0]);
    }
  }

  type Scored = { c: PoiCandidate; cls: PoiClass; score: number; isAnchor: boolean };
  const scored: Scored[] = classified
    .filter(({ c, cls }) => cls !== 'station' && cls !== 'other' && c.distanceM <= (cls === 'road' ? Math.max(maxLandmarkM, 3000) : maxLandmarkM))
    .map(({ c, cls }): Scored => ({
      c,
      cls,
      // 별관/분관/출장소 등 부속 시설은 본 시설보다 후순위
      score: ((weights[cls] ?? 0) * prominenceOf(c, subCount(c)) / (1 + c.distanceM / 900)) * (/(별관|분관|출장소|민원실|부속)/.test(c.name) ? 0.75 : 1),
      isAnchor: !!c.buildingKey && (c.registerName ? false : anchorBrandByBuilding.get(c.buildingKey) === brandOf(c.name)),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.distanceM - b.c.distanceM || cmpStr(a.c.name, b.c.name));

  // 같은 건물 / 40m 이내 중복 제거 — 같은 건물이면 앵커 테넌트 우선 (그 외에는 점수가 높은 쪽)
  const deduped: Scored[] = [];
  for (const x of scored) {
    const idx = deduped.findIndex(k =>
      (!!x.c.buildingKey && x.c.buildingKey === k.c.buildingKey)
      || approxDistM(k.c.lat, k.c.lng, x.c.lat, x.c.lng) < DEDUPE_RADIUS_M);
    if (idx < 0) {
      deduped.push(x);
      continue;
    }
    const k = deduped[idx];
    const sameBuilding = !!x.c.buildingKey && x.c.buildingKey === k.c.buildingKey;
    if (sameBuilding && x.isAnchor && !k.isAnchor) deduped[idx] = x;
  }
  deduped.sort((a, b) => b.score - a.score || a.c.distanceM - b.c.distanceM || cmpStr(a.c.name, b.c.name));
  options.explain?.(deduped.map(x => ({
    name: x.c.name, poiClass: x.cls, score: x.score, distanceM: x.c.distanceM,
    gfaSqm: x.c.gfaSqm ?? null, accuracyRank: x.c.accuracyRank ?? null, isAnchor: x.isAnchor,
  })));

  const topScore = deduped.length > 0 ? deduped[0].score : 0;
  const classCount = new Map<PoiClass, number>();
  const isDupName = (name: string) => picked.some(p => isSamePlaceFamily(p.name, name) || isSamePlaceFamily(p.displayName, name));

  const tryAdd = (x: Scored, relaxed: boolean, allowSecond = false): boolean => {
    if (picked.length >= maxCount) return false;
    // 클래스당 1건 — 공원(대형)/본사는 (다양성 1차 선별 후 슬롯이 남고) 점수 ≥ 0.9×최상위이면 2건까지
    const cap = allowSecond && (x.cls === 'park_major' || x.cls === 'corporate_hq') && x.score >= 0.9 * topScore ? 2 : 1;
    if (!relaxed && (classCount.get(x.cls) ?? 0) >= cap) return false;
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
      ...(x.c.gfaSqm != null && Number.isFinite(Number(x.c.gfaSqm)) ? { gfaSqm: Number(x.c.gfaSqm) } : {}),
    });
    classCount.set(x.cls, (classCount.get(x.cls) ?? 0) + 1);
    return true;
  };

  // 0차: 중개인 원문에 언급된 대형 기관 — 해당 장소군의 본체(가장 짧은 이름) 1건씩, 최대 2건에 슬롯 보장.
  //      부속명(정문/응급/주차/신관 등)은 앵커가 될 수 없고, 같은 장소군 부속 후보는 isDupName 으로 흡수된다.
  //      mentionTexts 가 비어 있으면 아무것도 하지 않는다 (기존 결과와 동일).
  const guaranteed = new Set<string>();
  const mentionNorm = normalizeMentionText(options.mentionTexts);
  if (mentionNorm) {
    const matched = deduped.filter(x => MENTION_ANCHOR_CLASSES.has(x.cls) && !ACCESSORY_NAME.test(x.c.name) && mentionKeysOf(x.c.name).some(k => mentionNorm.includes(k)));
    const anchors: Scored[] = [];
    const byShortName = [...matched].sort((a, b) =>
      normName(a.c.name).length - normName(b.c.name).length || b.score - a.score || a.c.distanceM - b.c.distanceM || cmpStr(a.c.name, b.c.name));
    for (const x of byShortName) {
      if (anchors.some(a => isSamePlaceFamily(a.c.name, x.c.name))) continue;
      anchors.push(x);
    }
    anchors.sort((a, b) => b.score - a.score || a.c.distanceM - b.c.distanceM || cmpStr(a.c.name, b.c.name));
    for (const x of anchors.slice(0, 2)) {
      if (tryAdd(x, true)) guaranteed.add(x.c.name);
    }
  }
  // 1차: 의미 있는 점수(≥0.2) + 클래스당 1건 (클래스 다양성 우선)
  for (const x of deduped) {
    if (picked.length >= maxCount) break;
    if (x.score < 0.2) continue;
    tryAdd(x, false);
  }
  // 1.5차: 슬롯이 남으면 공원/본사 2번째 슬롯 (점수 ≥ 0.9×최상위)
  for (const x of deduped) {
    if (picked.length >= maxCount) break;
    if (x.score < 0.2) continue;
    tryAdd(x, false, true);
  }
  // 2차: 최소 수 미달 시 점수 하한 해제 (여전히 클래스 다양성 유지)
  if (picked.length < minCount) {
    for (const x of deduped) {
      if (picked.length >= minCount) break;
      tryAdd(x, false);
    }
  }
  // 3차: 그래도 미달이면 클래스 중복 허용
  if (picked.length < minCount) {
    for (const x of deduped) {
      if (picked.length >= minCount) break;
      tryAdd(x, true);
    }
  }

  // 4차 (opt-in): 대형 기관 하한 — 반경 내 대학교/대학병원/대형 문화시설이 점수 경쟁에서 통째로 탈락한 경우,
  //      클래스가 비어 있으면 최상위 1건을 (보장되지 않은 랜드마크 중) 가장 낮은 점수 자리에 승격한다.
  if (options.guaranteeMajorInstitutions) {
    const FLOOR_MAX = 1;
    const floorCands = deduped.filter(x => x.score >= 0.2 && !ACCESSORY_NAME.test(x.c.name)
      && (((x.cls === 'hospital_major' || x.cls === 'university') && x.c.distanceM <= 1000 && (weights[x.cls] ?? 0) >= 0.4
        && /(대학교|대학|병원|의료원)$/.test(x.c.name.trim()) && !NON_CAMPUS_NAME.test(x.c.name))
        || (x.cls === 'culture' && MAJOR_CULTURE_NAME.test(x.c.name) && x.c.distanceM <= 500)));
    const scoreOf = new Map(deduped.map(x => [x.c.name, x.score] as const));
    let promoted = 0;
    for (const x of floorCands) {
      if (promoted >= FLOOR_MAX) break;
      if ((classCount.get(x.cls) ?? 0) > 0) continue;
      if (picked.some(p => p.name === x.c.name) || isDupName(x.c.name)) continue;
      if (picked.length < maxCount) {
        if (tryAdd(x, true)) promoted++;
        continue;
      }
      // 가장 약한 (역·보장 제외) 랜드마크를 비우고 승격 — 실패하면 원복
      const victims = picked.filter(p => p.kind !== 'station' && !guaranteed.has(p.name))
        .sort((a, b) => (scoreOf.get(a.name) ?? 0) - (scoreOf.get(b.name) ?? 0) || b.distanceM - a.distanceM || cmpStr(a.name, b.name));
      const victim = victims[0];
      if (!victim) break;
      const vIdx = picked.indexOf(victim);
      picked.splice(vIdx, 1);
      classCount.set(victim.poiClass, Math.max(0, (classCount.get(victim.poiClass) ?? 1) - 1));
      if (tryAdd(x, true)) { promoted++; continue; }
      picked.splice(vIdx, 0, victim);
      classCount.set(victim.poiClass, (classCount.get(victim.poiClass) ?? 0) + 1);
    }
  }

  // 번호: 역 먼저, 이후 거리순 (지도 독해 동선) — 동거리면 이름순
  const stationsPicked = picked.filter(p => p.kind === 'station');
  const others = picked.filter(p => p.kind !== 'station').sort((a, b) => a.distanceM - b.distanceM || cmpStr(a.name, b.name));
  return [...stationsPicked, ...others].slice(0, maxCount).map((p, i) => {
    const out: SelectedPoi = { ...p, index: i + 1 };
    if (center) {
      const b = bearingDeg(center.lat, center.lng, p.lat, p.lng);
      out.bearingDeg = Math.round(b * 10) / 10;
      out.direction = directionKo(b);
    }
    return out;
  });
}

function approxDistM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dy = (lat2 - lat1) * 111320;
  const dx = (lng2 - lng1) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}
