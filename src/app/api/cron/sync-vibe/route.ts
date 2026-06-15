import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { aggregateBrokerStats } from "@/domain/broker-card/broker-stats-aggregator";
import { calculateVibeScores } from "@/domain/vibe/vibe-scorer";

export const maxDuration = 300; // 5 minutes max duration for cron job

/**
 * GET /api/cron/sync-vibe
 *
 * 매주 브로커의 딜카드 퀄리티, 매칭률, 활동량 등을 분석하여 바이브 스코어를 갱신합니다.
 * Vercel Cron에 의해 호출됩니다.
 */
export async function GET(request: Request) {
  // Authorization check (Vercel Cron Header)
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    // Note: In development, we can bypass this or provide the token manually
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServiceClient();
  const startTime = Date.now();
  let updatedCount = 0;
  let errorCount = 0;

  try {
    // 1. 모든 브로커 프로필 가져오기
    const { data: brokerProfiles, error: fetchErr } = await supabase
      .from("broker_profiles")
      .select("user_id, vibe_valence, vibe_trust");

    if (fetchErr || !brokerProfiles) {
      throw new Error(`Failed to fetch broker profiles: ${fetchErr?.message}`);
    }

    // 2. 각 브로커별로 스탯 집계 및 바이브 스코어 재계산
    for (const profile of brokerProfiles) {
      try {
        const stats = await aggregateBrokerStats(profile.user_id);
        const newScores = calculateVibeScores(stats);

        // 점수에 변동이 있을 경우에만 업데이트
        if (
          newScores.valence !== profile.vibe_valence ||
          newScores.trust !== profile.vibe_trust
        ) {
          const { error: updateErr } = await supabase
            .from("broker_profiles")
            .update({
              vibe_valence: newScores.valence,
              vibe_trust: newScores.trust,
              vibe_analyzed_at: new Date().toISOString(),
            })
            .eq("user_id", profile.user_id);

          if (updateErr) {
            console.error(`Failed to update vibe score for broker ${profile.user_id}:`, updateErr);
            errorCount++;
          } else {
            updatedCount++;
          }
        }
      } catch (err) {
        console.error(`Error processing broker ${profile.user_id}:`, err);
        errorCount++;
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Vibe scores synchronized successfully",
      stats: {
        totalBrokers: brokerProfiles.length,
        updatedCount,
        errorCount,
        latencyMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error("[sync-vibe] Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
