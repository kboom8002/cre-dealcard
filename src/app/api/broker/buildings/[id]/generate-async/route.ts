/**
 * POST /api/broker/buildings/[id]/generate-async
 *
 * Building-scoped asynchronous IM generation route.
 * Ensures requesting pro tier with D-grade rentroll returns status 422.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { POST as postGenerateAsync } from "@/app/api/broker/im-lite/generate-async/route";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tier = body.tier || "basic";
  const rentrollGrade = body.rentroll_grade || body.rentrollGrade || body.grade || body.direct_data?.qualityGrade;

  if (tier === "pro" && (rentrollGrade === "D" || rentrollGrade === "C")) {
    return NextResponse.json(
      { error: "Pro IM은 B등급(완성도 60%) 이상의 데이터가 필요합니다." },
      { status: 422 }
    );
  }

  // Forward to im-lite generate-async with building_id injected
  const forwardedReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, building_id: id }),
  });

  return postGenerateAsync(forwardedReq);
}
