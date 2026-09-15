import { NextRequest, NextResponse } from "next/server";
import { expireStaleApprovals } from "@/domain/team/circle-matching-service";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const expiredCount = await expireStaleApprovals();
    return NextResponse.json({ ok: true, expiredCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
