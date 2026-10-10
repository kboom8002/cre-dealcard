/**
 * 렌트롤 v1.5 P2 — rent_roll_meta 서버 검증 + supplemental 화이트리스트 sanitize
 */
import { describe, it, expect } from 'vitest';
import { parseRentRollMeta, RENTROLL_META_LIMITS } from '@/domain/building/mobile-im/rentroll-meta-parse';
import {
  sanitizeAncillaryIncomes,
  sanitizeGrossAreaM2,
  sanitizeRentrollRowFields,
} from '@/domain/building/mobile-im/supplemental-sanitize';

function ok(input: unknown) {
  const r = parseRentRollMeta(input);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.value;
}
function err(input: unknown) {
  const r = parseRentRollMeta(input);
  if (r.ok) throw new Error('expected failure');
  return r.error;
}

describe('parseRentRollMeta', () => {
  it('미전달(undefined/null)은 값 없음 — 핸들러가 sqm 기본값 적용', () => {
    expect(ok(undefined)).toBeUndefined();
    expect(ok(null)).toBeUndefined();
  });

  it('빈 객체는 area_input_unit 기본 sqm', () => {
    expect(ok({})).toEqual({ area_input_unit: 'sqm' });
  });

  it('정상 입력을 그대로 통과 (J4 환산 금지, J3 정수 반올림)', () => {
    const v = ok({
      area_input_unit: 'pyeong',
      rentroll_version: '1.5',
      rentroll_as_of: '2026-10-01',
      asking_price_krw: 5_000_000_000.4,
      gfa_sqm: 1234.567,
      market_rent_1f: 150000,
      market_rent_1f_source: '인근 중개 시세',
      market_rent_upper: '90,000',
      other_income_krw: 0,
      other_income_note: '옥상 안테나',
    });
    expect(v).toEqual({
      area_input_unit: 'pyeong',
      rentroll_version: '1.5',
      rentroll_as_of: '2026-10-01',
      asking_price_krw: 5_000_000_000,
      gfa_sqm: 1234.57,
      market_rent_1f: 150000,
      market_rent_1f_source: '인근 중개 시세',
      market_rent_upper: 90000,
      other_income_krw: 0,
      other_income_note: '옥상 안테나',
    });
  });

  it('알 수 없는 면적 단위는 보정하지 않고 거부 (한국어)', () => {
    expect(err({ area_input_unit: 'ping' })).toMatch(/렌트롤 정보.*area_input_unit/);
  });

  it('잘못된 기준일/숫자/버전 거부', () => {
    expect(err({ rentroll_as_of: '2026-13-40' })).toMatch(/YYYY-MM-DD/);
    expect(err({ rentroll_as_of: '2026/10/01' })).toMatch(/YYYY-MM-DD/);
    expect(err({ asking_price_krw: -1 })).toMatch(/매각가/);
    expect(err({ asking_price_krw: 'abc' })).toMatch(/숫자/);
    expect(err({ gfa_sqm: 0 })).toMatch(/연면적/);
    expect(err({ other_income_krw: -5 })).toMatch(/기타수입/);
    expect(err({ rentroll_version: '9.9' })).toMatch(/버전/);
    expect(err([1, 2])).toMatch(/형식/);
    expect(err('x')).toMatch(/형식/);
  });

  it('문자열 길이 상한·sanitize', () => {
    const long = 'a'.repeat(RENTROLL_META_LIMITS.sourceChars + 1);
    expect(err({ market_rent_1f_source: long })).toMatch(/200자/);
    const v = ok({ other_income_note: '<b>안테나</b>\u0000\n수입' });
    expect(v?.other_income_note).toBe('b안테나/b 수입');
  });

  it('V12 해제: 사유 필수, by/at 은 클라이언트 값을 무시', () => {
    expect(err({ area_unit_override: { reason: '   ' } })).toMatch(/사유/);
    expect(err({ area_unit_override: {} })).toMatch(/사유/);
    expect(err({ area_unit_override: 'yes' })).toMatch(/형식/);
    const v = ok({ area_unit_override: { reason: '일부 층만 매각', by: 'attacker', at: '1999-01-01' } });
    expect(v?.area_unit_override).toEqual({ reason: '일부 층만 매각' });
  });
});

describe('supplemental-sanitize', () => {
  it('sanitizeGrossAreaM2: 유한 양수만', () => {
    expect(sanitizeGrossAreaM2(1500.5)).toBe(1500.5);
    expect(sanitizeGrossAreaM2('1,500')).toBe(1500);
    expect(sanitizeGrossAreaM2(0)).toBeUndefined();
    expect(sanitizeGrossAreaM2(-3)).toBeUndefined();
    expect(sanitizeGrossAreaM2('abc')).toBeUndefined();
    expect(sanitizeGrossAreaM2(1e9)).toBeUndefined();
    expect(sanitizeGrossAreaM2(undefined)).toBeUndefined();
  });

  it('sanitizeAncillaryIncomes: 유효 항목만, 출처는 broker_input 고정', () => {
    expect(sanitizeAncillaryIncomes(undefined)).toBeUndefined();
    expect(sanitizeAncillaryIncomes([])).toBeUndefined();
    const out = sanitizeAncillaryIncomes([
      { type: 'parking', annualAmountKrw: 12_000_000.4, provenance: 'public_api', note: '<x>월정액' },
      { type: 'weird', annualAmountKrw: 5_000_000, label: '임의' },
      { type: 'signage', annualAmountKrw: 0 },
      null,
    ]);
    expect(out).toHaveLength(2);
    expect(out![0]).toMatchObject({ type: 'parking', annualAmountKrw: 12_000_000, provenance: 'broker_input', label: '주차 수입', note: 'x월정액' });
    expect(out![1]).toMatchObject({ type: 'other', label: '임의', provenance: 'broker_input' });
  });

  it('sanitizeRentrollRowFields: 허용값 밖은 null, 해당 필드 없는 행은 그대로', () => {
    const plain = { floor: '1F' };
    const rows = sanitizeRentrollRowFields([
      plain,
      { evidence_level: '계약서 원본', payment_status: '정상', rent_free_months: '3' },
      { evidence_level: '카톡', payment_status: '연체?', rent_free_months: -1 },
      { evidence_level: null, rent_free_months: '' },
    ] as Array<Record<string, unknown>>);
    expect(rows[0]).toBe(plain);
    expect(rows[1]).toMatchObject({ evidence_level: '계약서 원본', payment_status: '정상', rent_free_months: 3 });
    expect(rows[2]).toMatchObject({ evidence_level: null, payment_status: null, rent_free_months: null });
    expect(rows[3]).toMatchObject({ evidence_level: null, rent_free_months: null });
  });
});
