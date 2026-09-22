/**
 * POST /api/broker/prediction/cluster-buyers
 * Runs K-Means clustering on all buyer_intent_lite records
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runBuyerClustering } from '@/domain/prediction/buyer-clustering';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  try {
    let result: any = null;
    try {
      result = await runBuyerClustering();
    } catch (err) {
      console.error('[ClusterBuyers] runBuyerClustering failed:', err);
      return NextResponse.json(
        { ok: false, error: '매수자 클러스터링에 실패했습니다.' },
        { status: 500 }
      );
    }

    const clusters = result?.clusters;

    return NextResponse.json({ ok: true, result, clusters });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '클러스터링 실패';
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
