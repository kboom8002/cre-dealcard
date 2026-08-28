/**
 * @module monthly-transaction-summary
 * @description external_transactions 테이블의 일별 실거래 데이터를 바탕으로
 * 권역별 월간 거래 통계(거래 건수, 평균가, 전월 대비 변동률, 용도별 분포)를 집계합니다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MonthlyTransactionSummary {
  yearMonth: string;
  region: string;
  totalCount: number;
  avgPriceManwon: number;
  maxPriceManwon: number;
  minPriceManwon: number;
  avgPricePerPyeongManwon: number;
  previousMonthCount: number;
  countChangeRatePct: number;
  byUsageType: Record<string, number>;
}

/**
 * 특정 연월(YYYY-MM)과 대상 권역들에 대한 월간 실거래 통계를 산출합니다.
 */
export async function summarizeMonthlyTransactions(
  supabase: SupabaseClient,
  yearMonth: string,
  regions: string[] = ["성수동", "강남구", "영등포구"]
): Promise<MonthlyTransactionSummary[]> {
  const summaries: MonthlyTransactionSummary[] = [];
  const startDate = `${yearMonth}-01`;
  const endDate = `${yearMonth}-31`;

  // 전월 계산
  const [yStr, mStr] = yearMonth.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonthNum = m === 1 ? 12 : m - 1;
  const prevYearMonth = `${prevYear}-${String(prevMonthNum).padStart(2, "0")}`;
  const prevStartDate = `${prevYearMonth}-01`;
  const prevEndDate = `${prevYearMonth}-31`;

  for (const region of regions) {
    try {
      // 1. 당월 실거래 데이터 조회
      const { data: currentRows } = await supabase
        .from("external_transactions")
        .select("transaction_price, building_area, usage_type, dong, district")
        .or(`district.ilike.%${region}%,dong.ilike.%${region}%,address.ilike.%${region}%`)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate);

      // 2. 전월 거래 건수 조회
      const { count: prevCount } = await supabase
        .from("external_transactions")
        .select("id", { count: "exact", head: true })
        .or(`district.ilike.%${region}%,dong.ilike.%${region}%,address.ilike.%${region}%`)
        .gte("transaction_date", prevStartDate)
        .lte("transaction_date", prevEndDate);

      if (!currentRows || currentRows.length === 0) {
        continue;
      }

      const count = currentRows.length;
      const prices = currentRows.map((r: any) => r.transaction_price || 0).filter((p) => p > 0);
      const validAreaRows = currentRows.filter((r: any) => (r.building_area || 0) > 0 && (r.transaction_price || 0) > 0);

      const totalPrice = prices.reduce((acc, val) => acc + val, 0);
      const avgPrice = count > 0 ? totalPrice / count : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

      // 평당가 산출 (3.3058 sqm)
      const pyeongPrices = validAreaRows.map((r: any) => {
        const pyeong = r.building_area / 3.3058;
        return pyeong > 0 ? r.transaction_price / pyeong : 0;
      }).filter((p) => p > 0);

      const avgPyeongPrice = pyeongPrices.length > 0
        ? pyeongPrices.reduce((a, b) => a + b, 0) / pyeongPrices.length
        : 0;

      // 용도별 분포
      const byUsage: Record<string, number> = {};
      currentRows.forEach((r: any) => {
        const u = r.usage_type || "기타";
        byUsage[u] = (byUsage[u] || 0) + 1;
      });

      const pCount = prevCount || 0;
      const changeRate = pCount > 0 ? Math.round(((count - pCount) / pCount) * 1000) / 10 : 0;

      summaries.push({
        yearMonth,
        region,
        totalCount: count,
        avgPriceManwon: Math.round(avgPrice / 10000),
        maxPriceManwon: Math.round(maxPrice / 10000),
        minPriceManwon: Math.round(minPrice / 10000),
        avgPricePerPyeongManwon: Math.round(avgPyeongPrice / 10000),
        previousMonthCount: pCount,
        countChangeRatePct: changeRate,
        byUsageType: byUsage,
      });
    } catch (err) {
      console.warn(`[MonthlySummary] Error processing region ${region}:`, err);
    }
  }

  return summaries;
}
