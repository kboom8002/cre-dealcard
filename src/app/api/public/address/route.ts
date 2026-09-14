import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { searchAddress } from "@/domain/verification/address-resolver";
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('route');

const AddressSearchQuerySchema = z.object({
  keyword: z.string().trim().min(1, "keyword 파라미터가 필요합니다.").max(200, "검색어가 너무 깁니다."),
});

/**
 * GET /api/public/address?keyword=역삼동+823
 *
 * 도로명주소 API 프록시 — 자유형식 주소 키워드로 정규화된 주소 목록을 반환합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const parsed = AddressSearchQuerySchema.safeParse({
      keyword: request.nextUrl.searchParams.get("keyword") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "keyword 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const { keyword } = parsed.data;
    const results = await searchAddress(keyword);

    return NextResponse.json(results);
  } catch (err: unknown) {
    log.error("[api/public/address] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 내부 오류" },
      { status: 500 },
    );
  }
}
