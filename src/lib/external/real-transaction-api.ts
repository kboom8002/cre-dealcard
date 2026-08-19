// src/lib/external/real-transaction-api.ts
// 국토교통부 상업업무용 부동산 매매 신고 조회 API — 주변 실거래 비교 사례
import { fetchWithRetry } from './fetch-with-retry';

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
        const url = `https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade?ServiceKey=${encodeURIComponent(apiKey)}&LAWD_CD=${sigunguCd}&DEAL_YMD=${ym}&numOfRows=10&pageNo=1&_type=json`;
        const res = await fetchWithRetry(url, { timeoutMs: 10_000, maxRetries: 1 });
        if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
        const data = await res.json();

        const item = data?.response?.body?.items?.item;
        const itemsArray: any[] = Array.isArray(item) ? item : item ? [item] : [];

        if (itemsArray.length > 0) {
          const parsed: ComparableTransaction[] = itemsArray
            .map((t: any): ComparableTransaction | null => {
              // 해제된 거래 제외 (cdealType === 'O')
              if (String(t.cdealType || "").trim() === "O") return null;

              const dealAmtTenThousand = parseInt(String(t.dealAmount || "0").replace(/,/g, "").trim(), 10) || 0;
              const dealAmount = dealAmtTenThousand * 10000;
              if (dealAmount <= 0) return null;

              // 국토부 상업업무용 API: buildingAr(건물면적) 우선, 없으면 plottageAr(대지면적)
              const rawArea = parseFloat(String(t.buildingAr || t.bldgArea || t.plottageAr || t.totArea || t.area || "0"));
              if (!rawArea || isNaN(rawArea) || rawArea <= 0) return null;

              const area = rawArea;
              const pricePerSqm = dealAmount / area;
              const pricePerPyeong = Math.round(pricePerSqm * 3.30578);

              // 비정상 이상치(평당 50만원 미만 또는 평당 5억원 초과) 필터링
              if (pricePerPyeong < 500_000 || pricePerPyeong > 500_000_000) return null;

              const sgg = String(t.sggNm || t.sigungu || "").trim();
              const umd = String(t.umdNm || t.dong || "").trim();
              const jibun = String(t.jibun || "").trim();
              const address = [sgg, umd, jibun].filter(Boolean).join(" ");

              return {
                address: address || "서울시 인근 상업용 자산",
                dealYear: parseInt(String(t.dealYear || "2025"), 10),
                dealMonth: parseInt(String(t.dealMonth || "1"), 10),
                dealDay: parseInt(String(t.dealDay || "1"), 10),
                dealAmount,
                area,
                pricePerSqm: Math.round(pricePerSqm),
                pricePerPyeong,
                buildingUse: String(t.buildingUse || "근린생활"),
                floors: parseInt(String(t.floor || t.flr || "0").trim(), 10) || 0,
                _isFallback: false
              };
            })
            .filter((item): item is ComparableTransaction => item !== null);

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

  // 실거래 데이터 없음
  return [];
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
