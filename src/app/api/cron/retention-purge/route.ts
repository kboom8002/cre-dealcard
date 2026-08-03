/**
 * POST /api/cron/retention-purge
 * 
 * §9 보유기간 만료 데이터 자동 파기 배치
 * - party: 마지막 활동 24개월 후
 * - buyer_condition: observed_at 24개월 후
 * - track_event: 12개월 후 집계 → 원본 파기
 * 
 * Vercel Cron에서 주 1회 실행 권장.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Cron 인증 확인
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const results: Record<string, number> = {};

    // 1. 보유기간 만료 Party 파기
    const { data: expiredParties } = await supabase
      .from('party')
      .select('id')
      .lt('retention_until', new Date().toISOString().slice(0, 10));

    if (expiredParties && expiredParties.length > 0) {
      const ids = expiredParties.map((p: any) => p.id);

      // buyer_condition은 ON DELETE CASCADE로 자동 삭제
      await supabase.from('party').delete().in('id', ids);

      // 감사 로그
      await supabase.from('track_event').insert(
        ids.map((id: string) => ({
          tenant_id: '00000000-0000-0000-0000-000000000000',
          deal_id: '00000000-0000-0000-0000-000000000000',
          kind: 'retention.purged',
          payload: { entityType: 'party', entityId: id, reason: 'retention_expired' },
        })),
      );

      results.partiesPurged = ids.length;
    }

    // 2. 24개월 초과 buyer_condition 파기 (party가 아직 유효해도 조건 자체 만료)
    const conditionCutoff = new Date(Date.now() - 24 * 30 * 86400000).toISOString();
    const { count: conditionsPurged } = await supabase
      .from('buyer_condition')
      .delete({ count: 'exact' })
      .lt('observed_at', conditionCutoff);

    results.conditionsPurged = conditionsPurged || 0;

    // 3. 12개월 초과 track_event 파기
    const eventCutoff = new Date(Date.now() - 12 * 30 * 86400000).toISOString();
    const { count: eventsPurged } = await supabase
      .from('track_event')
      .delete({ count: 'exact' })
      .lt('occurred_at', eventCutoff);

    results.eventsPurged = eventsPurged || 0;

    return NextResponse.json({
      ok: true,
      results,
      purgedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
