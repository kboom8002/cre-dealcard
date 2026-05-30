/**
 * GET /api/public/market-report/[region]
 *
 * 특정 지역의 시장 리포트를 공개 반환합니다.
 * Auth: None (public endpoint).
 */
import { toApiError } from "@/lib/api-error";
import { generateMarketReport } from "@/domain/market-report/market-report-generator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ region: string }> },
) {
  try {
    const { region } = await params;
    const decoded = decodeURIComponent(region);

    if (!decoded || decoded.length > 100) {
      return Response.json(
        {
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "유효하지 않은 지역명입니다." },
        },
        { status: 400 },
      );
    }

    const report = await generateMarketReport(decoded);

    return Response.json({
      ok: true,
      data: report,
    });
  } catch (error) {
    console.error("Market Report Route Error:", error);
    return toApiError(error);
  }
}
