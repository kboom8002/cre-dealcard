import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/broker/excel-template
 * 렌트롤 표준양식 다운로드 (레거시 경로 호환).
 *
 * 과거에는 11컬럼 동적 xlsx(v1.2 비호환)를 생성했으나, 표준양식 SSOT는
 * public/CREDEAL_rentroll_template_v1.3.xlsx (scripts/build-rentroll-template.mjs 로 생성)
 * 하나로 통일되었으므로 정적 파일로 리다이렉트한다.
 */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(
    new URL("/CREDEAL_rentroll_template_v1.3.xlsx", request.url),
    307,
  );
}
