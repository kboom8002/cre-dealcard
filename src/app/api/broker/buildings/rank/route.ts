/**
 * GET /api/broker/buildings/rank
 * Returns broker's buildings sorted by promotion_score DESC
 * with match counts, pipeline stage, and vacancy status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promotionScoreLabel } from '@/domain/promotion/promotion-ranker';
import { requireBroker } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Auth
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch ranked buildings with related data
  const { data: buildings, error } = await supabase
    .from('building_ssot_lite')
    .select(`
      id,
      area_signal,
      asset_type,
      price_band,
      vacancy_signal,
      promotion_score,
      matched_buyer_count,
      vacancy_inquiry_count,
      vacancy_avg_fit_score,
      vacancy_demand_verified,
      promotion_updated_at,
      created_at,
      deal_pipeline_states (
        stage,
        entered_at
      )
    `)
    .eq('broker_id', user!.id)
    .eq('is_active', true)
    .order('promotion_score', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (buildings ?? []).map((b) => {
    const pipeline = Array.isArray(b.deal_pipeline_states)
      ? b.deal_pipeline_states[0] ?? null
      : null;

    const holdDays = pipeline
      ? Math.floor((Date.now() - new Date(pipeline.entered_at).getTime()) / 86_400_000)
      : 0;

    return {
      id:                  b.id,
      areaSignal:          b.area_signal,
      assetType:           b.asset_type,
      priceBand:           b.price_band,
      vacancySignal:       b.vacancy_signal,
      promotionScore:      b.promotion_score,
      promotionLabel:      promotionScoreLabel(b.promotion_score ?? 0),
      matchedBuyerCount:   b.matched_buyer_count ?? 0,
      vacancyInquiryCount: b.vacancy_inquiry_count ?? 0,
      vacancyAvgFitScore:  b.vacancy_avg_fit_score,
      vacancyDemandVerified: b.vacancy_demand_verified ?? false,
      currentStage:        pipeline?.stage ?? null,
      holdDays,
      holdAlert:           holdDays >= 14,
    };
  });

  return NextResponse.json({ ok: true, buildings: enriched });
}
