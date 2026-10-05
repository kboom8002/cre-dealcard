import { describe, it, expect } from 'vitest';
import {
  selectLocationPois,
  classifyPoi,
  parseStation,
  normalizePosture,
  classifyAssetType,
  formatDistanceLabel,
  type PoiCandidate,
} from '@/domain/building/mobile-im/pptx/location-poi-selector';

// 실조회(카카오 로컬 API, 양평동 p5 골든 좌표 37.5376702,126.8947195) 응답을 축약한 고정 픽스처
const LAT = 37.5376702;
const LNG = 126.8947195;
const at = (dxM: number, dyM: number) => ({
  lat: LAT + dyM / 111320,
  lng: LNG + dxM / (111320 * Math.cos(LAT * Math.PI / 180)),
});
const P5: PoiCandidate[] = [
  { name: '선유도역 9호선', distanceM: 133, category: 'subway', categoryName: '교통,수송 > 지하철,전철 > 수도권9호선', ...at(-120, 40) },
  { name: '당산역 2호선', distanceM: 767, category: 'subway', categoryName: '교통,수송 > 지하철,전철 > 수도권2호선', ...at(660, -390) },
  { name: '당산역 9호선', distanceM: 786, category: 'subway', categoryName: '교통,수송 > 지하철,전철 > 수도권9호선', ...at(680, -395) },
  { name: '신목동역 9호선', distanceM: 1262, category: 'subway', categoryName: '교통,수송 > 지하철,전철 > 수도권9호선', ...at(-1200, -390) },
  { name: 'GS더프레시 선유도역점', distanceM: 35, category: 'shopping', categoryName: '가정,생활 > 슈퍼마켓 > 대형슈퍼 > GS더프레시', ...at(30, -18) },
  { name: '코스트코코리아 양평점', distanceM: 1127, category: 'shopping', categoryName: '가정,생활 > 대형마트 > 코스트코코리아', ...at(1100, -250) },
  { name: '서울센트럴치과', distanceM: 5, category: 'hospital', categoryName: '의료,건강 > 병원 > 치과', ...at(3, 4) },
  { name: '서울당산초등학교', distanceM: 264, category: 'university', categoryName: '교육,학문 > 학교 > 초등학교', ...at(200, 170) },
  { name: '양평2동주민센터', distanceM: 143, category: 'public', categoryName: '사회,공공기관 > 지방행정기관 > 행정복지센터 > 동행정복지센터', ...at(-40, -137) },
  { name: '영등포구청 별관', distanceM: 1002, category: 'public', categoryName: '사회,공공기관 > 지방행정기관 > 구청', ...at(950, -320) },
  { name: '영등포구청', distanceM: 1262, category: 'public', categoryName: '사회,공공기관 > 지방행정기관 > 구청', ...at(1200, -390) },
  { name: '선유도역골목형상점가', distanceM: 73, category: 'landmark', categoryName: '여행 > 관광,명소 > 테마거리', ...at(-50, -53) },
  { name: '서울둘레길 14코스 안양천 옛추억길', distanceM: 450, category: 'landmark', categoryName: '여행 > 관광,명소 > 도보여행 > 둘레길 > 서울둘레길', ...at(-450, 10) },
  { name: '선유도공원 선유도전망대', distanceM: 801, category: 'landmark', categoryName: '여행 > 관광,명소 > 전망대', ...at(-200, 775) },
  { name: '선유도 공원 수생식물원', distanceM: 805, category: 'landmark', categoryName: '여행 > 관광,명소 > 수목원,식물원', ...at(-190, 782) },
  { name: '선유도공원 시간의정원', distanceM: 810, category: 'landmark', categoryName: '여행 > 관광,명소 > 수목원,식물원', ...at(-180, 790) },
  { name: '위브스위트 선유파크사이드', distanceM: 151, category: 'landmark', categoryName: '여행 > 숙박 > 호텔', ...at(140, 55) },
  { name: '굿데이모텔 선유도역점', distanceM: 139, category: 'landmark', categoryName: '여행 > 숙박 > 여관,모텔', ...at(130, -48) },
  { name: '선유예술상점', distanceM: 125, category: 'landmark', categoryName: '문화,예술 > 문화시설 > 전시관', ...at(-100, 75) },
  { name: '수성예술아파트', distanceM: 51, category: 'landmark', categoryName: '부동산 > 주거시설 > 아파트', ...at(40, 32) },
  { name: '브룩클리', distanceM: 118, category: 'landmark', categoryName: '가정,생활 > 통신판매 > 인터넷쇼핑몰', ...at(80, 87) },
  { name: '당산나들목', distanceM: 907, category: 'landmark', categoryName: '교통,수송 > 도로시설 > 지하차도', ...at(700, 577) },
  { name: '한강공원노들길나들목 진출입로2', distanceM: 879, category: 'landmark', categoryName: '교통,수송 > 입출구', ...at(600, 640) },
];

const NAMES = new Set(P5.map(c => c.name));

describe('location-poi-selector', () => {
  it('income/오피스: 최근접 역 우선 + 다노선 병합 + 3~5건, 실조회 이름만 사용', () => {
    const sel = selectLocationPois(P5, { posture: 'income', assetType: '오피스빌딩' });
    expect(sel.length).toBeGreaterThanOrEqual(3);
    expect(sel.length).toBeLessThanOrEqual(5);
    expect(sel[0].kind).toBe('station');
    expect(sel[0].displayName).toBe('선유도역(9호선)');
    expect(sel[0].label).toBe('선유도역(9호선) 도보 2분');
    // 당산역 2·9호선 병합 (신규 2호선 추가, 1km 이내)
    expect(sel.some(s => s.displayName === '당산역(2·9호선)')).toBe(true);
    // 번호 1..N 연속
    expect(sel.map(s => s.index)).toEqual(sel.map((_, i) => i + 1));
    // 날조 금지: 모든 선택은 입력 후보에서 온 이름
    for (const s of sel) expect(NAMES.has(s.name)).toBe(true);
    // 랜드마크 아님: 아파트/온라인몰/치과/모텔/둘레길/초등학교 배제
    const banned = ['수성예술아파트', '브룩클리', '서울센트럴치과', '굿데이모텔 선유도역점', '서울둘레길 14코스 안양천 옛추억길', '서울당산초등학교'];
    for (const b of banned) expect(sel.some(s => s.name === b)).toBe(false);
  });

  it('isInView 로 뷰 밖 후보 제외 (마커 번호 = 범례 번호 보장)', () => {
    const sel = selectLocationPois(P5, {
      posture: 'income',
      assetType: '오피스빌딩',
      isInView: c => c.distanceM <= 400,
    });
    expect(sel.every(s => s.distanceM <= 400)).toBe(true);
    expect(sel[0].displayName).toBe('선유도역(9호선)');
    expect(sel.length).toBeGreaterThanOrEqual(3);
  });

  it('동일 장소군(선유도공원 하위 시설) 중복 제거 + 클래스 다양성', () => {
    const sel = selectLocationPois(P5, { posture: 'operating', assetType: '호텔' });
    const parks = sel.filter(s => s.name.replace(/\s+/g, '').startsWith('선유도공원'));
    expect(parks.length).toBe(1);
    const classes = sel.filter(s => s.kind !== 'station').map(s => s.poiClass);
    expect(new Set(classes).size).toBe(classes.length);
  });

  it('development: 주요 도로(나들목) 선별, 보행 진출입로는 배제', () => {
    const sel = selectLocationPois(P5, { posture: 'development' });
    expect(sel.some(s => s.name === '당산나들목' && s.kind === 'road')).toBe(true);
    expect(sel.some(s => s.name.includes('진출입로'))).toBe(false);
  });

  it('retail 자산: 상권(상점가) 우선', () => {
    const sel = selectLocationPois(P5, { posture: 'income', assetType: '근린생활시설' });
    const firstLandmark = sel.find(s => s.kind !== 'station');
    expect(firstLandmark?.poiClass).toBe('shopping_street');
  });

  it('owner_occupied: 역 + 도로 + 관공서 계열', () => {
    const sel = selectLocationPois(P5, { posture: 'owner_occupied', assetType: '오피스' });
    expect(sel[0].kind).toBe('station');
    expect(sel.some(s => s.kind === 'road')).toBe(true);
  });

  it('부속시설(별관)보다 본 시설 우선 선택', () => {
    const sel = selectLocationPois(P5, { posture: 'trading' });
    const gu = sel.filter(s => s.name.startsWith('영등포구청'));
    expect(gu.length).toBeLessThanOrEqual(1);
    if (gu.length === 1) expect(gu[0].name).toBe('영등포구청');
  });

  it('빈/비정상 입력은 빈 배열 (임의 생성 금지)', () => {
    expect(selectLocationPois([], { posture: 'income' })).toEqual([]);
    expect(selectLocationPois(null, {})).toEqual([]);
    expect(selectLocationPois([{ name: '', lat: NaN, lng: 1, distanceM: 1, category: 'subway' }], {})).toEqual([]);
  });

  it('후보 부족 시 있는 만큼만 반환', () => {
    const sel = selectLocationPois(P5.slice(0, 1), { posture: 'income' });
    expect(sel).toHaveLength(1);
  });

  it('보조 함수', () => {
    expect(parseStation({ name: '선유도역 9호선역', lat: 0, lng: 0, distanceM: 1, category: 'subway' })).toEqual({ base: '선유도역', line: '9호선' });
    expect(parseStation({ name: '김포공항', lat: 0, lng: 0, distanceM: 1, category: 'subway', categoryName: '교통,수송 > 지하철,전철 > 공항철도' })).toEqual({ base: '김포공항역', line: '공항철도' });
    expect(classifyPoi({ name: '코스트코코리아 양평점', lat: 0, lng: 0, distanceM: 1, category: 'shopping', categoryName: '가정,생활 > 대형마트 > 코스트코코리아' })).toBe('shopping_major');
    expect(normalizePosture('value_add')).toBe('development');
    expect(normalizePosture(undefined)).toBe('income');
    expect(classifyAssetType('오피스빌딩')).toBe('office');
    expect(classifyAssetType('비즈니스호텔')).toBe('hotel');
    expect(formatDistanceLabel(133)).toBe('도보 2분');
    expect(formatDistanceLabel(1500)).toBe('약 1.5km');
  });
});
