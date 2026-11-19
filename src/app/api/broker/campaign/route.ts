import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";

function deprecatedCampaignResponse() {
  return NextResponse.json(
    {
      ok: false,
      code: "DEPRECATED_ROUTE",
      error: "구형 캠페인 경로는 뉴스레터 워크스페이스로 통합되었습니다.",
      redirect: "/broker/w/newsletter",
    },
    { status: 410, headers: { "X-Robots-Tag": "noindex, nofollow" } },
  );
}

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  return deprecatedCampaignResponse();
}

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  return deprecatedCampaignResponse();
}
