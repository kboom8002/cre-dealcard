/**
 * 토지 현황(land) 슬라이드 — 다필지 바인딩 테스트 (bindFromExternalData)
 */
import { describe, it, expect } from 'vitest';
import { bindFromExternalData } from '@/domain/building/mobile-im/pptx/data-binder';

const P1 = '1156011000101170000';
const P2 = '1156011000101340000';
const P3 = '1156011000101250002';

function landRows(enrichment: Record<string, any>, body: Record<string, any>): string[][] {
  const dataMap: Record<string, any> = {};
  bindFromExternalData(enrichment, dataMap, body);
  return dataMap['land'].left.rows as string[][];
}
const row = (rows: string[][], label: string) => rows.find(r => r[0] === label);

const baseLup = { zoningDistrict: '일반상업지역', buildingCoverageMax: 60, floorAreaRatioMax: 800 };
const lp = { pricePerSqm: 9_000_000, baseYear: 2025, landCategory: '대' };

const multiBody = {
  ssot_summary: { land_area_sqm: 500, asking_price_manwon: 1_000_000, parcel_count: 3 },
  parcels: [
    { pnu: P1, landCategory: '대', areaM2: 300, officialPricePerM2: 10_000_000 },
    { pnu: P2, landCategory: '대', areaM2: 100, officialPricePerM2: 20_000_000 },
    { pnu: P3, landCategory: '잡종지', areaM2: 100, officialPricePerM2: 5_000_000 },
  ],
};

describe('토지 현황 — 다필지', () => {
  it('필지 구성·지목 요약·합계 대지면적·면적가중 공시지가를 표기', () => {
    const rows = landRows({ landUsePlan: baseLup, landPrice: lp }, multiBody);
    expect(row(rows, '지목')?.[1]).toBe('대 2 · 잡종지 1');
    expect(row(rows, '대지면적')?.[1]).toBe('500㎡ (151.3평) · 3필지 합계');
    const price = row(rows, '개별공시지가');
    expect(price?.[1]).toContain('11,000,000원/㎡');
    expect(price?.[1]).toContain('면적 가중평균');
  });

  it('필지별 용도지역이 상이하면 모두 병기', () => {
    const rows = landRows({
      landUsePlan: baseLup,
      landPrice: lp,
      landUseByParcel: [
        { pnu: P1, zoningDistrict: '일반상업지역' },
        { pnu: P2, zoningDistrict: '준공업지역' },
        { pnu: P3, zoningDistrict: '일반상업지역' },
      ],
    }, multiBody);
    expect(row(rows, '용도지역')?.[1]).toBe('일반상업지역 / 준공업지역 (필지별 상이)');
  });

  it('필지별 용도지역이 모두 같으면 단일 표기', () => {
    const rows = landRows({
      landUsePlan: baseLup, landPrice: lp,
      landUseByParcel: [{ pnu: P1, zoningDistrict: '일반상업지역' }, { pnu: P2, zoningDistrict: '일반상업지역' }],
    }, multiBody);
    expect(row(rows, '용도지역')?.[1]).toBe('일반상업지역');
  });

  it('[NEG] 일부 필지 단가 누락 → 가중평균을 만들지 않고 대표 필지로 명시', () => {
    const body = {
      ...multiBody,
      parcels: multiBody.parcels.map((p, i) => (i === 1 ? { ...p, officialPricePerM2: undefined } : p)),
    };
    const rows = landRows({ landUsePlan: baseLup, landPrice: lp }, body);
    expect(row(rows, '개별공시지가')).toBeUndefined();
    expect(row(rows, '개별공시지가 (대표 필지)')?.[1]).toContain('9,000,000원/㎡');
  });

  it('[NEG] 일부 필지 지목 미입력이어도 지목을 대표 필지 값으로 대체하지 않는다', () => {
    const body = { ...multiBody, parcels: multiBody.parcels.map(p => ({ pnu: p.pnu, areaM2: p.areaM2 })) };
    const rows = landRows({ landUsePlan: baseLup, landPrice: lp }, body);
    // 미확인 값은 '-' 대신 행 자체를 생략한다 (대표 필지 '대'로 대체 금지가 본 의도).
    expect(row(rows, '지목')).toBeUndefined();
    expect(rows.some(r => r[1] === '대')).toBe(false);
  });

  it('[NEG] 단일 필지는 기존 표기 유지 (필지 구성 행·대표 필지 접미사 없음)', () => {
    const rows = landRows({ landUsePlan: baseLup, landPrice: lp }, {
      ssot_summary: { land_area_sqm: 300 },
      parcels: [{ pnu: P1, landCategory: '대', areaM2: 300 }],
    });
    expect(row(rows, '필지 구성')).toBeUndefined();
    expect(row(rows, '개별공시지가')?.[1]).toContain('9,000,000원/㎡');
    expect(row(rows, '지목')?.[1]).toBe('대');
  });

  it('[NEG] parcels 없는 기존 문서는 이전과 동일', () => {
    const rows = landRows({ landUsePlan: baseLup, landPrice: lp }, { ssot_summary: { land_area_sqm: 300 } });
    expect(row(rows, '필지 구성')).toBeUndefined();
    expect(row(rows, '지목')?.[1]).toBe('대');
  });
});
