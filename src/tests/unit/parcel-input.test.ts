/**
 * 다필지 입력 검증/집계 (parcel-input.ts) 단위 테스트
 * - 면적 합계/공시지가 가중평균은 "모든 필지에 값이 있을 때만" 산출 (Rule 34/37: 만들어내지 않음)
 */
import { describe, it, expect } from 'vitest';
import {
  parseBrokerParcels,
  summarizeParcels,
  normalizePnu,
  withParcelCountSuffix,
  formatParcelCountLabel,
  MAX_PARCELS,
} from '@/domain/building/mobile-im/parcel-input';

const P1 = '1156011000101170000';
const P2 = '1156011000101340000';
const P3 = '1156011000101250002';

describe('normalizePnu', () => {
  it('19자리 숫자는 인정, 하이픈 포함 형식도 숫자만 추출', () => {
    expect(normalizePnu(P1)).toBe(P1);
    expect(normalizePnu('1156011000-10117-0000')).toBe(P1);
  });
  it('19자리가 아니면 undefined (bdMgtSn/admCd 오주입 방어)', () => {
    expect(normalizePnu('1156011000')).toBeUndefined();
    expect(normalizePnu('')).toBeUndefined();
    expect(normalizePnu(undefined)).toBeUndefined();
    expect(normalizePnu(12345 as unknown)).toBeUndefined();
  });
});

describe('parseBrokerParcels', () => {
  it('미입력은 빈 결과', () => {
    expect(parseBrokerParcels(undefined)).toEqual({ ok: true, parcels: [], pnus: [], warnings: [] });
    expect(parseBrokerParcels(null)).toEqual({ ok: true, parcels: [], pnus: [], warnings: [] });
  });

  it('[NEG] 배열이 아니면 거부', () => {
    const r = parseBrokerParcels({ pnu: P1 });
    expect(r.ok).toBe(false);
  });

  it('[NEG] 상한 초과/비객체 항목은 거부', () => {
    const many = Array.from({ length: MAX_PARCELS + 1 }, (_, i) => ({ areaM2: i + 1 }));
    expect(parseBrokerParcels(many).ok).toBe(false);
    expect(parseBrokerParcels([null]).ok).toBe(false);
    expect(parseBrokerParcels(['x']).ok).toBe(false);
  });

  it('UI 기본 빈 행(shareRatio 만 있음)은 제거', () => {
    const r = parseBrokerParcels([{ pnu: '', landCategory: '', areaM2: undefined, shareRatio: 1, officialPricePerM2: undefined }]);
    expect(r).toMatchObject({ ok: true, parcels: [] });
  });

  it('무효 필드만 무시하고 warnings 보고 (행 자체는 유지)', () => {
    const r = parseBrokerParcels([
      { pnu: 'abc', landCategory: '대', areaM2: -5, shareRatio: 3, officialPricePerM2: 0 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parcels).toEqual([{ landCategory: '대' }]);
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('JSON 직렬화된 NaN(null)·문자열 숫자 처리, 동일 PNU 중복은 첫 항목만', () => {
    const r = parseBrokerParcels([
      { pnu: P1, areaM2: '300.5', landCategory: '대' },
      { pnu: P1, areaM2: 100 },
      { pnu: P2, areaM2: null, landCategory: '잡종지' },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pnus).toEqual([P1, P2]);
    expect(r.parcels[0].areaM2).toBe(300.5);
    expect(r.parcels).toHaveLength(2);
  });
});

describe('summarizeParcels', () => {
  const three = [
    { pnu: P1, landCategory: '대', areaM2: 300, officialPricePerM2: 10_000_000 },
    { pnu: P2, landCategory: '대', areaM2: 100, officialPricePerM2: 20_000_000 },
    { pnu: P3, landCategory: '잡종지', areaM2: 100, officialPricePerM2: 5_000_000 },
  ];

  it('3필지: 면적 합계·지목 요약·면적가중 공시지가', () => {
    const s = summarizeParcels(three);
    expect(s.count).toBe(3);
    expect(s.isMulti).toBe(true);
    expect(s.pnus).toEqual([P1, P2, P3]);
    expect(s.totalAreaM2).toBe(500);
    expect(s.landCategoryLabel).toBe('대 2 · 잡종지 1');
    // (300*10M + 100*20M + 100*5M) / 500 = 11,000,000
    expect(s.weightedOfficialPricePerM2).toBe(11_000_000);
    expect(s.uniformLandCategory).toBeUndefined();
  });

  it('[NEG] 일부 필지 면적 누락이면 합계를 내지 않는다 (과소 합계 방지)', () => {
    const s = summarizeParcels([three[0], { pnu: P2, landCategory: '대' }, three[2]]);
    expect(s.totalAreaM2).toBeUndefined();
    expect(s.partialAreaM2).toBe(400);
    expect(s.weightedOfficialPricePerM2).toBeUndefined();
  });

  it('[NEG] 일부 필지 단가 누락이면 가중평균을 내지 않는다', () => {
    const s = summarizeParcels([three[0], { pnu: P2, areaM2: 100 }]);
    expect(s.totalAreaM2).toBe(400);
    expect(s.weightedOfficialPricePerM2).toBeUndefined();
  });

  it('단일 필지/미입력', () => {
    expect(summarizeParcels([three[0]])).toMatchObject({ count: 1, isMulti: false, totalAreaM2: 300, landCategoryLabel: '대', uniformLandCategory: '대' });
    expect(summarizeParcels(undefined)).toMatchObject({ count: 0, isMulti: false, pnus: [] });
    expect(summarizeParcels('garbage')).toMatchObject({ count: 0, isMulti: false });
  });
});

describe('필지 수 표기', () => {
  it('다필지만 접미사', () => {
    expect(formatParcelCountLabel(3)).toBe('3필지 통합');
    expect(formatParcelCountLabel(1)).toBe('');
    expect(withParcelCountSuffix('서울 영등포구 양평동4가 117', 3)).toBe('서울 영등포구 양평동4가 117 (3필지 통합)');
  });
  it('단일 필지·이미 표기된 주소·빈 주소는 원문 유지 (비중복)', () => {
    expect(withParcelCountSuffix('서울 영등포구 양평동4가 117', 1)).toBe('서울 영등포구 양평동4가 117');
    expect(withParcelCountSuffix('양평동4가 117 외 2필지', 3)).toBe('양평동4가 117 외 2필지');
    expect(withParcelCountSuffix('', 3)).toBe('');
  });
});
