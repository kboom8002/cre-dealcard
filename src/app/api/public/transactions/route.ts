import { NextRequest, NextResponse } from "next/server";
import {
  fetchMolitTransactions,
  runMolitETL,
} from "@/domain/prediction/price-prediction";

/**
 * GET /api/public/transactions?districtCode=11680&yearMonth=202506
 *
 * 국토부 실거래가 API 프록시 — 특정 구/월 상업용 거래내역을 반환합니다.
 */
export async function GET(request: NextRequest) {
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
    console.error("[api/public/transactions] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 내부 오류" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/public/transactions
 *
 * 서울 전구 실거래가 ETL 트리거.
 * Body: { months?: number }  (기본 12개월)
 */
export async function POST(request: NextRequest) {
  try {
    let months = 12;

    // POST body 파싱 (빈 body 허용)
    try {
      const body = await request.json();
      if (body.months != null) {
        months = Number(body.months);
        if (!Number.isInteger(months) || months < 1 || months > 36) {
          return NextResponse.json(
            { error: "months는 1~36 사이의 정수여야 합니다." },
            { status: 400 },
          );
        }
      }
    } catch {
      // JSON 파싱 실패 시 기본값 사용
    }

    const result = await runMolitETL(months);

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("[api/public/transactions] POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 내부 오류" },
      { status: 500 },
    );
  }
}
