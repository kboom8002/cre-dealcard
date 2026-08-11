// src/lib/external/land-price-api.ts
// 국토교통부 개별공시지가 API
import { fetchWithRetry } from './fetch-with-retry';

export interface LandPriceData {
  pricePerSqm: number;        // 공시지가 (KRW/sqm)
  baseYear: string;           // 기준년도
  landCategory: string;       // 지목 (예: 대)
  _isFallback?: boolean;
}

export async function fetchLandPrice(pnu: string): Promise<LandPriceData | null> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  if (apiKey && apiKey !== "") {
    try {
      const stdrYear = new Date().getFullYear().toString();
      const url = `https://apis.data.go.kr/1611000/IndvdLandPriceService/getIndvdLandPriceAttr?ServiceKey=${encodeURIComponent(apiKey)}&pnu=${pnu}&stdrYear=${stdrYear}&numOfRows=1&pageNo=1&_type=json`;
      const res = await fetchWithRetry(url, { timeoutMs: 15_000, maxRetries: 2 });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (body.includes('NO_OPENAPI_SERVICE_ERROR') || body.includes('returnReasonCode') && body.includes('12')) {
          console.warn('[land-price-api] ⚠ data.go.kr 개별공시지가 서비스 미구독. https://www.data.go.kr 에서 "IndvdLandPriceService" 활용 신청 필요.');
        }
        throw new Error(`API error ${res.status}: ${res.statusText} | ${body.slice(0, 200)}`);
      }
      const data = await res.json();

      const item = data?.response?.body?.items?.item;
      const targetItem = Array.isArray(item) ? item[0] : item;

      if (targetItem) {
        return {
          pricePerSqm: parseFloat(targetItem.pblntfPclnd || "0"),
          baseYear: String(targetItem.crtrYr || "2025"),
          landCategory: String(targetItem.ldcgCdNm || "대"),
        };
      }
    } catch (err) {
      console.warn("[land-price-api] API failed, using deterministic fallback:", err);
    }
  }

  return null;
}
