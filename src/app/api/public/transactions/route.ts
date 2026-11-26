import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createModuleLogger } from "@/lib/logger";
import { fetchMolitTransactions } from "@/domain/prediction/price-prediction";

const log = createModuleLogger("route");

/**
 * GET /api/public/transactions?districtCode=11680&yearMonth=202506
 *
 * 국토부 실거래가 API 프록시 — 특정 구/월 상업용 거래내역을 반환합니다.
 * (관리자 전용 실거래가 ETL 트리거는 /api/admin/etl/molit 에서만 실행됩니다.)
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request) ?? "anonymous";
  const allowed = await checkRateLimit(ip, "public_transactions_get", 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const params = request.nextUrl.searchParams;
    const districtCode = params.get("districtCode");
    const yearMonth = params.get("yearMonth");

    if (!districtCode || !yearMonth) {
      return NextResponse.json(
        { error: "districtCode와 yearMonth 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    // 시군구코드 형식 검증 (5자리 숫자)
    if (!/^\d{5}$/.test(districtCode)) {
      return NextResponse.json(
        { error: "districtCode는 5자리 숫자여야 합니다. (예: 11680)" },
        { status: 400 },
      );
    }

    // 연월 형식 검증 (YYYYMM)
    if (!/^\d{6}$/.test(yearMonth)) {
      return NextResponse.json(
        { error: "yearMonth는 YYYYMM 형식이어야 합니다. (예: 202506)" },
        { status: 400 },
      );
    }

    const transactions = await fetchMolitTransactions(districtCode, yearMonth);

    return NextResponse.json(transactions);
  } catch (err: unknown) {
    log.error("[api/public/transactions] GET Error:", err);
    return NextResponse.json(
      { error: "실거래가 조회 중 서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
