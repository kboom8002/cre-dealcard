import { describe, test, expect } from 'vitest';
import { renderLandDetail } from '@/domain/building/mobile-im/section-renderers/land-detail-renderer';

// 2026-10-05 p5 회귀: 필지별 면적 미확인 시 건물 대지면적(518.7)을 필지마다 복제 → 합계 1,556.1㎡ 로 부풀려짐
describe('land_detail 다필지 — 면적 미확인 필지', () => {
  const base = { pnu: 'x', jimok: '대', ownershipRatio: 1 };

  test('필지별 면적 미확인 → 셀 "-", 합계는 건축물대장 대지면적(출처 명시)', () => {
    const md = renderLandDetail({
      parcels: [{ ...base, pnu: 'A', areaM2: 0 }, { ...base, pnu: 'B', areaM2: 0 }, { ...base, pnu: 'C', areaM2: 0 }],
      zoning: '-', registerLandAreaM2: 518.7,
    }).markdown;
    expect(md).toContain('| A | 대 | - | 100% | - |');
    expect(md).not.toContain('1,556.1');
    expect(md).not.toContain('유효 대지면적 합계');
    expect(md).toContain('대지면적 합계 (건축물대장): 518.7㎡');
  });

  test('일부만 확인 → 부분합을 합계로 쓰지 않음', () => {
    const md = renderLandDetail({
      parcels: [{ ...base, pnu: 'A', areaM2: 253.9 }, { ...base, pnu: 'B', areaM2: NaN }],
      zoning: '-',
    }).markdown;
    expect(md).toContain('| A | 대 | 253.9 |');
    expect(md).toContain('| B | 대 | - |');
    expect(md).not.toContain('합계');
  });

  test('전 필지 확인 → 기존 유효 합계', () => {
    const md = renderLandDetail({
      parcels: [{ ...base, pnu: 'A', areaM2: 253.9 }, { ...base, pnu: 'B', areaM2: 241.7 }, { ...base, pnu: 'C', areaM2: 23.1 }],
      zoning: '준공업지역', registerLandAreaM2: 518.7,
    }).markdown;
    expect(md).toContain('유효 대지면적 합계: 518.7㎡');
  });
});
