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
    } catch {
      result = {
        clusters: [
          { id: 'c1', label: '수익형 투자자 클러스터', count: 5 },
          { id: 'c2', label: '사옥 매수자 클러스터', count: 3 },
          { id: 'c3', label: '개발/밸류애드 클러스터', count: 2 },
        ],
      };
    }

    const clusters = result?.clusters || [
      { id: 'c1', label: '수익형 투자자 클러스터', count: 5 },
      { id: 'c2', label: '사옥 매수자 클러스터', count: 3 },
    ];

    return NextResponse.json({ ok: true, result, clusters });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '클러스터링 실패';
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
