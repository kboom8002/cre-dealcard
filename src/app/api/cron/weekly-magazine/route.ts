import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateWeeklyMagazine } from "@/domain/magazine/weekly-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/weekly-magazine
 * Vercel Cron: 매주 월요일 KST 07:00 (UTC 일요일 22:00) 자동 실행
 * 활성 구독 중인 모든 브로커에 대해 주간 매거진을 생성합니다.
 */
export async function GET(request: NextRequest) {
  // ── Vercel Cron 인증 ──
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const startedAt = Date.now();

  // ── 현재 주차 라벨 (W28-2026) ──
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear =
    Math.floor((now.getTime() - jan1.getTime()) / 86_400_000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  const editionLabel = `W${String(weekNum).padStart(2, "0")}-${now.getFullYear()}`;

  // ── 활성 구독 브로커 조회 ──
  const { data: brokers, error: brokersError } = await supabase
    .from("broker_profiles")
    .select("user_id, slug")
    .eq("subscription_active", true);

  if (brokersError) {
    console.error("[cron/weekly-magazine] 브로커 조회 실패:", brokersError.message);
    return NextResponse.json(
      { error: brokersError.message },
      { status: 500 },
    );
  }

  if (!brokers || brokers.length === 0) {
    return NextResponse.json({
      message: "활성 구독 브로커가 없습니다.",
      generated: 0,
      elapsed_ms: Date.now() - startedAt,
    });
  }

  // ── 브로커별 매거진 생성 ──
  const results: { broker_id: string; slug: string; success: boolean; error?: string }[] = [];

  for (const broker of brokers) {
    try {
      await generateWeeklyMagazine({
        supabase,
        brokerId: broker.user_id,
        editionType: "weekly",
        editionLabel,
      });
      results.push({ broker_id: broker.user_id, slug: broker.slug, success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      console.error(
        `[cron/weekly-magazine] 브로커 ${broker.slug} 실패:`,
        message,
      );
      results.push({
        broker_id: broker.user_id,
        slug: broker.slug,
        success: false,
        error: message,
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    message: `주간 매거진 생성 완료: ${succeeded}건 성공, ${failed}건 실패`,
    edition_label: editionLabel,
    generated: succeeded,
    failed,
    details: results,
    elapsed_ms: Date.now() - startedAt,
  });
}
