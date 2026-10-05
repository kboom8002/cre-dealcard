/**
 * POST|GET /api/cron/retention-purge
 * 
 * §9 보유기간 만료 데이터 자동 파기 배치
 * - party: 마지막 활동 24개월 후
 * - buyer_condition: observed_at 24개월 후
 * - track_event: 12개월 후 집계 → 원본 파기
 * - magazine (G-01/S2-18): 해지 후 30일 경과 구독자 PII 파기 + 365일 초과 분석 이벤트 삭제 (RPC)
 * 
 * Vercel Cron은 GET으로 호출한다(vercel.json에서 일 1회 등록). 수동 호출은 POST도 허용.
 * 두 방식 모두 CRON_SECRET(Bearer) 필수.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';

export const maxDuration = 60;

/** CRON_SECRET timing-safe 비교. secret이 없으면 항상 거부 */
function isCronAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(req.headers.get('authorization') ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

interface MagazinePurgeEntry {
  ok: boolean;
  /** RPC 반환값(건수 등) */
  result?: unknown;
  error?: string;
}

/**
 * 매거진 파기 RPC. 함수가 아직 없으면(마이그레이션 20261004000014 미적용) 성공으로 위장하지 않고 정직한 에러를 기록한다.
 * 한 RPC 실패가 다른 파기를 막지 않도록 개별 try/catch.
 */
async function purgeMagazine(supabase: ReturnType<typeof createServiceClient>): Promise<Record<string, MagazinePurgeEntry>> {
  const steps: Array<[string, string, Record<string, number>]> = [
    ['unsubscribed', 'magazine_purge_unsubscribed', { p_days: 30 }],
    ['oldEvents', 'magazine_purge_old_events', { p_days: 365 }],
  ];
  const out: Record<string, MagazinePurgeEntry> = {};
  for (const [key, fn, args] of steps) {
    try {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) {
        const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '');
        out[key] = {
          ok: false,
          error: missing ? `RPC ${fn} 없음 — 마이그레이션 20261004000014 미적용` : error.message,
        };
      } else {
        out[key] = { ok: true, result: data };
      }
    } catch (e) {
      out[key] = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  try {
    // Cron 인증 확인
    if (!isCronAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    const results: Record<string, number> = {};

    // 0. 매거진 PII·이벤트 파기 (실패해도 이후 기존 파기는 계속 진행하되 결과에 정직하게 노출)
    const magazine = await purgeMagazine(supabase);

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
      ok: Object.values(magazine).every((m) => m.ok),
      results,
      magazine,
      purgedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
