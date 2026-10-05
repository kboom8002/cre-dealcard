import { NextRequest } from "next/server";
import {
  NO_STORE_CACHE_CONTROL,
  parseImageFormat,
  validateImageParams,
} from "@/lib/magazine/og-image-data";
import { renderMagazineImage, renderNeutralImage } from "@/lib/magazine/og-image-response";

export const runtime = "nodejs";

/**
 * GET /api/magazine/[brokerId]/[date]/image?format=story|card|og
 *
 * C-04 (M2-09, M2-25, S2-15, T1-20, T1-UX-5, T2-28b, T3-18, T3-55):
 *  - 정확한 날짜의 **발행본**만 렌더 (draft 렌더 금지). 본인 브로커·에디션 날짜 기준.
 *  - 가짜 브로커("JS 부동산"/010-0000-0000/"시장 온도: 관망") 폴백 삭제 → 없으면 중립 브랜드 이미지.
 *  - 크기 고정: story 1080×1920 · card 1080×1080 · og 1200×630.
 *  - Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brokerId: string; date: string }> },
) {
  const { brokerId, date } = await params;
  const { searchParams } = new URL(request.url);

  const format = parseImageFormat(searchParams.get("format"), "story");
  if (!format) {
    return renderNeutralImage("story", { status: 400, cacheControl: NO_STORE_CACHE_CONTROL });
  }

  // brokerId/date 는 URL 세그먼트 — 디코드된 값을 형식 검증한다 (`../`, `,`, `)` 등 차단).
  const check = validateImageParams(brokerId, date);
  if (!check.ok) {
    return renderNeutralImage(format, { status: 400, cacheControl: NO_STORE_CACHE_CONTROL });
  }

  return renderMagazineImage({ format, brokerId: check.brokerId, date: check.date });
}
