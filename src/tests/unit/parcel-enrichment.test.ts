/**
 * parcel-enrichment: 공공데이터 보강은 "빈 필드만, 실데이터만" 채운다.
 */
import { describe, it, expect, vi } from 'vitest';
import { fillParcelsFromPublicData, MAX_PARCEL_LOOKUPS, type ParcelLookupDeps } from '@/domain/building/mobile-im/parcel-enrichment';
import { summarizeParcels } from '@/domain/building/mobile-im/parcel-input';

const P1 = '1156012800101170000';
const P2 = '1156012800101340000';
const P3 = '1156012800101250002';

const REAL: Record<string, { area: number }> = { [P1]: { area: 253.9 }, [P2]: { area: 241.7 }, [P3]: { area: 23.1 } };

function deps(over: Partial<ParcelLookupDeps> = {}): ParcelLookupDeps {
  return {
    fetchLandUsePlan: vi.fn(async (pnu: string) => ({ landArea: REAL[pnu]?.area })),
    fetchLandPrice: vi.fn(async (pnu: string) => ({ landArea: REAL[pnu]?.area, landCategory: '대', pricePerSqm: 10_300_000 })),
    ...over,
  };
}

describe('fillParcelsFromPublicData', () => {
  it('PNU 만 있는 3필지 → 면적/지목/공시지가 보강, 합계 518.7㎡', async () => {
    const r = await fillParcelsFromPublicData([], [P1, P2, P3], deps());
    expect(r.parcels.map(p => p.pnu)).toEqual([P1, P2, P3]);
    const s = summarizeParcels(r.parcels);
    expect(s.totalAreaM2).toBe(518.7);
    expect(s.landCategoryLabel).toBe('대');
    expect(s.weightedOfficialPricePerM2).toBe(10_300_000);
    expect(r.filledFields).toBe(9);
  });

  it('중개인 입력값이 우선 (덮어쓰지 않음)', async () => {
    const r = await fillParcelsFromPublicData([{ pnu: P1, areaM2: 999, landCategory: '잡종지', officialPricePerM2: 1 }], [P1, P2], deps());
    expect(r.parcels[0]).toEqual({ pnu: P1, areaM2: 999, landCategory: '잡종지', officialPricePerM2: 1 });
    expect(r.parcels[1].areaM2).toBe(241.7);
  });

  it('[NEG] 조회 실패·null → 값을 만들지 않는다 (면적 합계 미산출)', async () => {
    const d = deps({
      fetchLandUsePlan: vi.fn(async () => null),
      fetchLandPrice: vi.fn(async () => { throw new Error('boom'); }),
    });
    const r = await fillParcelsFromPublicData([], [P1, P2], d);
    expect(r.parcels).toEqual([{ pnu: P1 }, { pnu: P2 }]);
    expect(r.filledFields).toBe(0);
    expect(summarizeParcels(r.parcels).totalAreaM2).toBeUndefined();
  });

  it('[NEG] _isFallback 응답은 사용하지 않는다', async () => {
    const d = deps({
      fetchLandUsePlan: vi.fn(async () => ({ landArea: 100, _isFallback: true })),
      fetchLandPrice: vi.fn(async () => ({ landArea: 100, landCategory: '대', pricePerSqm: 5, _isFallback: true })),
    });
    const r = await fillParcelsFromPublicData([{ pnu: P1 }], [], d);
    expect(r.parcels[0]).toEqual({ pnu: P1 });
  });

  it('[NEG] 면적 없는 공시지가 응답의 기본 지목은 신뢰하지 않는다', async () => {
    const d = deps({
      fetchLandUsePlan: vi.fn(async () => null),
      fetchLandPrice: vi.fn(async () => ({ landCategory: '대', pricePerSqm: 7_000_000 })),
    });
    const r = await fillParcelsFromPublicData([{ pnu: P1 }], [], d);
    expect(r.parcels[0].landCategory).toBeUndefined();
    expect(r.parcels[0].officialPricePerM2).toBe(7_000_000);
  });

  it('완전한 필지는 외부 조회를 하지 않고, 조회 상한을 지킨다', async () => {
    const d = deps();
    await fillParcelsFromPublicData([{ pnu: P1, areaM2: 1, landCategory: '대', officialPricePerM2: 1 }], [], d);
    expect(d.fetchLandUsePlan).not.toHaveBeenCalled();

    const many = Array.from({ length: 25 }, (_, i) => `11560128001${String(i).padStart(8, '0')}`);
    const d2 = deps();
    await fillParcelsFromPublicData([], many, d2);
    expect((d2.fetchLandUsePlan as any).mock.calls.length).toBe(MAX_PARCEL_LOOKUPS);
  });

  it('19자리가 아닌 PNU 는 추가하지 않는다', async () => {
    const r = await fillParcelsFromPublicData([], ['123', P1], deps());
    expect(r.parcels.map(p => p.pnu)).toEqual([P1]);
  });
});

describe('fillParcelsFromPublicData — 일시 실패 재시도', () => {
  it('첫 조회 null/폴백 → 1회 재시도로 실데이터 채움', async () => {
    let n = 0;
    const d = deps({
      fetchLandUsePlan: vi.fn(async (pnu: string) => (n++ === 0 ? null : { landArea: REAL[pnu]?.area })),
      fetchLandPrice: vi.fn(async () => ({ landArea: 1, pricePerSqm: 1, _isFallback: true })),
    });
    const r = await fillParcelsFromPublicData([], [P1], d, 0);
    expect(r.parcels[0].areaM2).toBe(253.9);
    expect(r.parcels[0].officialPricePerM2).toBeUndefined(); // 재시도도 폴백 → 값 미생성
    expect((d.fetchLandUsePlan as any).mock.calls.length).toBe(2);
    expect((d.fetchLandPrice as any).mock.calls.length).toBe(2);
  });

  it('첫 조회 성공 시 재시도하지 않음', async () => {
    const d = deps();
    await fillParcelsFromPublicData([], [P1], d, 0);
    expect((d.fetchLandUsePlan as any).mock.calls.length).toBe(1);
  });
});
