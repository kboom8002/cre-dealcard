import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  NO_STORE_CACHE_CONTROL,
  parseImageFormat,
  validateImageParams,
} from "@/lib/magazine/og-image-data";
import { renderMagazineImage, renderNeutralImage } from "@/lib/magazine/og-image-response";
import { findLatestIssueDate, resolvePublicBroker } from "@/lib/magazine/public-page-data";

export const runtime = "nodejs";

/**
 * GET /api/og/magazine?brokerId=<slug|uuid>&date=YYYY-MM-DD[&format=og|story|card]
 *
 * C-04 (M2-09, M2-25, S2-15, S2-24, T3-18):
 *  - 내부 HTTP 자기호출(`/api/magazine/{brokerId}`) 제거 → 크롤러 요청이 LLM 생성·DB 쓰기를 유발하지 않는다.
 *  - 정확한 날짜의 발행본만 사용. 없거나 조회 실패 시 가짜 브로커 대신 중립 브랜드 이미지.
 *  - brokerId/date/format 검증, 잘못된 값은 400 + 중립 이미지(no-store).
 *  - Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400 (1년 immutable 금지).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const format = parseImageFormat(searchParams.get("format"), "og");
  if (!format) {
    return renderNeutralImage("og", { status: 400, cacheControl: NO_STORE_CACHE_CONTROL });
  }

  const rawBrokerId = searchParams.get("brokerId") ?? searchParams.get("id");
  let rawDate = searchParams.get("date");

  if ((!rawDate || !rawDate.trim()) && rawBrokerId && rawBrokerId.trim()) {
    try {
      const supabase = createServiceClient();
      const broker = await resolvePublicBroker(supabase, rawBrokerId.trim(), "user_id, slug");
      if (broker) {
        const latest = await findLatestIssueDate(supabase, broker);
        if (latest) {
          rawDate = latest;
        }
      }
    } catch {
      // non-blocking fallback to default validateImageParams behavior
    }
  }

  const params = validateImageParams(rawBrokerId, rawDate);
  if (!params.ok) {
    return renderNeutralImage(format, { status: 400, cacheControl: NO_STORE_CACHE_CONTROL });
  }

  return renderMagazineImage({ format, brokerId: params.brokerId, date: params.date });
}
