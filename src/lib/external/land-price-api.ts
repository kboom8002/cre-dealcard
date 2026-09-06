// src/lib/external/land-price-api.ts
// 개별공시지가 API
// 1차: 브이월드(V-World) 토지특성속성조회 API
// 2차: data.go.kr 개별공시지가 (레거시 폴백)
import { fetchWithRetry } from './fetch-with-retry';
import { getVWorldApiKey, getVWorldReferer } from './vworld-config';

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
  const vworldKey = getVWorldApiKey();
  if (vworldKey && vworldKey !== "") {
    const currentYear = new Date().getFullYear();
    const yearsToTry = [currentYear.toString(), (currentYear - 1).toString()];

    for (const stdrYear of yearsToTry) {
      try {
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
            console.log(`[land-price-api] ✅ V-World 공시지가 조회 성공 (${stdrYear}): ${Number(item.pblntfPclnd).toLocaleString()}원/㎡ (PNU: ${pnu})`);
            return {
              pricePerSqm: parseFloat(item.pblntfPclnd),
              baseYear: item.lastUpdtDt ? String(item.lastUpdtDt).substring(0, 4) : stdrYear,
              landCategory: String(item.lndcgrCodeNm || "대"),
              landArea: item.lndpclAr ? parseFloat(item.lndpclAr) : undefined,
              _source: 'vworld',
            };
          } else {
            console.info(`[land-price-api] V-World 공시지가 ${stdrYear}년 데이터 없음, 이전 연도 확인 시도`);
          }
        } else {
          const body = await res.text().catch(() => '');
          console.warn(`[land-price-api] V-World 응답 오류 (${res.status}):`, body.slice(0, 200));
        }
      } catch (err) {
        console.warn(`[land-price-api] V-World 호출 실패 (${stdrYear}):`, err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2차: data.go.kr 개별공시지가 (레거시 폴백)
  // ═══════════════════════════════════════════════════════════
  console.warn('[land-price-api] ⚠ data.go.kr 개별공시지가 서비스 폐기됨. V-World API 키(VWORLD_API_KEY) 설정을 권장합니다. (폴백 생략)');
  return null;
}

