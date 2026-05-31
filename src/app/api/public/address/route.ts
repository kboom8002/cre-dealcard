import { NextRequest, NextResponse } from "next/server";
import { searchAddress } from "@/domain/verification/address-resolver";

/**
 * GET /api/public/address?keyword=역삼동+823
 *
 * 도로명주소 API 프록시 — 자유형식 주소 키워드로 정규화된 주소 목록을 반환합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const keyword = request.nextUrl.searchParams.get("keyword");

    if (!keyword || keyword.trim().length === 0) {
      return NextResponse.json(
        { error: "keyword 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const results = await searchAddress(keyword.trim());

    return NextResponse.json(results);
  } catch (err: unknown) {
    console.error("[api/public/address] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 내부 오류" },
      { status: 500 },
    );
  }
}
