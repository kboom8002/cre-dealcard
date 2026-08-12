import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SCORE_DROP_THRESHOLD = 0.5;
const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export async function GET() {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const supabase = createServiceClient();

    // 이번 주 점수 조회 (최근 7일)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: thisWeekScores, error: twErr } = await supabase
      .from('im_fewshot_usage_log')
      .select('result_judge_score')
      .gte('created_at', oneWeekAgo)
      .not('result_judge_score', 'is', null);

    if (twErr) {
      console.error('[ai-quality-monitor] Failed to query this week scores:', twErr);
      return NextResponse.json({ ok: false, error: 'Database query failed' }, { status: 500 });
    }

    // 지난 주 점수 조회 (7~14일 전)
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: lastWeekScores, error: lwErr } = await supabase
      .from('im_fewshot_usage_log')
      .select('result_judge_score')
      .gte('created_at', twoWeeksAgo)
      .lt('created_at', oneWeekAgo)
      .not('result_judge_score', 'is', null);

    if (lwErr) {
      console.error('[ai-quality-monitor] Failed to query last week scores:', lwErr);
      return NextResponse.json({ ok: false, error: 'Database query failed' }, { status: 500 });
    }

    // 평균 점수 계산
    const calcAvg = (scores: Array<{ result_judge_score: number | null }>) => {
      const valid = scores.filter((s) => s.result_judge_score !== null);
      if (valid.length === 0) return null;
      return valid.reduce((sum, s) => sum + (s.result_judge_score ?? 0), 0) / valid.length;
    };

    const thisWeekAvg = calcAvg(thisWeekScores || []);
    const lastWeekAvg = calcAvg(lastWeekScores || []);

    const result = {
      thisWeek: { avg: thisWeekAvg, count: thisWeekScores?.length ?? 0 },
      lastWeek: { avg: lastWeekAvg, count: lastWeekScores?.length ?? 0 },
      scoreDrop: null as number | null,
      alert: false,
    };

    // 점수 하락 감지
    if (thisWeekAvg !== null && lastWeekAvg !== null) {
      const drop = lastWeekAvg - thisWeekAvg;
      result.scoreDrop = Math.round(drop * 100) / 100;

      if (drop >= SCORE_DROP_THRESHOLD) {
        result.alert = true;
        console.warn(
          `[ai-quality-monitor] ⚠️ AI Judge score dropped by ${drop.toFixed(2)} ` +
          `(${lastWeekAvg.toFixed(2)} → ${thisWeekAvg.toFixed(2)})`,
        );

        // Slack Webhook 알림
        if (WEBHOOK_URL) {
          try {
            await fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `🔴 *AI Judge 품질 경고*\n` +
                  `점수 하락: ${lastWeekAvg.toFixed(2)} → ${thisWeekAvg.toFixed(2)} (▼${drop.toFixed(2)})\n` +
                  `이번 주 샘플: ${thisWeekScores?.length ?? 0}건\n` +
                  `지난 주 샘플: ${lastWeekScores?.length ?? 0}건`,
              }),
            });
          } catch (webhookErr) {
            console.error('[ai-quality-monitor] Webhook notification failed:', webhookErr);
          }
        }
      }
    }

    console.info('[ai-quality-monitor] Check completed:', result);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    console.error('[ai-quality-monitor] Unexpected error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
