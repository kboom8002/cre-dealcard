// src/lib/external/land-price-api.ts
// 개별공시지가 API
// 1차: 브이월드(V-World) 토지특성속성조회 API
// 2차: data.go.kr 개별공시지가 (레거시 폴백)
import { fetchWithRetry } from './fetch-with-retry';
import { getVWorldReferer } from './vworld-config';

export interface LandPriceData {
  pricePerSqm: number;        // 공시지가 (KRW/sqm)
  baseYear: string;           // 기준년도
  landCategory: string;       // 지목 (예: 대)
  landArea?: number;          // 토지면적 (㎡) — V-World 제공
  _source?: 'vworld' | 'data_go_kr';
  _isFallback?: boolean;
}

export async function fetchLandPrice(pnu: string): Promise<LandPriceData | null> {
  // ═══════════════════════════════════════════════════════════
  // 1차: 브이월드 토지특성속성조회 (getLandCharacteristics)
  // ═══════════════════════════════════════════════════════════
  const vworldKey = process.env.VWORLD_API_KEY;
  if (vworldKey && vworldKey !== "") {
    try {
      const stdrYear = new Date().getFullYear().toString();
      const url = `https://api.vworld.kr/ned/data/getLandCharacteristics?key=${vworldKey}&pnu=${pnu}&format=json&stdrYear=${stdrYear}&numOfRows=1&pageNo=1`;
      const res = await fetchWithRetry(url, {
        timeoutMs: 15_000,
        maxRetries: 2,
        headers: { 'Referer': getVWorldReferer() },
      });
      if (res.ok) {
        const data = await res.json();
        const items = data?.landCharacteristicss?.field;
        const item = Array.isArray(items) ? items[0] : items;

        if (item && parseFloat(item.pblntfPclnd || "0") > 0) {
          console.log(`[land-price-api] ✅ V-World 공시지가 조회 성공: ${Number(item.pblntfPclnd).toLocaleString()}원/㎡ (PNU: ${pnu})`);
          return {
            pricePerSqm: parseFloat(item.pblntfPclnd),
            baseYear: item.lastUpdtDt ? String(item.lastUpdtDt).substring(0, 4) : stdrYear,
            landCategory: String(item.lndcgrCodeNm || "대"),
            landArea: item.lndpclAr ? parseFloat(item.lndpclAr) : undefined,
            _source: 'vworld',
          };
        }
      } else {
        const body = await res.text().catch(() => '');
        console.warn(`[land-price-api] V-World 응답 오류 (${res.status}):`, body.slice(0, 200));
      }
    } catch (err) {
      console.warn("[land-price-api] V-World 호출 실패, data.go.kr 폴백 시도:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2차: data.go.kr 개별공시지가 (레거시 폴백)
  // ═══════════════════════════════════════════════════════════
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  if (apiKey && apiKey !== "") {
    try {
      const stdrYear = new Date().getFullYear().toString();
      const url = `https://apis.data.go.kr/1611000/IndvdLandPriceService/getIndvdLandPriceAttr?ServiceKey=${encodeURIComponent(apiKey)}&pnu=${pnu}&stdrYear=${stdrYear}&numOfRows=1&pageNo=1&_type=json`;
      const res = await fetchWithRetry(url, { timeoutMs: 15_000, maxRetries: 2 });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (body.includes('NO_OPENAPI_SERVICE_ERROR') || body.includes('returnReasonCode') && body.includes('12')) {
          console.warn('[land-price-api] ⚠ data.go.kr 개별공시지가 서비스 폐기됨. V-World API 키(VWORLD_API_KEY) 설정을 권장합니다.');
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
          _source: 'data_go_kr',
        };
      }
    } catch (err) {
      console.warn("[land-price-api] data.go.kr 폴백도 실패:", err);
    }
  }

  return null;
}

