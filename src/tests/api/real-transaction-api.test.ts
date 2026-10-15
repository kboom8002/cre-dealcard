import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchComparableTransactions,
  isWholeBuildingTransactionItem,
  filterWholeBuildingTransactions,
} from '@/lib/external/real-transaction-api';

describe('real-transaction-api — R11 일반(통건물) 실거래 필터링 및 토지평당가 산출', () => {
  const origEnv = process.env.DATA_GO_KR_API_KEY;

  beforeEach(() => {
    process.env.DATA_GO_KR_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.DATA_GO_KR_API_KEY = origEnv;
    vi.restoreAllMocks();
  });

  it('[Positive] isWholeBuildingTransactionItem: 일반 건물 통과, 집합건물 및 대지면적 없는 소형 구분호실 제외', () => {
    expect(
      isWholeBuildingTransactionItem({
        buildingType: '일반',
        plottageAr: '506.8',
        buildingAr: '1419.65',
      }),
    ).toBe(true);

    // Negative Pair 1: 집합건물
    expect(
      isWholeBuildingTransactionItem({
        buildingType: '집합',
        plottageAr: '30.5',
        buildingAr: '85.0',
      }),
    ).toBe(false);

    // Negative Pair 2: plottageAr 미기재 + 건물면적 66㎡ 미만 구분상가
    expect(
      isWholeBuildingTransactionItem({
        buildingType: '',
        plottageAr: '',
        buildingAr: '42.5',
      }),
    ).toBe(false);
  });

  it('[Positive / Negative] fetchComparableTransactions: 집합건물·해제거래 필터링 및 일반 건물 토지평당가(landPricePerPyeongManwon) 산출', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          response: {
            body: {
              items: {
                item: [
                  {
                    buildingType: '일반',
                    sggNm: '영등포구',
                    umdNm: '당산동1가',
                    jibun: '123',
                    dealYear: '2025',
                    dealMonth: '11',
                    dealDay: '15',
                    dealAmount: '1,150,000', // 115억
                    plottageAr: '330.5785', // 100평 -> 평당 11,500만원
                    buildingAr: '1200',
                    buildingUse: '제2종근린생활시설',
                    floor: '5',
                    cdealType: '',
                  },
                  {
                    buildingType: '집합',
                    sggNm: '영등포구',
                    umdNm: '당산동1가',
                    jibun: '456',
                    dealYear: '2025',
                    dealMonth: '11',
                    dealDay: '10',
                    dealAmount: '85,000',
                    plottageAr: '25.0',
                    buildingAr: '80.0',
                    buildingUse: '판매시설',
                    cdealType: '',
                  },
                  {
                    buildingType: '일반',
                    sggNm: '영등포구',
                    umdNm: '당산동2가',
                    jibun: '789',
                    dealYear: '2025',
                    dealMonth: '10',
                    dealDay: '20',
                    dealAmount: '900,000',
                    plottageAr: '300.0',
                    buildingAr: '950.0',
                    cdealType: 'O', // 해제된 거래
                  },
                ],
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    const results = await fetchComparableTransactions('11560', '202511');
    expect(results).toHaveLength(1);
    expect(results[0].address).toBe('영등포구 당산동1가 123');
    expect(results[0].buildingType).toBe('일반');
    expect(results[0].landAreaSqm).toBeCloseTo(330.5785, 3);
    expect(results[0].landPricePerPyeongManwon).toBe(11500);

    const filtered = filterWholeBuildingTransactions([
      results[0],
      {
        address: '집합 상가 호실',
        dealYear: 2025,
        dealMonth: 11,
        dealDay: 1,
        dealAmount: 500_000_000,
        area: 45,
        pricePerSqm: 11_111_111,
        pricePerPyeong: 36_730_000,
        buildingUse: '근린생활',
        floors: 1,
        buildingType: '집합',
      },
    ]);
    expect(filtered).toHaveLength(1);
  });
});
