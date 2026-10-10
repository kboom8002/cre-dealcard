/**
 * P2 (IM 상용화 테스트 계획) — income 골든 오라클에서 드러난 결함 회귀 테스트.
 *  - 점유 SSOT: 명시 lease_state 우선(ig3 5F), 비임대 행(ig2 기계실·주차장) 제외
 *  - 요약 임대료/보증금: 렌트롤 합 우선 + 바텀시트 불일치 경고 (ig3/ig4 as-is)
 *  - 면적 단일 해석기: 대지 1% 스냅, 신뢰 가능한 대장 연면적 정본 (ig2 424.6 누수, ig1 1,141 오기)
 *  - 연면적 칸 대지 오기 판정 (ig4 as-is 156.9평 = 대지)
 *  - 투자 포인트 ↔ 입지 설명 중복 제거 (ig4 corrected)
 */
import { describe, it, expect } from 'vitest';
import { resolveLeaseOccupancy, isNonLeasableLeaseRow, summarizeLeaseOccupancy } from '@/domain/building/mobile-im/lease-vacancy';
import { extractLeaseFacts } from '@/domain/building/mobile-im/pptx/summary-highlights';
import { resolveDisplayAreas, isRegisterTrustworthy } from '@/domain/building/mobile-im/pptx/binder/display-areas';
import { normalizeAreaRowsPrecision } from '@/domain/building/mobile-im/pptx/binder/area-precision';
import { resolveTotalAreaWithSource } from '@/domain/building/mobile-im/resolve-total-area';
import { readBrokerExtras, dedupeBrokerPointsAgainstLocation } from '@/domain/building/mobile-im/pptx/broker-extras-slides';
import { extractCommonLeaseNote } from '@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder';

describe('점유 SSOT — 명시 lease_state 우선', () => {
  it("ig3 5F: lease_state '공실' + 비고 '기존 자가사용…' → 공실", () => {
    expect(resolveLeaseOccupancy({ floor: '5F', lease_state: '공실', is_vacant: true, note: '기존 자가사용. 희망 임대료 협의' })).toBe('공실');
  });
  it("lease_state '임대중' 은 비고 키워드보다 우선", () => {
    expect(resolveLeaseOccupancy({ floor: '3F', lease_state: '임대중', tenant_name: '본사빌딩관리', note: '공실 예정 없음' })).toBe('임대중');
  });
  it('lease_state 없으면 기존 키워드 판정 유지', () => {
    expect(resolveLeaseOccupancy({ floor: 'B1', tenant_type: '자가사용' })).toBe('자가사용');
  });
});

describe('비임대(공용·설비) 행', () => {
  const ig2 = [
    { floor: 'B1', tenant_name: '기계실', rent_manwon: 0, deposit_manwon: 0 },
    { floor: 'B1', tenant_name: '', lease_state: '공실', is_vacant: true },
    { floor: '1F', tenant_name: '카페A', rent_manwon: 500, deposit_manwon: 5000, lease_state: '임대중' },
    { floor: '2F', tenant_name: '주차장', rent_manwon: 0, deposit_manwon: 0 },
    { floor: '3F', tenant_name: '치과B', rent_manwon: 400, deposit_manwon: 4000, lease_state: '임대중' },
    { floor: '4F', tenant_name: '사무C', rent_manwon: 300, deposit_manwon: 3000, lease_state: '임대중' },
    { floor: '5F', tenant_name: '사무D', rent_manwon: 300, deposit_manwon: 3000, lease_state: '임대중' },
    { floor: '6F', tenant_name: '사무E', rent_manwon: 300, deposit_manwon: 3000, lease_state: '임대중' },
    { floor: '7F', tenant_name: '사무F', rent_manwon: 300, deposit_manwon: 3000, lease_state: '임대중' },
    { floor: '8F', tenant_type: '자가사용', lease_state: '자가사용' },
  ];
  it('ig2: 총 8 / 임대 6 / 공실 1 / 자가 1 / 비임대 2', () => {
    const s = summarizeLeaseOccupancy(ig2);
    expect(s).toMatchObject({ total: 8, leased: 6, vacant: 1, ownerUse: 1, nonLeasable: 2 });
  });
  it('유료 주차 운영(금액·계약 있음)은 임대 호실', () => {
    expect(isNonLeasableLeaseRow({ tenant_name: '주차장', rent_manwon: 120, deposit_manwon: 0 })).toBe(false);
    expect(isNonLeasableLeaseRow({ tenant_name: '주차장', lease_start: '2024-01-01' })).toBe(false);
  });
  it("명칭 부분 일치('기계실 옆 사무실')는 비임대 아님, 명시 공실도 아님", () => {
    expect(isNonLeasableLeaseRow({ tenant_name: '기계실 옆 사무실' })).toBe(false);
    expect(isNonLeasableLeaseRow({ tenant_name: '기계실', lease_state: '공실' })).toBe(false);
  });
});

describe('요약 임대 사실 — 렌트롤 합이 SSOT', () => {
  const rows = [
    { floor: '1F', tenant_name: 'A', rent_manwon: 1000, deposit_manwon: 10000, lease_state: '임대중' },
    { floor: '2F', tenant_name: 'B', rent_manwon: 657, deposit_manwon: 9500, lease_state: '임대중' },
    { floor: '3F', lease_state: '공실', is_vacant: true, rent_manwon: 360, deposit_manwon: 4000 },
  ];
  it('공실 행 금액(희망 임대료)은 합계에서 제외, 바텀시트 합계와 다르면 경고', () => {
    const f = extractLeaseFacts(rows, { monthly_rent_total_krw: 20_170_000, total_deposit_manwon: 23_500 })!;
    expect(f.monthlyRentManwon).toBe(1657);
    expect(f.depositManwon).toBe(19500);
    expect(f.reconcileWarning).toMatch(/렌트롤 기준/);
  });
  it('일치하면 경고 없음, 렌트롤 금액이 비면 바텀시트 폴백', () => {
    expect(extractLeaseFacts(rows, { monthly_rent_total_krw: 16_570_000, total_deposit_manwon: 19_500 })!.reconcileWarning).toBeUndefined();
    const empty = [{ floor: '1F', tenant_name: 'A', lease_state: '임대중' }];
    expect(extractLeaseFacts(empty, { monthly_rent_total_krw: 5_000_000, total_deposit_manwon: 3000 })).toMatchObject({ monthlyRentManwon: 500, depositManwon: 3000 });
  });
});

describe('면적 단일 해석기 (표시 전용)', () => {
  const reg = { platArea: 420.6, totalArea: 1441.15, bcRat: 58.4, vlRat: 398.8, useAprDay: '20021212' };
  it('대지: 1% 이내면 대장 정밀값 (ig2 424.595 → 420.6)', () => {
    const r = resolveDisplayAreas({ brokerLandSqm: 424.595, register: reg });
    expect(r).toMatchObject({ landSqm: 420.6, landSource: 'register' });
  });
  it('대지: 1% 초과(다필지 합 등)는 중개인 값 유지', () => {
    expect(resolveDisplayAreas({ brokerLandSqm: 518.7, register: reg }).landSqm).toBe(518.7);
  });
  it('연면적: 신뢰 가능한 대장이 정본 + 괴리 경고 (ig1 1,141.157 vs 1,441.15)', () => {
    const r = resolveDisplayAreas({ brokerGfaSqm: 1141.157, register: reg });
    expect(r.gfaSqm).toBe(1441.15);
    expect(r.gfaSource).toBe('register');
    expect(r.warnings.join()).toMatch(/연면적 불일치/);
  });
  it('2배 괴리로 무효화된 대장 / 건물 사실 없는 대장은 신뢰하지 않음', () => {
    const invalid = { totalArea: 518.71, platArea: 518.7, _areaConflictInvalidated: ['bcRat'] };
    expect(isRegisterTrustworthy(invalid)).toBe(false);
    expect(resolveDisplayAreas({ brokerGfaSqm: 518.71, register: invalid })).toMatchObject({ gfaSqm: 518.71, gfaSource: 'broker' });
    expect(isRegisterTrustworthy({ totalArea: 100 })).toBe(false);
  });
  it('값이 없으면 undefined (0·추정 금지)', () => {
    expect(resolveDisplayAreas({})).toMatchObject({ landSqm: undefined, gfaSqm: undefined, landSource: 'none', gfaSource: 'none' });
  });
  it('개요 표: gfaAuthoritative 이면 1% 초과 괴리도 대장값, 아니면 중개인 값 유지', () => {
    const mk = () => ({ building: { left: { rows: [['연면적', '1,141.2㎡ (345.2평)'], ['대지면적', '424.6㎡ (128.4평)']] } } });
    const a = mk();
    normalizeAreaRowsPrecision(a, { totArea: 1441.15, platArea: 420.6, gfaAuthoritative: true });
    expect(a.building.left.rows[0][1]).toMatch(/^1,441\.15㎡/);
    expect(a.building.left.rows[1][1]).toMatch(/^420\.6㎡/);
    const b = mk();
    normalizeAreaRowsPrecision(b, { totArea: 1441.15, platArea: 420.6 });
    expect(b.building.left.rows[0][1]).toMatch(/^1,141\.2㎡/);
  });
});

describe('연면적 칸 대지 오기 판정 (handler 해석기)', () => {
  it('ig4 as-is: 중개인 연면적 518.71 = 대지 518.7, 대장 2,490.88 → 대장 채택, 충돌 아님', () => {
    const r = resolveTotalAreaWithSource({ memoSqm: 518.71, registerSqm: 2490.88, brokerLandSqm: 518.7 });
    expect(r).toMatchObject({ value: 2490.88, source: 'public_register', registerConflict: false, brokerLooksLikeLand: true });
  });
  it('대지와 다른 중개인 연면적의 2배 괴리는 기존대로 충돌(다른 건물)', () => {
    const r = resolveTotalAreaWithSource({ memoSqm: 3842.6, registerSqm: 231.4, brokerLandSqm: 486.2 });
    expect(r.registerConflict).toBe(true);
    expect(r.brokerLooksLikeLand).toBeUndefined();
    expect(r.source).toBe('broker_memo');
  });
});

describe('투자 포인트 ↔ 입지 설명 중복 제거 (Rule 4)', () => {
  const loc = '선유도역(9호선) 4번 출구 도보 1분, 대로변 초역세권';
  it('입지와 같은 포인트는 포인트에서 제거 (입지 면 유지)', () => {
    const x = readBrokerExtras({ broker_extras: { investment_points: [loc, '전 층 임대 중, 안정적 임대 구성'], location_note: `${loc}. 양평로 대로변 코너 입지.` } })!;
    expect(x.investment_points).toEqual(['전 층 임대 중, 안정적 임대 구성']);
    expect(x.location_note).toContain(loc);
  });
  it('포인트가 0개가 되면 포인트 유지, 입지 callout 생략', () => {
    const x: any = { investment_points: [loc], location_note: loc };
    dedupeBrokerPointsAgainstLocation(x);
    expect(x.investment_points).toEqual([loc]);
    expect(x.location_note).toBeUndefined();
  });
  it('중복 없으면 원문 그대로', () => {
    const x: any = { investment_points: ['리모델링 완료'], location_note: loc };
    dedupeBrokerPointsAgainstLocation(x);
    expect(x).toEqual({ investment_points: ['리모델링 완료'], location_note: loc });
  });
});

describe('렌트롤 공통 비고 → 각주 (Rule 4)', () => {
  const C = '후불, 말일 납부';
  it('ig4c: 9개 호실 공통 + 고유 비고 유지', () => {
    const notes = ['지하1층 공실', ...Array(9).fill(C), '9F 분할임대(1)', '9F 분할임대(2)'];
    const r = extractCommonLeaseNote(notes);
    expect(r.common).toBe(C);
    expect(r.notes.filter(Boolean)).toEqual(['지하1층 공실', '9F 분할임대(1)', '9F 분할임대(2)']);
  });
  it('전 행 동일이면 열이 비어 열 자체가 생략될 수 있음', () => {
    const r = extractCommonLeaseNote([C, C, C, C]);
    expect(r.common).toBe(C);
    expect(r.notes.some(Boolean)).toBe(false);
  });
  it('전체 노트 과반 미만이어도 2행 이상 반복되는 8자 이상 문장은 각주로 1회 (중복 문장 금지)', () => {
    const r = extractCommonLeaseNote([C, C, '', '']);
    expect(r.common).toBe(C);
    expect(r.notes.some(Boolean)).toBe(false);
  });
  it('짧은 단어·1회 문장은 공통 비고로 보지 않음', () => {
    expect(extractCommonLeaseNote(['a', 'b', 'c', 'd']).common).toBe('');
    expect(extractCommonLeaseNote(['자가사용', '자가사용', '']).common).toBe('');
  });
  it('ig4c: 분할임대 안내 문장 반복 → 각주 1회, 행 고유 문장 유지', () => {
    const S = '면적은 월세 비례 배분(가정)';
    const r = extractCommonLeaseNote([C, C, C, C, `9F 분할임대(1). ${S}`, `9F 분할임대(2). ${S}`]);
    expect(r.common).toBe(`${C} · ${S}`);
    expect(r.notes.filter(Boolean)).toEqual(['9F 분할임대(1).', '9F 분할임대(2).']);
  });
});

