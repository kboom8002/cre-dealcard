// src/lib/external/real-transaction-api.ts
// 국토교통부 상업업무용 부동산 매매 신고 조회 API — 주변 실거래 비교 사례

export interface ComparableTransaction {
  address: string;               // 주소
  dealYear: number;
  dealMonth: number;
  dealDay: number;
  dealAmount: number;            // 거래금액 (KRW)
  area: number;                  // 연면적 (sqm)
  pricePerSqm: number;           // 평방미터당 가격 (KRW)
  pricePerPyeong: number;        // 평당 가격 (KRW)
  buildingUse: string;           // 용도
  floors: number;                // 층수
  transactionType?: string;      // 매매, 전세, 월세
  _isFallback?: boolean;
}

/**
 * 현재 월 기준 직전 3개월 실거래 데이터를 조회합니다.
 * 국토부 API는 특정 월만 조회 가능하므로, 최근 3개월을 병렬 조회 후 병합합니다.
 */
export async function fetchComparableTransactions(
  sigunguCd: string,
  yearMonth?: string
): Promise<ComparableTransaction[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  if (apiKey && apiKey !== "") {
    const months = yearMonth ? [yearMonth] : getRecentMonths(3);
    const allResults: ComparableTransaction[] = [];

    await Promise.all(months.map(async (ym) => {
      try {
        const url = `https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade?ServiceKey=${apiKey}&LAWD_CD=${sigunguCd}&DEAL_YMD=${ym}&numOfRows=10&pageNo=1&_type=json`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
        const data = await res.json();

        const item = data?.response?.body?.items?.item;
        const itemsArray: any[] = Array.isArray(item) ? item : item ? [item] : [];

        if (itemsArray.length > 0) {
          const parsed = itemsArray.map((t: any) => {
            const dealAmtTenThousand = parseInt(String(t.dealAmount).replace(/,/g, "").trim(), 10) || 0;
            const dealAmount = dealAmtTenThousand * 10000;
            const area = parseFloat(t.totArea || "1");
            const pricePerSqm = dealAmount / area;
            const pricePerPyeong = pricePerSqm * 3.30578;

            return {
              address: `${t.sigungu || ""} ${t.dong || ""} ${t.jibun || ""}`.trim(),
              dealYear: parseInt(t.dealYear || "2025", 10),
              dealMonth: parseInt(t.dealMonth || "10", 10),
              dealDay: parseInt(t.dealDay || "1", 10),
              dealAmount,
              area,
              pricePerSqm,
              pricePerPyeong,
              buildingUse: String(t.buildingUse || "근린생활"),
              floors: parseInt(t.floor || "5", 10),
              _isFallback: false
            };
          });
          allResults.push(...parsed);
        }
      } catch (err) {
        console.warn(`[real-transaction-api] API failed for ${ym}:`, err);
      }
    }));

    if (allResults.length > 0) {
      // 최신순 정렬, 최대 10건
      return allResults
        .sort((a, b) => (b.dealYear * 100 + b.dealMonth) - (a.dealYear * 100 + a.dealMonth))
        .slice(0, 10);
    }
  }

  // DETERMINISTIC MOCK DATA
  const isGangnam = sigunguCd === "11680";

  if (isGangnam) {
    return [
      {
        address: "서울특별시 강남구 역삼동 824-2",
        dealYear: 2025, dealMonth: 8, dealDay: 12,
        dealAmount: 38500000000, area: 2450,
        pricePerSqm: 15714285, pricePerPyeong: 51948051,
        buildingUse: "업무시설", floors: 8,
        transactionType: "매매",
        _isFallback: true,
      },
      {
        address: "서울특별시 강남구 역삼동 736-4",
        dealYear: 2025, dealMonth: 6, dealDay: 24,
        dealAmount: 29000000000, area: 1820,
        pricePerSqm: 15934065, pricePerPyeong: 52674311,
        buildingUse: "근린생활시설", floors: 6,
        transactionType: "매매",
        _isFallback: true,
      },
      {
        address: "서울특별시 강남구 삼성동 143-12",
        dealYear: 2025, dealMonth: 5, dealDay: 30,
        dealAmount: 42000000000, area: 2750,
        pricePerSqm: 15272727, pricePerPyeong: 50487012,
        buildingUse: "업무시설", floors: 9,
        transactionType: "매매",
        _isFallback: true,
      },
    ];
  }
  return [
    {
      address: "서울특별시 서초구 서초동 1308-4",
      dealYear: 2025, dealMonth: 9, dealDay: 15,
      dealAmount: 18500000000, area: 1250,
      pricePerSqm: 14800000, pricePerPyeong: 48925586,
      buildingUse: "근린생활시설", floors: 5,
      transactionType: "매매",
      _isFallback: true,
    },
    {
      address: "서울특별시 서초구 서초동 1321-2",
      dealYear: 2025, dealMonth: 7, dealDay: 11,
      dealAmount: 22000000000, area: 1500,
      pricePerSqm: 14666666, pricePerPyeong: 48484814,
      buildingUse: "업무시설", floors: 6,
      transactionType: "매매",
      _isFallback: true,
    },
  ];
}

/** 현재 월 기준 직전 N개월의 YYYYMM 배열 반환 */
function getRecentMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}
