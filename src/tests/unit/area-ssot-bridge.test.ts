import { describe, it, expect } from 'vitest';
import { bridgeDealCardToIM } from '@/domain/building/mobile-im/ssot-to-im-bridge';
import { isPlannedFloorAreaInMemo, scanMemoFloorAreas } from '@/domain/building/mobile-im/resolve-total-area';
import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';

const PY = 3.305785;

const SUTAEK_MEMO = [
  '수택동 419-19 외 2필지 매각',
  '매각가 89억 (토지평당 4,500만원)',
  '대지면적: 총 651.2㎡ (197.0평)',
  '용도지역: 일반상업지역 (허가 용적률 1,260%)',
  '신축 가능 연면적: 약 2,500평 규모 복합개발/오피스텔',
  '나대지 상태 (명도 불필요, 즉시 착공 가능)',
].join('\n');

const HOTEL_MEMO = [
  '에이치에비뉴호텔 매각',
  '매각가 300억',
  '대지 147.1평 (486.2㎡), 연면적 1,162.4평 (3,842.6㎡)',
].join('\n');

describe('bridgeDealCardToIM — SSoT 면적 키 불일치 (B1)', () => {
  it('hotel: layers.total_floor_area_pyung/land_area_pyung(평 flat) → supplemental ㎡', () => {
    const out = bridgeDealCardToIM(
      { ssot: { layers: { total_floor_area_pyung: 1162.4, land_area_pyung: 147.1 }, raw_input: HOTEL_MEMO } },
      'operating',
    );
    expect(out.supplemental.total_gross_area_m2).toBeCloseTo(3842.6, 0);
    expect(out.supplemental.land_area_m2).toBeCloseTo(486.2, 0);
  });

  it('layers.physical.* (㎡) 키도 계속 읽는다', () => {
    const out = bridgeDealCardToIM({ ssot: { layers: { physical: { total_area_sqm: 1000, plat_area_sqm: 300 } } } }, 'income');
    expect(out.supplemental.total_gross_area_m2).toBe(1000);
    expect(out.supplemental.land_area_m2).toBe(300);
  });

  it('면적 전무 → undefined (0 누출 없음)', () => {
    const out = bridgeDealCardToIM({ ssot: { layers: {} } }, 'income');
    expect(out.supplemental.total_gross_area_m2).toBeUndefined();
    expect(out.supplemental.land_area_m2).toBeUndefined();
  });

  it('sutaek(dev): 신축 가능 연면적 2,500평 → total_gross_area_m2 로 쓰지 않고 developmentSpec.targetScalePyung', () => {
    const out = bridgeDealCardToIM(
      { ssot: { layers: { total_floor_area_pyung: 2500 }, raw_input: SUTAEK_MEMO } },
      'development',
    );
    expect(out.supplemental.total_gross_area_m2).toBeUndefined();
    expect((out.supplemental as any).developmentSpec?.targetScalePyung).toBeCloseTo(2500, 0);
    // 개발 포스처 grade-up: 연면적이 아니라 대지면적을 요구
    expect(out.gradeUpItems.some(i => i.field === 'landArea')).toBe(true);
    expect(out.gradeUpItems.some(i => i.field === 'grossArea')).toBe(false);
  });

  it('dev 스펙에 이미 targetScalePyung 이 있으면 덮어쓰지 않는다', () => {
    const out = bridgeDealCardToIM(
      { ssot: { layers: { total_floor_area_pyung: 2500, developmentSpec: { targetScalePyung: 1800 } }, raw_input: SUTAEK_MEMO } },
      'development',
    );
    expect((out.supplemental as any).developmentSpec?.targetScalePyung).toBe(1800);
  });
});

describe('메모 면적 라벨 — 실제 골든 메모 문구', () => {
  it('sutaek r2: "신축 가능 연면적: 약 2,500평" 은 계획 연면적', () => {
    const slots = extractSlotsFromMemo(SUTAEK_MEMO);
    const slotPy = Number(slots.slots.find(s => s.key === 'totalFloorAreaPyung')?.value);
    expect(slotPy).toBe(2500); // 슬롯 추출기는 라벨을 구분하지 못한다 → 라벨 판정이 필요
    expect(isPlannedFloorAreaInMemo(SUTAEK_MEMO, slotPy)).toBe(true);
  });

  it('hotel r2: "연면적 1,162.4평" 은 현황 연면적 (계획 아님)', () => {
    const slots = extractSlotsFromMemo(HOTEL_MEMO);
    const slotPy = Number(slots.slots.find(s => s.key === 'totalFloorAreaPyung')?.value);
    expect(slotPy).toBeCloseTo(1162.4, 1);
    expect(isPlannedFloorAreaInMemo(HOTEL_MEMO, slotPy)).toBe(false);
    expect(slotPy * PY).toBeCloseTo(3842.6, 0);
  });

  it('㎡ 표기도 평으로 환산해 비교, 대지면적은 연면적 후보가 아니다', () => {
    const found = scanMemoFloorAreas('대지면적: 651.2㎡\n신축 가능 연면적 8,264㎡');
    expect(found).toHaveLength(1);
    expect(found[0].pyung).toBeCloseTo(8264 / PY, 1);
  });
});
