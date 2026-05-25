/**
 * POST /api/broker/buildings/[id]/enrich-vacancy
 * Triggers vacancy signal enrichment from cre-aipage data
 * Updates promotion_score, vacancy_inquiry_count, vacancy_demand_verified
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enrichFromVacancyData } from '@/domain/matching/vacancy-signal-enricher';
import { computePromotionScore } from '@/domain/promotion/promotion-ranker';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Verify ownership
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('id, matched_buyer_count, created_at')
    .eq('id', (await params).id)
    .eq('broker_id', user!.id)
    .single();

  if (!building) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  // Enrich
  const enrichResult = await enrichFromVacancyData((await params).id);

  // Recalculate promotion score with fresh vacancy data
  const { data: cardRow } = await supabase
    .from('building_signal_cards')
    .select('deal_curiosity_score')
    .eq('building_id', (await params).id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const promoResult = computePromotionScore({
    dealCuriosityScore: cardRow?.deal_curiosity_score ?? 50,
    matchedBuyerCount: building.matched_buyer_count ?? 0,
    inquiryCount: enrichResult.inquiryCount,
    vacancyDemandVerified: enrichResult.demandVerified,
    createdAt: building.created_at,
  });

  await supabase
    .from('building_ssot_lite')
    .update({
      promotion_score: promoResult.score,
      promotion_updated_at: new Date().toISOString(),
    })
    .eq('id', (await params).id);

  return NextResponse.json({
    ok: true,
    inquiryCount: enrichResult.inquiryCount,
    avgFitScore: enrichResult.avgFitScore,
    demandVerified: enrichResult.demandVerified,
    newPromotionScore: promoResult.score,
  });
}
