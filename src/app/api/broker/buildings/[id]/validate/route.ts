/**
 * POST /api/broker/buildings/[id]/validate
 *
 * Building-scoped validation route.
 * Ensures canGenerate returns false if asking_price is missing when posture is income.
 */
import { NextRequest, NextResponse } from "next/server";
import { POST as postValidate } from "@/app/api/im/validate/route";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body", canGenerate: false }, { status: 400 });
  }

  const posture = body.investment_posture || "income";
  const askingPrice = body.asking_price_manwon || body.askingPrice;

  // Income posture strictly requires asking price
  if (posture === "income" && (!askingPrice || Number(askingPrice) <= 0)) {
    return NextResponse.json({
      canGenerate: false,
      errors: ["매각 희망가를 입력해 주세요."],
      warnings: [],
      grade: body.grade || "D",
      missingItems: ["매각 희망가"],
    });
  }

  // Forward to standard IM validate
  const forwardedReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, building_id: id }),
  });

  return postValidate(forwardedReq);
}
