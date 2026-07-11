// src/domain/building/mobile-im/vacancy-positioning.ts
// [E3] 공실률 권역 상대 포지셔닝
//
// 본 자산의 공실률을 권역 평균과 비교하여 "Below Average / Average / Above Average"로 판정.
// 데이터 소스: 한국부동산원 오피스·근린상가 공실률 조사 (2025년 기준)
// 주의: 권역 평균값은 분기별 업데이트가 필요하며, 하드코딩된 값은 개략적 기준치입니다.

export interface VacancyBenchmark {
  assetVacancyPct: number;
  regionAvgPct: number;
  regionName: string;
  positioning: "Below Average" | "Average" | "Above Average";
  /** 자산 공실률 - 권역 평균 공실률 (음수 = 권역보다 낮음 = 유리) */
  delta: number;
}

/**
 * 권역별 평균 공실률 (한국부동산원 2025년 기준, 오피스 기준)
 * - 출처: 한국부동산원 상업용 부동산 임대동향조사
 * - 업데이트 주기: 분기별 (다음 업데이트: 2025Q3)
 */
const REGION_VACANCY_BENCHMARKS: Record<string, { avg: number; label: string }> = {
  "GBD":        { avg: 8.2,  label: "강남 업무권역(GBD)" },
  "강남":       { avg: 8.2,  label: "강남 업무권역(GBD)" },
  "CBD":        { avg: 10.5, label: "도심 업무권역(CBD)" },
  "도심":       { avg: 10.5, label: "도심 업무권역(CBD)" },
  "종로":       { avg: 10.5, label: "도심 업무권역(CBD)" },
  "YBD":        { avg: 7.8,  label: "여의도 업무권역(YBD)" },
  "여의도":     { avg: 7.8,  label: "여의도 업무권역(YBD)" },
  "성수":       { avg: 4.5,  label: "성수 특화권역" },
  "판교":       { avg: 3.2,  label: "판교 테크노밸리" },
  "마곡":       { avg: 5.1,  label: "마곡 산업단지" },
  "구로":       { avg: 9.3,  label: "구로·금천 지식산업센터" },
  "가산":       { avg: 9.3,  label: "가산 디지털단지" },
  "홍대":       { avg: 6.8,  label: "홍대·합정 상권" },
  "이태원":     { avg: 12.4, label: "이태원·한남 상권" },
  "한남":       { avg: 12.4, label: "이태원·한남 상권" },
  "강동":       { avg: 11.2, label: "강동·하남 권역" },
  "분당":       { avg: 7.5,  label: "분당 업무권역" },
  "서울":       { avg: 9.1,  label: "서울 전체 평균" },
};

/** 권역 키워드 매핑 순서: 더 구체적인 키워드를 먼저 매칭 */
const REGION_MATCH_ORDER = [
  "GBD", "CBD", "YBD", "성수", "판교", "마곡", "구로", "가산",
  "홍대", "이태원", "한남", "강동", "분당", "강남", "도심", "종로",
  "여의도", "서울",
];

function findRegionBenchmark(areaSignal: string): { key: string; avg: number; label: string } | null {
  for (const key of REGION_MATCH_ORDER) {
    if (areaSignal.includes(key)) {
      const bench = REGION_VACANCY_BENCHMARKS[key];
      return { key, avg: bench.avg, label: bench.label };
    }
  }
  return null;
}

/**
 * 본 자산의 공실률을 권역 평균과 비교하여 포지셔닝을 산출합니다.
 *
 * @param vacancyPct - 본 자산 공실률 (%)
 * @param areaSignal - 권역 문자열 (예: "강남", "GBD", "성수 핵심 권역")
 * @returns VacancyBenchmark 또는 null (권역 데이터 없을 때)
 */
export function computeVacancyPositioning(
  vacancyPct: number,
  areaSignal: string
): VacancyBenchmark | null {
  const regionData = findRegionBenchmark(areaSignal);
  if (!regionData) return null;

  const delta = vacancyPct - regionData.avg;

  // 판정 기준: ±2%p 이내 = Average
  const positioning: VacancyBenchmark["positioning"] =
    delta < -2 ? "Below Average" : delta > 2 ? "Above Average" : "Average";

  return {
    assetVacancyPct: vacancyPct,
    regionAvgPct:    regionData.avg,
    regionName:      regionData.label,
    positioning,
    delta,
  };
}

/**
 * 공실률 포지셔닝 결과를 마크다운 행으로 포맷팅합니다.
 * (writer.ts의 임대 현황 테이블에 append용)
 */
export function formatVacancyPositioningRow(bench: VacancyBenchmark): string {
  const emoji =
    bench.positioning === "Below Average" ? "🟢"
    : bench.positioning === "Above Average" ? "🔴"
    : "🟡";

  const deltaStr =
    bench.delta > 0
      ? `+${bench.delta.toFixed(1)}%p (권역 대비 높음)`
      : bench.delta < 0
      ? `${bench.delta.toFixed(1)}%p (권역 대비 낮음)`
      : "권역 평균 수준";

  return `| **권역 대비 공실률** | ${emoji} **${deltaStr}** | ${bench.regionName} 평균 ${bench.regionAvgPct}% |`;
}
