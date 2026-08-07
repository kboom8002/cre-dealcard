import { NextRequest, NextResponse } from "next/server";
import { expireStaleApprovals } from "@/domain/team/circle-matching-service";

export async function GET(req: NextRequest) {
  try {
    const expiredCount = await expireStaleApprovals();
    return NextResponse.json({ ok: true, expiredCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
