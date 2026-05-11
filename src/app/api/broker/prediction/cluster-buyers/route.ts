/**
 * POST /api/broker/prediction/cluster-buyers
 * Runs K-Means clustering on all buyer_intent_lite records
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runBuyerClustering } from '@/domain/prediction/buyer-clustering';

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const authHeader = req.headers.get('authorization') ?? '';
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await runBuyerClustering();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '클러스터링 실패';
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
