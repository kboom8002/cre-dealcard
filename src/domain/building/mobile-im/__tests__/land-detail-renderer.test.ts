import { describe, test, expect } from 'vitest';
import { renderLandDetail, LandDetailInput } from '../section-renderers/land-detail-renderer';

describe('renderLandDetail', () => {
  test('V-World 필드(landShape, landTopography, roadFrontage)가 모두 있는 경우 마크다운을 올바르게 렌더링한다', () => {
    const input: LandDetailInput = {
      parcels: [{
        pnu: '1111010100100010000',
        jimok: '대',
        areaM2: 330.58,
        ownershipRatio: 1,
        officialLandPricePerM2: 10000000
      }],
      zoning: '일반상업지역',
      buildingCoverageRatio: 60,
      floorAreaRatio: 200,
      maxFar: 250,
      landShape: '정방형',
      landTopography: '평지',
      roadFrontage: '광대한면'
    };

    const result = renderLandDetail(input);
    expect(result.markdown).toContain('- **필지 형상**: 정방형');
    expect(result.markdown).toContain('- **지형**: 평지');
    expect(result.markdown).toContain('- **도로접면**: 광대한면');
    expect(result.markdown).toContain('- **대지면적**: 330.58㎡ (100.0평)');
    expect(result.markdown).toContain('- **공시지가**: 10,000,000원/㎡');
  });

  test('V-World 필드가 누락된 경우 출력에서 생략된다', () => {
    const input: LandDetailInput = {
      parcels: [{
        pnu: '1111010100100010000',
        jimok: '대',
        areaM2: 330.58,
        ownershipRatio: 1
      }],
      zoning: '일반상업지역'
    };

    const result = renderLandDetail(input);
    expect(result.markdown).not.toContain('필지 형상');
    expect(result.markdown).not.toContain('지형');
    expect(result.markdown).not.toContain('도로접면');
    expect(result.markdown).not.toContain('공시지가');
  });

  test('빈/null 입력에 대해 적절한 기본값을 반환한다', () => {
    const input: LandDetailInput = {
      parcels: [],
      zoning: '미상'
    };

    const result = renderLandDetail(input);
    expect(result.section_type).toBe('land_detail');
    expect(result.title).toBe('토지 현황');
    expect(result.markdown).toContain('### 이용 규제');
    expect(result.markdown).toContain('- **용도지역**: 미상');
  });

  test('단일 필지와 다중 필지에 대한 텍스트 포맷이 올바르다 (단위: ㎡, 평, 원/㎡)', () => {
    const multiInput: LandDetailInput = {
      parcels: [
        { pnu: '1', jimok: '대', areaM2: 100, ownershipRatio: 0.5, officialLandPricePerM2: 1000 },
        { pnu: '2', jimok: '대', areaM2: 200, ownershipRatio: 1, officialLandPricePerM2: 2000 }
      ],
      zoning: '상업지역'
    };

    const result = renderLandDetail(multiInput);
    expect(result.markdown).toContain('### 필지 구성 (2필지)');
    expect(result.markdown).toContain('| PNU | 지목 | 면적(㎡) | 지분율 | 공시지가(원/㎡) |');
    expect(result.markdown).toContain('> **유효 대지면적 합계: 250㎡ (75.6평)**');
  });
});
