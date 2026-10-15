/**
 * R11: 인근 시세 붙여넣기/CSV 파서(parseCompsPasteText) 및 주소 자동 보강(enrichCompByAddress) 단위 테스트
 */
import { describe, it, expect } from 'vitest';
import { parseCompsPasteText } from '@/domain/building/mobile-im/comps-paste-parser';
import {
  enrichCompByAddress,
  mapRoadSideToCondition,
} from '@/app/api/broker/im-lite/comps-enrich/route';

describe('R11 — parseCompsPasteText 결정론 파서', () => {
  it('[Positive] 탭(TSV)·파이프(|)·쉼표(,)·최소(주소+가격) 복합 입력 파싱 및 토지평당가 자동 계산', () => {
    const raw = [
      '구분\t소재지\t매매가\t대지면적\t연면적\t도로\t지하철',
      '영등포구 당산동4가 32-1\t매물\t95억\t대지 112.5평\t연면적 340평\t대로변\t당산역 도보 5분',
      '당산동5가 11-1, 138억, 대지 100평, 연면적 280평, 이면, 당산역 도보 4분, 2025.11',
      '당산동6가 12-3 110억',
      '영등포동7가 94-14 | 실거래 | 115억 5,000만 | 토지 330.58㎡ | 연 1,120㎡ | 코너 | 평당 1억 1,550만 | \'25.09',
    ].join('\n');

    const items = parseCompsPasteText(raw, 'listing');
    expect(items).toHaveLength(4);

    // 1) 탭 구분 행 + 토지평당가 자동 계산: round(95 * 10000 / 112.5) = 8444
    expect(items[0]).toMatchObject({
      kind: 'listing',
      location: '영등포구 당산동4가 32-1',
      price_eok: 95,
      land_area_pyeong: 112.5,
      gross_floor_area_pyeong: 340,
      gfa_pyeong: 340,
      road_condition: '대로변',
      road_side: '대로변',
      station_walk: '당산역 도보 5분',
      land_price_per_pyeong_manwon: 8444,
      selected: true,
    });

    // 2) 쉼표 구분 행 + 날짜 정규화: 2025.11 -> 2025-11, 평당가 round(138 * 10000 / 100) = 13800
    expect(items[1]).toMatchObject({
      kind: 'listing',
      location: '당산동5가 11-1',
      price_eok: 138,
      land_area_pyeong: 100,
      gross_floor_area_pyeong: 280,
      road_condition: '이면',
      station_walk: '당산역 도보 4분',
      date: '2025-11',
      as_of: '2025-11',
      land_price_per_pyeong_manwon: 13800,
      selected: true,
    });

    // 3) 최소 입력 (주소 + 가격)
    expect(items[2]).toMatchObject({
      kind: 'listing',
      location: '당산동6가 12-3',
      price_eok: 110,
      selected: true,
    });
    expect(items[2].land_price_per_pyeong_manwon).toBeUndefined();

    // 4) 파이프 구분 + 실거래 + 억/만 복합가(115.5억) + ㎡ 변환 + 명시적 평당가(11,550만) + '25.09 날짜
    expect(items[3]).toMatchObject({
      kind: 'transaction',
      location: '영등포동7가 94-14',
      price_eok: 115.5,
      land_area_sqm: 330.58,
      gross_floor_area_sqm: 1120,
      road_condition: '코너',
      land_price_per_pyeong_manwon: 11550,
      date: '2025-09',
      selected: true,
    });
    expect(items[3].land_area_pyeong).toBeCloseTo(100, 1);
  });

  it('[Positive] 최대 10건(MAX_MARKET_COMPS) 상한 캡 적용', () => {
    const lines = Array.from({ length: 15 }, (_, i) => `당산동4가 ${i + 1}-1\t매물\t${80 + i}억\t대지 100평`);
    const items = parseCompsPasteText(lines.join('\n'));
    expect(items).toHaveLength(10);
    expect(items[0].location).toBe('당산동4가 1-1');
    expect(items[9].location).toBe('당산동4가 10-1');
  });

  it('[Negative Pair] 빈 문자열·헤더만 있는 표·가격 없는 메모 줄은 결과에서 제외된다', () => {
    expect(parseCompsPasteText('')).toEqual([]);
    expect(
      parseCompsPasteText(
        [
          '소재지 | 매매가 | 대지면적 | 연면적 | 평당가',
          '|---|---|---|---|---|',
          '단순 참고 메모 줄 (가격 없음)',
        ].join('\n'),
      ),
    ).toEqual([]);
  });
});

describe('R11 — enrichCompByAddress 주소 기반 공공데이터·지하철 노선 병합 보강', () => {
  it('[Positive] 대지면적·연면적·도로조건(대로변/이면)·노선 병합 역 도보(당산역(2·9호선) 도보 5분)·토지평당가 산출', async () => {
    const enriched = await enrichCompByAddress(
      {
        address: '영등포구 당산동5가 11-47',
        price_eok: 95,
        kind: 'listing',
      },
      {
        resolveAddress: async () => ({
          pnu: '1156011500100110047',
          lat: 37.5342,
          lng: 126.9023,
          roadAddress: '서울특별시 영등포구 당산로 214',
          jibunAddress: '서울특별시 영등포구 당산동5가 11-47',
        }),
        fetchLandCharacteristics: async () => ({
          lndpclAr: 371.9, // 약 112.5평
          prposArea1Nm: '준공업지역',
          roadSideCodeNm: '광대소각', // -> '대로변'
        }),
        fetchBuildingRegisterByPnu: async () => ({
          totalArea: 1123.97, // 약 340.0평
        }),
        fetchSubwayStations: async () => [
          {
            place_name: '당산역 2호선',
            distance: '406',
            category_name: '교통,수송 > 지하철,전철 > 수도권2호선',
          },
          {
            place_name: '당산역 9호선',
            distance: '468',
            category_name: '교통,수송 > 지하철,전철 > 수도권9호선',
          },
        ],
      },
    );

    expect(enriched.location).toBe('영등포구 당산동5가 11-47');
    expect(enriched.kind).toBe('listing');
    expect(enriched.price_eok).toBe(95);
    expect(enriched.land_area_sqm).toBe(371.9);
    expect(enriched.land_area_pyeong).toBe(112.5);
    expect(enriched.gross_floor_area_sqm).toBe(1123.97);
    expect(enriched.gross_floor_area_pyeong).toBe(340);
    expect(enriched.road_condition).toBe('대로변');
    expect(enriched.road_side).toBe('대로변');
    expect(enriched.station_walk).toBe('당산역(2·9호선) 도보 5분');
    expect(enriched.land_price_per_pyeong_manwon).toBe(8444); // round(950000 / 112.5)
  });

  it('[Positive] 세로한면/소로한면 도로접면은 이면으로 매핑된다', () => {
    expect(mapRoadSideToCondition('광대소각')).toBe('대로변');
    expect(mapRoadSideToCondition('중로한면')).toBe('대로변');
    expect(mapRoadSideToCondition('세로한면(가)')).toBe('이면');
    expect(mapRoadSideToCondition('소로각지')).toBe('이면');
    expect(mapRoadSideToCondition('')).toBeUndefined();
  });

  it('[Negative Pair] 외부 API 호출 실패 시 예외를 던지지 않고 입력된 기본 필드만 안전하게 반환한다', async () => {
    const fallback = await enrichCompByAddress(
      {
        address: '영등포구 당산동4가 32-1',
        price_eok: 88,
        kind: 'transaction',
      },
      {
        resolveAddress: async () => ({
          pnu: '1156011400100320001',
          lat: 37.53,
          lng: 126.9,
        }),
        fetchLandCharacteristics: async () => {
          throw new Error('V-World timeout');
        },
        fetchBuildingRegisterByPnu: async () => {
          throw new Error('data.go.kr 503');
        },
        fetchSubwayStations: async () => {
          throw new Error('Kakao API error');
        },
      },
    );

    expect(fallback).toEqual({
      location: '영등포구 당산동4가 32-1',
      price_eok: 88,
      kind: 'transaction',
    });
  });
});
