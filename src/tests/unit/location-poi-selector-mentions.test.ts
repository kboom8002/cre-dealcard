/**
 * 중개인 원문 언급 장소 슬롯 보장(mentionTexts) + 대형 기관 하한(guaranteeMajorInstitutions) 테스트
 * - 합성 후보 + p5 실조회 풀 픽스처 (LLM/네트워크 미사용)
 * - 핵심 불변식: mentionTexts 미지정/빈 배열이면 기존 선별 결과와 100% 동일, 입력 순서 불변(결정성)
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  mentionKeysOf,
  selectLocationPois,
  type PoiCandidate,
} from '@/domain/building/mobile-im/pptx/location-poi-selector';
import { collectBrokerMentionTexts } from '@/domain/building/mobile-im/pptx/utils/broker-mention-texts';
import type { LandmarkPool } from '@/lib/external/landmark-pool';

const CENTER = { lat: 37.5, lng: 127.0 };
let seq = 0;
/** 본건에서 distanceM 만큼 떨어진 후보 (각도는 순번으로 분산 → 40m 중복/이격 규칙과 무관) */
function cand(name: string, distanceM: number, categoryName: string, category = 'landmark', extra: Partial<PoiCandidate> = {}): PoiCandidate {
  const ang = (seq++ * 67) % 360;
  const rad = (ang * Math.PI) / 180;
  const dLat = (distanceM * Math.cos(rad)) / 111320;
  const dLng = (distanceM * Math.sin(rad)) / (111320 * Math.cos((CENTER.lat * Math.PI) / 180));
  return { name, lat: CENTER.lat + dLat, lng: CENTER.lng + dLng, distanceM, category, categoryName, id: `id-${name}-${distanceM}`, accuracyRank: 3, ...extra };
}

function basePool(): PoiCandidate[] {
  seq = 0;
  return [
    cand('테스트역 2호선', 300, '교통,수송 > 지하철,전철 > 수도권2호선', 'subway'),
    cand('테스트역 9호선', 305, '교통,수송 > 지하철,전철 > 수도권9호선', 'subway'),
    cand('가나다공원', 250, '여행 > 공원 > 도시근린공원', 'landmark'),
    cand('롯데백화점 테스트점', 400, '가정,생활 > 백화점', 'landmark'),
    cand('테스트구청', 450, '사회,공공기관 > 행정기관 > 구청', 'public'),
    cand('에이비씨 본사', 500, '기업 > 기업', 'landmark', { gfaSqm: 30000, buildingKey: 'b-hq' }),
    // 점수 경쟁에서 밀리는 대형 기관들 (원거리 → 거리 감쇠)
    cand('강남을지대학교병원', 900, '의료,건강 > 종합병원', 'hospital'),
    cand('한양대학교 구리병원', 950, '의료,건강 > 종합병원', 'hospital'),
    cand('한양대학교 구리병원 정문', 940, '교통,수송 > 입출구', 'landmark'),
    cand('한양대학교구리병원 응급의료센터', 945, '의료,건강 > 병원 > 응급실', 'hospital'),
    cand('한양대학교구리병원 주차장1', 955, '교통,수송 > 교통시설 > 주차장', 'landmark'),
    cand('한전아트센터', 166, '문화,예술 > 문화시설 > 공연장,극장', 'landmark'),
    cand('서강대학교SLP 목동', 800, '교육,학문 > 대학교', 'university'),
  ];
}

const OPT = { posture: 'income', assetType: '오피스빌딩', center: CENTER } as const;
const names = (r: ReturnType<typeof selectLocationPois>) => r.map(p => p.name);

describe('mentionTexts — 기본값 동일성/결정성', () => {
  it('미지정·빈 배열·null·공백 문자열이면 기존 결과와 완전히 동일하다', () => {
    const pool = basePool();
    const base = selectLocationPois(pool, OPT);
    expect(selectLocationPois(pool, { ...OPT, mentionTexts: [] })).toEqual(base);
    expect(selectLocationPois(pool, { ...OPT, mentionTexts: null })).toEqual(base);
    expect(selectLocationPois(pool, { ...OPT, mentionTexts: ['', '   ', undefined, null] })).toEqual(base);
  });

  it('원문에 후보 이름이 전혀 없으면 결과가 바뀌지 않는다', () => {
    const pool = basePool();
    const base = selectLocationPois(pool, OPT);
    expect(selectLocationPois(pool, { ...OPT, mentionTexts: ['서울 강남구 테헤란로 1 연면적 3,000㎡ 매각가 100억'] })).toEqual(base);
  });

  it('입력 순서를 뒤집어도 mentionTexts/하한 적용 결과가 동일하다', () => {
    const pool = basePool();
    const o = { ...OPT, mentionTexts: ['을지병원 사거리 인근'], guaranteeMajorInstitutions: true };
    const a = selectLocationPois(pool, o);
    const b = selectLocationPois([...pool].reverse(), o);
    const c = selectLocationPois([...pool].sort((x, y) => x.name.localeCompare(y.name)), o);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});

describe('mentionTexts — 원문 언급 장소 슬롯 보장', () => {
  it('언급 없으면 원거리 대학병원은 탈락, 언급("을지병원 사거리")되면 선택된다', () => {
    const pool = basePool();
    expect(names(selectLocationPois(pool, OPT))).not.toContain('강남을지대학교병원');
    const withMention = selectLocationPois(pool, { ...OPT, mentionTexts: ['도산대로·을지병원 사거리 인근'] });
    expect(names(withMention)).toContain('강남을지대학교병원');
    expect(withMention.length).toBeLessThanOrEqual(5);
    // 역은 그대로 최우선
    expect(withMention[0].kind).toBe('station');
  });

  it('언급된 장소의 부속 후보(정문/응급/주차)는 앵커가 되지 못하고 본체 1건만 선택된다', () => {
    const pool = basePool();
    const r = selectLocationPois(pool, { ...OPT, mentionTexts: ['한양대학교 구리병원 인근'] });
    const hanyang = names(r).filter(n => n.includes('한양대'));
    expect(hanyang).toEqual(['한양대학교 구리병원']);
  });

  it('부속명만 언급되면 보장하지 않는다 (정문/응급 등은 앵커 불가)', () => {
    const pool = basePool().filter(c => c.name !== '한양대학교 구리병원');
    const r = selectLocationPois(pool, { ...OPT, mentionTexts: ['한양대학교 구리병원 정문 앞'] });
    expect(names(r).some(n => /정문|응급|주차/.test(n))).toBe(false);
  });

  it('호텔·본사 클래스는 동일 브랜드 오매칭 방지를 위해 언급 보장 대상이 아니다', () => {
    seq = 0;
    const pool = [
      ...basePool(),
      cand('에이치에비뉴 호텔 이대점', 600, '숙박 > 호텔', 'landmark'),
    ];
    const base = selectLocationPois(pool, OPT);
    const r = selectLocationPois(pool, { ...OPT, mentionTexts: ['에이치에비뉴호텔 이대점 매각'] });
    expect(r).toEqual(base);
  });

  it('언급 보장은 최대 2건', () => {
    const pool = basePool();
    const r = selectLocationPois(pool, {
      ...OPT,
      mentionTexts: ['을지병원 / 한양대학교 구리병원 / 한전아트센터 모두 인근'],
    });
    const guaranteedHit = ['강남을지대학교병원', '한양대학교 구리병원', '한전아트센터'].filter(n => names(r).includes(n));
    expect(guaranteedHit.length).toBeGreaterThanOrEqual(2);
    expect(r.length).toBeLessThanOrEqual(5);
  });

  it('소재지(도로명)에 언급된 대학 약칭도 매칭한다 (이화여대길 → 이화여자대학교)', () => {
    seq = 0;
    const pool = [
      ...basePool().slice(0, 6),
      cand('이화여자대학교', 430, '교육,학문 > 대학교', 'university'),
      cand('이화여자대학교 정문', 43, '교통,수송 > 입출구', 'landmark'),
    ];
    const r = selectLocationPois(pool, { ...OPT, mentionTexts: ['서울 서대문구 이화여대길 51'] });
    expect(names(r)).toContain('이화여자대학교');
    expect(names(r)).not.toContain('이화여자대학교 정문');
  });
});

describe('mentionKeysOf — 후보 이름에서만 파생', () => {
  it('대학/병원/브랜드 약칭 키', () => {
    expect(mentionKeysOf('이화여자대학교')).toEqual(expect.arrayContaining(['이화여자대학교', '이화여자대', '이화여대']));
    expect(mentionKeysOf('강남을지대학교병원')).toEqual(expect.arrayContaining(['을지병원', '강남을지병원']));
    expect(mentionKeysOf('한양대학교 구리병원')).toEqual(expect.arrayContaining(['한양대', '한양대구리병원', '구리병원']));
    expect(mentionKeysOf('롯데백화점 구리점')).toContain('롯데백화점');
    // 3자 미만 키는 만들지 않는다
    expect(mentionKeysOf('시청').length).toBe(0);
  });
});

describe('guaranteeMajorInstitutions — 대형 기관 하한 (opt-in)', () => {
  it('기본(off)에서는 기존 결과와 동일', () => {
    const pool = basePool();
    expect(selectLocationPois(pool, { ...OPT, guaranteeMajorInstitutions: false })).toEqual(selectLocationPois(pool, OPT));
  });

  it('on: 점수 경쟁에서 통째로 탈락한 대학병원/대형 문화시설이 1건 승격되고 최대 5건 유지', () => {
    const pool = basePool();
    const off = selectLocationPois(pool, OPT);
    const on = selectLocationPois(pool, { ...OPT, guaranteeMajorInstitutions: true });
    const institutional = (r: typeof on) => r.filter(p => p.poiClass === 'hospital_major' || p.poiClass === 'university' || p.name === '한전아트센터');
    expect(institutional(off).length).toBe(0);
    expect(institutional(on).length).toBe(1);
    expect(on.length).toBeLessThanOrEqual(5);
    expect(on.filter(p => p.kind === 'station').length).toBe(off.filter(p => p.kind === 'station').length);
  });

  it('on: 부속명·캠퍼스 외 시설(SLP 등)·정문은 하한 후보가 아니다', () => {
    const pool = basePool().filter(c => !['강남을지대학교병원', '한양대학교 구리병원', '한전아트센터'].includes(c.name));
    const on = selectLocationPois(pool, { ...OPT, guaranteeMajorInstitutions: true });
    expect(names(on).some(n => /SLP|정문|응급|주차/.test(n))).toBe(false);
  });

  it('on: 하한은 최대 1건 — 원문 언급으로 보장된 장소는 밀려나지 않는다', () => {
    const pool = basePool();
    const r = selectLocationPois(pool, { ...OPT, mentionTexts: ['을지병원 사거리'], guaranteeMajorInstitutions: true });
    expect(names(r)).toContain('강남을지대학교병원');
    expect(r.length).toBeLessThanOrEqual(5);
  });
});

describe('collectBrokerMentionTexts — 실입력 원문만 수집', () => {
  it('raw_input/location_note/소재지만 수집하고 LLM 생성 섹션은 제외', () => {
    const building = { raw_input: '을지병원 사거리 인근 매각', address: '서울 강남구 신사동 590' };
    const body = {
      broker_extras: { location_note: '한전아트센터 인접' },
      ssot_summary: { address: '서울 강남구 신사동 590' },
      resolved_address: '서울 서대문구 이화여대길 51',
      sections: [{ markdown: 'LLM 생성: 서울대학교병원 인접' }],
      heroCard: { keyPoints: ['LLM 생성: 롯데백화점'] },
    };
    const t = collectBrokerMentionTexts(building, body);
    expect(t).toContain('을지병원 사거리 인근 매각');
    expect(t).toContain('한전아트센터 인접');
    expect(t).toContain('서울 서대문구 이화여대길 51');
    expect(t.join('|')).not.toContain('LLM 생성');
    // 중복 제거
    expect(t.filter(x => x === '서울 강남구 신사동 590').length).toBe(1);
  });

  it('입력이 없으면 빈 배열', () => {
    expect(collectBrokerMentionTexts(null, null)).toEqual([]);
    expect(collectBrokerMentionTexts({}, {})).toEqual([]);
  });
});

describe('p5 실조회 풀 — 기본값 동일 + 렌더 옵션에서도 핵심 랜드마크 유지', () => {
  const FIXTURE = path.resolve(process.cwd(), 'docs/golden-test-data/p5-yangpyeong-income/poi-pool.json');
  const pool: LandmarkPool = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const o = { posture: 'income', assetType: '오피스빌딩', center: pool.center } as const;

  it('mentionTexts 빈 배열 = 기존 결과', () => {
    expect(selectLocationPois(pool.candidates, { ...o, mentionTexts: [] })).toEqual(selectLocationPois(pool.candidates, o));
  });

  it('렌더 옵션(하한 on): 선유도공원·롯데홈쇼핑·선유도역 유지, 입력 순서 불변', () => {
    const r = selectLocationPois(pool.candidates, { ...o, mentionTexts: ['서울 영등포구 양평동'], guaranteeMajorInstitutions: true });
    const n = names(r).join('|');
    expect(n).toContain('선유도공원');
    expect(n).toContain('롯데홈쇼핑');
    expect(n).toContain('선유도역');
    const rev = selectLocationPois([...pool.candidates].reverse(), { ...o, mentionTexts: ['서울 영등포구 양평동'], guaranteeMajorInstitutions: true });
    expect(rev).toEqual(r);
  });
});
