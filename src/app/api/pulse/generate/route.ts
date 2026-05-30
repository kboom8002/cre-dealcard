/**
 * /api/pulse/generate — 주간 CRE 펄스 생성 (admin/cron)
 *
 * POST: 전체 권역 주간 펄스 일괄 생성
 * GET:  펄스 목록 조회
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateAllWeeklyPulses } from "@/domain/pulse/pulse-generator";

export async function POST(req: NextRequest) {
  // 간단한 admin/cron 인증
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const results = await generateAllWeeklyPulses(supabase);

    return NextResponse.json({
      generated: results.length,
      pulses: results,
      message: `${results.length}개 권역 주간 펄스 생성 완료`,
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const region = searchParams.get("region");
  const periodType = searchParams.get("periodType") ?? "weekly";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const supabase = createServiceClient();

  let query = supabase
    .from("cre_pulses")
    .select("id, region, period_type, period_label, pulse_score, trend, summary_ko, key_findings, seo_slug, created_at")
    .eq("status", "published")
    .eq("period_type", periodType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (region) query = query.eq("region", region);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pulses: data ?? [] });
}

export const runtime = "nodejs";
