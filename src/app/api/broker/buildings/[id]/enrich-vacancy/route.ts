/**
 * POST /api/broker/buildings/[id]/enrich-vacancy
 * Triggers vacancy signal enrichment from cre-aipage data
 * Updates promotion_score, vacancy_inquiry_count, vacancy_demand_verified
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
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

  // P0-SEC SEC-2: 소유권은 building_ssot_lite.owner_id 직접 판정.
  // (이전: readWithMigration 결과의 존재하지 않는 broker_id 로 비교 → 항상 통과하는 fail-open)
  const buildingId = (await params).id;
  const ownership = await assertBuildingOwner<Record<string, any>>(supabase, buildingId, user!.id, {
    allowAdmin: true,
    role: guard.role,
    select: '*',
  });
  if (!ownership.ok) return ownership.response;
  const building = ownership.row as any;

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
