// src/lib/external/land-use-api.ts
// 국토교통부 토지이용규제정보서비스(LURIS) — 용도지역, 건폐율, 용적률
import { fetchWithRetry } from './fetch-with-retry';

export interface LandUsePlanData {
  zoningDistrict: string;         // 용도지역 (예: 일반상업지역)
  zoningOverlap: string[];        // 기타 용도지구 (예: 방화지구)
  buildingCoverageMax: number;    // 법정 건폐율 상한 (%)
  floorAreaRatioMax: number;      // 법정 용적률 상한 (%)
  _isFallback?: boolean;
}

export async function fetchLandUsePlan(pnu: string): Promise<LandUsePlanData | null> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;

  if (apiKey && apiKey !== "") {
    try {
      const url = `https://apis.data.go.kr/1611000/LandUseInfoService/getLandUseInfoAttr?ServiceKey=${encodeURIComponent(apiKey)}&pnu=${pnu}&cnflcAt=1&numOfRows=10&pageNo=1&_type=json`;
      const res = await fetchWithRetry(url, { timeoutMs: 15_000, maxRetries: 2 });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (body.includes('NO_OPENAPI_SERVICE_ERROR') || body.includes('returnReasonCode') && body.includes('12')) {
          console.warn('[land-use-api] ⚠ data.go.kr 토지이용규제 서비스 미구독. https://www.data.go.kr 에서 "LandUseInfoService" 활용 신청 필요.');
        }
        throw new Error(`API error ${res.status}: ${res.statusText} | ${body.slice(0, 200)}`);
      }
      const data = await res.json();

      const item = data?.response?.body?.items?.item;
      const targetItem = Array.isArray(item) ? item[0] : item;

      if (targetItem) {
        const zoningDistrict = String(targetItem.prposAreaDstrcCodeNm || "일반상업지역");
        const zoningOverlap = targetItem.etcCodeNm ? [String(targetItem.etcCodeNm)] : [];

        // LURIS API: ldCdBldgCovRt (건폐율), ldCdFlrArRt (용적률) 우선, 폴백으로 기존 필드
        const apiCoverage = parseFloat(targetItem.ldCdBldgCovRt || targetItem.cnflcAt || "0");
        const apiFloorRatio = parseFloat(targetItem.ldCdFlrArRt || targetItem.flrArRt || "0");

        let buildingCoverageMax = apiCoverage > 0 ? apiCoverage : 60;
        let floorAreaRatioMax = apiFloorRatio > 0 ? apiFloorRatio : 250;

        // API 값이 없을 때만 용도지역명 기반 폴백
        if (apiCoverage <= 0 || apiFloorRatio <= 0) {
          if (zoningDistrict.includes("상업")) { buildingCoverageMax = buildingCoverageMax || 60; floorAreaRatioMax = floorAreaRatioMax || 800; }
          else if (zoningDistrict.includes("준주거")) { buildingCoverageMax = buildingCoverageMax || 60; floorAreaRatioMax = floorAreaRatioMax || 400; }
          else if (zoningDistrict.includes("3종")) { buildingCoverageMax = buildingCoverageMax || 50; floorAreaRatioMax = floorAreaRatioMax || 250; }
          else if (zoningDistrict.includes("2종")) { buildingCoverageMax = buildingCoverageMax || 60; floorAreaRatioMax = floorAreaRatioMax || 200; }
        }

        return { zoningDistrict, zoningOverlap, buildingCoverageMax, floorAreaRatioMax };
      }
    } catch (err) {
      console.warn("[land-use-api] API failed, using deterministic fallback:", err);
    }
  }

  return null;
}
