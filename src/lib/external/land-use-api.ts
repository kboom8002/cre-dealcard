// src/lib/external/land-use-api.ts
// 토지이용규제정보 — 용도지역, 건폐율, 용적률
// 1차: 브이월드(V-World) 토지특성속성조회 API
// 2차: data.go.kr LURIS (레거시 폴백)
import { fetchWithRetry } from './fetch-with-retry';
import { getVWorldApiKey, getVWorldReferer } from './vworld-config';

export interface LandUsePlanData {
  zoningDistrict: string;         // 용도지역 (예: 제2종일반주거지역)
  zoningOverlap: string[];        // 기타 용도지구 (예: 방화지구)
  buildingCoverageMax: number;    // 법정 건폐율 상한 (%)
  floorAreaRatioMax: number;      // 법정 용적률 상한 (%)
  landArea?: number;              // 토지면적 (㎡) — V-World 제공
  landShape?: string;             // 형상 (사다리형, 정방형 등)
  terrain?: string;               // 지형 (평지, 완경사 등)
  roadAccess?: string;            // 도로접면 (세로한면, 세로두면 등)
  landUseSituation?: string;      // 이용상황 (주거용, 상업기타 등)
  _source?: 'vworld' | 'data_go_kr' | 'fallback';
  _isFallback?: boolean;
}

/** 용도지역명 → 법정 건폐율·용적률 상한 추론 */
function inferZoningLimits(zoningDistrict: string): { coverage: number; far: number } {
  if (zoningDistrict.includes("중심상업")) return { coverage: 60, far: 1000 };
  if (zoningDistrict.includes("일반상업")) return { coverage: 60, far: 800 };
  if (zoningDistrict.includes("근린상업")) return { coverage: 60, far: 600 };
  if (zoningDistrict.includes("유통상업")) return { coverage: 60, far: 600 };
  if (zoningDistrict.includes("준주거")) return { coverage: 60, far: 400 };
  if (zoningDistrict.includes("3종일반주거") || zoningDistrict.includes("제3종")) return { coverage: 50, far: 250 };
  if (zoningDistrict.includes("2종일반주거") || zoningDistrict.includes("제2종")) return { coverage: 60, far: 200 };
  if (zoningDistrict.includes("1종일반주거") || zoningDistrict.includes("제1종일반")) return { coverage: 60, far: 150 };
  if (zoningDistrict.includes("전용주거")) return { coverage: 50, far: 100 };
  if (zoningDistrict.includes("준공업")) return { coverage: 60, far: 400 };
  if (zoningDistrict.includes("일반공업")) return { coverage: 60, far: 350 };
  if (zoningDistrict.includes("전용공업")) return { coverage: 60, far: 300 };
  if (zoningDistrict.includes("보전녹지")) return { coverage: 20, far: 80 };
  if (zoningDistrict.includes("생산녹지")) return { coverage: 20, far: 100 };
  if (zoningDistrict.includes("자연녹지")) return { coverage: 20, far: 100 };
  return { coverage: 60, far: 250 };
}

export async function fetchLandUsePlan(pnu: string): Promise<LandUsePlanData | null> {
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

          if (item && item.prposArea1Nm) {
            const zoningDistrict = String(item.prposArea1Nm);
            const zoningOverlap = item.prposArea2Nm && item.prposArea2Nm !== '지정되지않음' && item.prposArea2Nm !== '-'
              ? [String(item.prposArea2Nm)]
              : [];

            const { coverage, far } = inferZoningLimits(zoningDistrict);

            console.log(`[land-use-api] ✅ V-World 조회 성공 (${stdrYear}): ${zoningDistrict} (PNU: ${pnu})`);
            return {
              zoningDistrict,
              zoningOverlap,
              buildingCoverageMax: coverage,
              floorAreaRatioMax: far,
              landArea: item.lndpclAr ? parseFloat(item.lndpclAr) : undefined,
              landShape: item.tpgrphFrmCodeNm || undefined,
              terrain: item.tpgrphHgCodeNm || undefined,
              roadAccess: item.roadSideCodeNm || undefined,
              landUseSituation: item.ladUseSittnNm || undefined,
              _source: 'vworld',
            };
          } else {
            console.info(`[land-use-api] V-World 토지특성 ${stdrYear}년 데이터 없음, 이전 연도 확인 시도`);
          }
        } else {
          const body = await res.text().catch(() => '');
          console.warn(`[land-use-api] V-World 응답 오류 (${res.status}):`, body.slice(0, 200));
        }
      } catch (err) {
        console.warn(`[land-use-api] V-World 호출 실패 (${stdrYear}):`, err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2차: data.go.kr LURIS (레거시 폴백)
  // ═══════════════════════════════════════════════════════════
  console.warn('[land-use-api] ⚠ data.go.kr 토지이용규제 서비스 폐기됨. V-World API 키(VWORLD_API_KEY) 설정을 권장합니다. (폴백 생략)');
  return null;
}
