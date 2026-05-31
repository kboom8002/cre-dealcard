import { NextRequest, NextResponse } from "next/server";
import { fetchBuildingRegister } from "@/domain/verification/govt-api-client";
import { resolveAddressToComponents } from "@/domain/verification/address-resolver";

/**
 * GET /api/public/building-register
 *
 * 건축물대장 표제부 조회 프록시.
 *
 * 사용법 A — 주소 자동 분해:
 *   ?address=역삼동+742-1
 *
 * 사용법 B — 코드 직접 입력:
 *   ?sigunguCd=11680&bjdongCd=10100&bun=742&ji=1
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const address = params.get("address");

    let sigunguCd = params.get("sigunguCd");
    let bjdongCd = params.get("bjdongCd");
    let bun = params.get("bun");
    let ji = params.get("ji");

    // 주소 문자열이 있으면 코드로 자동 변환
    if (address && address.trim().length > 0) {
      const components = await resolveAddressToComponents(address.trim());

      if (!components) {
        return NextResponse.json(
          { error: "주소를 분석할 수 없습니다. 지번주소 형식(예: 역삼동 742-1)으로 입력해주세요." },
          { status: 400 },
        );
      }

      sigunguCd = components.sigunguCd;
      bjdongCd = components.bjdongCd;
      bun = components.bun;
      ji = components.ji;
    }

    // 필수 파라미터 검증
    if (!sigunguCd || !bjdongCd || !bun || !ji) {
      return NextResponse.json(
        {
          error:
            "address 파라미터 또는 sigunguCd, bjdongCd, bun, ji 파라미터가 모두 필요합니다.",
        },
        { status: 400 },
      );
    }

    const result = await fetchBuildingRegister(sigunguCd, bjdongCd, bun, ji);

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("[api/public/building-register] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 내부 오류" },
      { status: 500 },
    );
  }
}
