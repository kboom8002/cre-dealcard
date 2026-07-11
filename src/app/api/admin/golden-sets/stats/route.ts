/**
 * GET /api/admin/golden-sets/stats
 * 대시보드용 Golden Set + 용어 사전 + 퓨샷 품질 피드백 통합 통계 반환
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { analyzeFewShotEffectiveness } from '@/domain/building/mobile-im/fewshot-tracker';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const supabase = createServiceClient();

    // ─── 1. Golden Set 통계 ───
    const { count: totalCount, error: totalErr } = await supabase
      .from('im_golden_sets')
      .select('id', { count: 'exact', head: true });
    if (totalErr) throw totalErr;

    const { data: activeRecords, error: activeErr, count: activeCount } = await supabase
      .from('im_golden_sets')
      .select('section_type, source_type, judge_score, usage_count', { count: 'exact' })
      .eq('is_active', true);
    if (activeErr) throw activeErr;

    const records = activeRecords ?? [];

    const scores = records
      .map(r => r.judge_score as number | null)
      .filter((s): s is number => s !== null && s !== undefined);
    const avgJudgeScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : 0;

    const bySectionType: Record<string, number> = {};
    for (const r of records) {
      const key = (r.section_type as string) ?? 'unknown';
      bySectionType[key] = (bySectionType[key] ?? 0) + 1;
    }

    const bySourceType: Record<string, number> = {};
    for (const r of records) {
      const key = (r.source_type as string) ?? 'unknown';
      bySourceType[key] = (bySourceType[key] ?? 0) + 1;
    }

    const totalUsageCount = records.reduce(
      (sum, r) => sum + ((r.usage_count as number) ?? 0),
      0,
    );

    // ─── 2. 용어 사전 통계 ───
    const { count: termTotalCount } = await supabase
      .from('im_terminology_rules')
      .select('id', { count: 'exact', head: true });

    const { count: termActiveCount } = await supabase
      .from('im_terminology_rules')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    const { data: termTopRules } = await supabase
      .from('im_terminology_rules')
      .select('id, pattern, replacement, hit_count, category')
      .order('hit_count', { ascending: false })
      .limit(10);

    const termTotalHits = termTopRules ? termTopRules.reduce((sum, r) => sum + (r.hit_count || 0), 0) : 0;

    // ─── 3. 퓨샷 피드백 로그 통계 ───
    const { count: fewshotLogCount } = await supabase
      .from('im_fewshot_usage_log')
      .select('id', { count: 'exact', head: true });

    const { data: recentScores } = await supabase
      .from('im_fewshot_usage_log')
      .select('result_score')
      .not('result_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const scoresList = recentScores ? recentScores.map(s => Number(s.result_score)).filter(s => !isNaN(s)) : [];
    const avgFewShotResultScore = scoresList.length > 0
      ? Math.round((scoresList.reduce((a, b) => a + b, 0) / scoresList.length) * 10) / 10
      : 0;

    const fewShotEffectiveness = await analyzeFewShotEffectiveness();

    return NextResponse.json({
      ok: true,
      goldenStats: {
        totalCount: totalCount ?? 0,
        activeCount: activeCount ?? 0,
        avgJudgeScore,
        bySectionType,
        bySourceType,
        totalUsageCount,
      },
      terminologyStats: {
        totalRules: termTotalCount ?? 0,
        activeRules: termActiveCount ?? 0,
        totalHits: termTotalHits,
        topRules: termTopRules || [],
      },
      fewShotStats: {
        totalLogs: fewshotLogCount ?? 0,
        avgFewShotResultScore,
        effectiveness: fewShotEffectiveness,
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/admin/golden-sets/stats]', message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
