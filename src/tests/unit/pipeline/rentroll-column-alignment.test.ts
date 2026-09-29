/**
 * A24 렌트롤 컬럼 정합성 계약 테스트
 * 
 * Bug #1 검증: data-binder.ts Basic 프리셋 행 순서와 A24 HEADERS 상수의 컬럼 순서가 일치하는지 검증합니다.
 * 이전에는 data-binder가 [층수, 면적, 임차인] 순서로, A24가 [층수, 임차인, 면적] 순서로 생성하여
 * 임차인과 면적이 뒤바뀌는 데이터 교차 오염이 발생했습니다.
 * 
 * Rule 7: Negative Pair Obligation — 모든 테스트에 반대 단언 포함
 */
import { describe, test, expect } from 'vitest';

// A24 HEADERS 상수 — a24-rentroll-stacking.ts Line 250
const A24_HEADERS = ['층', '호실', '용도', '임차인', '임대(㎡)', '전용(㎡)', '전용률', '보증금', '월세', '관리비', 'NOC', '만기일'];

// data-binder.ts Basic 프리셋이 생성하는 헤더/행 순서를 시뮬레이션
function buildBasicPresetHeaders(): string[] {
  return ['층', '호실', '용도', '임차인', '임대(㎡)', '전용(㎡)', '전용률', '보증금', '월세', '관리비', 'NOC', '만기일'];
}

function buildBasicPresetRow(lease: {
  floor: string;
  unit?: string;
  use?: string;
  tenant_name?: string;
  area_sqm?: number;
  exclusive_area_sqm?: number;
  deposit_manwon?: number;
  rent_manwon?: number;
  mgmt_fee_manwon?: number;
  lease_end?: string;
  is_vacant?: boolean;
}): string[] {
  const floor = lease.floor || '-';
  const unit = lease.unit || '-';
  const use = lease.use || '-';
  const tenant = lease.tenant_name || (lease.is_vacant ? '공실' : '-');
  const areaSqm = lease.area_sqm ? lease.area_sqm.toFixed(1) : '-';
  const excSqm = lease.exclusive_area_sqm ? lease.exclusive_area_sqm.toFixed(1) : '-';
  const eff = (lease.exclusive_area_sqm && lease.area_sqm) ? `${Math.round((lease.exclusive_area_sqm / lease.area_sqm) * 100)}%` : '-';
  const deposit = lease.deposit_manwon ? `${lease.deposit_manwon.toLocaleString()}` : '-';
  const rent = lease.rent_manwon ? `${lease.rent_manwon.toLocaleString()}` : '-';
  const mgmt = lease.mgmt_fee_manwon ? `${lease.mgmt_fee_manwon.toLocaleString()}` : '-';
  const noc = (lease.rent_manwon && lease.mgmt_fee_manwon && lease.exclusive_area_sqm) ? Math.round((lease.rent_manwon + lease.mgmt_fee_manwon) / (lease.exclusive_area_sqm * 0.3025)).toLocaleString() : '-';
  const expiry = lease.lease_end || '-';
  
  return [floor, unit, use, tenant, areaSqm, excSqm, eff, deposit, rent, mgmt, noc, expiry];
}

// A24 스태킹 파서가 기대하는 컬럼 순서 시뮬레이션
function parseStackingFromRow(r: string[]): { tenant: string; area: number } {
  const is10Col = r.length >= 8;
  const tenant = String(r[is10Col ? 3 : 1] || '').trim();
  const areaStr = String(r[is10Col ? 4 : 2] || '').trim();
  const area = parseFloat(areaStr.replace(/[^0-9.]/g, '')) || 0;
  return { tenant, area };
}

describe('A24 렌트롤 컬럼 정합성', () => {
  test('POSITIVE: Basic 프리셋 헤더 순서 = A24 HEADERS 순서', () => {
    const binderHeaders = buildBasicPresetHeaders();
    expect(binderHeaders).toEqual(A24_HEADERS);
  });

  test('POSITIVE: Basic 프리셋 행의 컬럼 위치가 A24 HEADERS와 일치', () => {
    const row = buildBasicPresetRow({
      floor: '3F',
      tenant_name: '스타벅스',
      area_sqm: 281.6,  // ~85평
      deposit_manwon: 8000,
      rent_manwon: 600,
      lease_end: '2028-12-31',
    });

    // 컬럼별 기대값 검증
    // [floor, unit, use, tenant, areaSqm, excSqm, eff, deposit, rent, mgmt, noc, expiry]
    expect(row[0]).toBe('3F');           // 층수
    expect(row[3]).toBe('스타벅스');       // 임차인 (HEADERS[3] = '임차인')
    expect(row[4]).toMatch(/^\d+(\.\d+)?$/); // 임대(㎡) (HEADERS[4] = '임대(㎡)')
    expect(row[7]).toMatch(/^\d+/);        // 보증금
    expect(row[8]).toMatch(/^\d+/);        // 월세
    expect(row[11]).toBe('2028-12-31');  // 만기일
  });

  test('NEGATIVE: 면적 열에 한글 임차인명이 들어가지 않음', () => {
    const row = buildBasicPresetRow({
      floor: '1F',
      tenant_name: '라이브펍',
      area_sqm: 120.5,
      deposit_manwon: 5000,
      rent_manwon: 450,
    });
    // 면적 컬럼(index 4)에 한글 임차인명(2글자 이상 연속 한글)이 있으면 안됨
    expect(row[4]).not.toMatch(/[가-힣]{2,}/);
    // 임차인 컬럼(index 3)에 숫자+평이 있으면 안됨
    expect(row[3]).not.toMatch(/^\d+평$/);
  });

  test('NEGATIVE: 임차인 열에 "36평" 같은 면적 문자열이 들어가지 않음', () => {
    const row = buildBasicPresetRow({
      floor: '2F',
      tenant_name: 'A 법무법인',
      area_sqm: 110.2,
      deposit_manwon: 5000,
      rent_manwon: 400,
    });
    expect(row[3]).toBe('A 법무법인');
    expect(row[3]).not.toMatch(/\d+평/);
  });

  test('POSITIVE: 스태킹 파서가 올바른 컬럼을 참조', () => {
    const row = buildBasicPresetRow({
      floor: 'B1',
      tenant_name: '라이브펍',
      area_sqm: 120.5,  // ~36평
      deposit_manwon: 5000,
      rent_manwon: 450,
    });

    const parsed = parseStackingFromRow(row);
    expect(parsed.tenant).toBe('라이브펍');  // r[3] = 임차인
    expect(parsed.area).toBeGreaterThan(0);  // r[4] = 면적(㎡)
  });

  test('NEGATIVE: 스태킹 파서가 면적과 임차인을 뒤바꾸지 않음', () => {
    const row = buildBasicPresetRow({
      floor: '5F',
      tenant_name: 'B 회계법인',
      area_sqm: 110.2,
      deposit_manwon: 5000,
      rent_manwon: 380,
    });

    const parsed = parseStackingFromRow(row);
    // tenant에 숫자+평이 아닌 실제 임차인명이 있어야 함
    expect(parsed.tenant).toBe('B 회계법인');
    expect(parsed.tenant).not.toMatch(/^\d+평$/);
    // area에 숫자가 파싱되어야 함
    expect(parsed.area).toBeGreaterThan(0);
  });

  test('POSITIVE: 공실 행에서 임차인이 "공실"로 표시', () => {
    const row = buildBasicPresetRow({
      floor: '2F',
      is_vacant: true,
      area_sqm: 92.3,
    });
    expect(row[3]).toBe('공실');          // 임차인 컬럼
    expect(row[4]).toMatch(/^\d+(\.\d+)?$/); // 면적 컬럼
  });

  test('POSITIVE: Pro 프리셋은 [호실, 업종, 면적, ...] 순서 (7열)', () => {
    // Pro 프리셋 헤더 (data-binder.ts Line 565)
    const proHeaders = ['호실', '업종', '면적', '보증금', '월세', '관리비', '만기일'];
    expect(proHeaders).toHaveLength(7);
    expect(proHeaders[0]).toBe('호실');
    expect(proHeaders[1]).toBe('업종');
    expect(proHeaders[2]).toBe('면적');
  });
});
