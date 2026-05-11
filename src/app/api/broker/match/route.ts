/**
 * POST /api/broker/match
 * Runs 3-Stage matching engine for a building × buyer pair
 * and persists the result + CasePack.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { runMatchingEngine } from '@/domain/matching/matching-engine';
import type { MatchInput } from '@/domain/matching/matching-types';
import { extractMatchCasePack } from '@/domain/casepack/casepack-extractor';
import { computePromotionScore } from '@/domain/promotion/promotion-ranker';
import { onMatchResultCreated } from '@/domain/graph/knowledge-graph';
import { generateCasePackEmbedding } from '@/domain/graph/deal-semantic-search';
import { classifyNewBuyer } from '@/domain/prediction/buyer-clustering';

const BodySchema = z.object({
  buildingId:     z.string().uuid(),
  buyerIntentId:  z.string().uuid(),
});

export async function POST(req: NextRequest) {
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

  // Parse body
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { buildingId, buyerIntentId } = parsed.data;

  // Fetch building SSoT Lite
  const { data: building, error: bErr } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', buildingId)
    .eq('broker_id', user.id)
    .single();

  if (bErr || !building) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  // Fetch buyer intent
  const { data: intent, error: iErr } = await supabase
    .from('buyer_intent_lite')
    .select('*')
    .eq('id', buyerIntentId)
    .eq('broker_id', user.id)
    .single();

  if (iErr || !intent) {
    return NextResponse.json({ error: '매수자 조건을 찾을 수 없습니다' }, { status: 404 });
  }

  // Fetch deal curiosity score from latest building_signal_cards
  const { data: cardRow } = await supabase
    .from('building_signal_cards')
    .select('deal_curiosity_score')
    .eq('building_ssot_lite_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Build MatchInput
  const matchInput: MatchInput = {
    buildingSsotLiteId: buildingId,
    buyerIntentLiteId:  buyerIntentId,
    brokerId:           user.id,
    building: {
      areaSignal:         building.area_signal,
      assetType:          building.asset_type,
      priceBand:          building.price_band,
      vacancySignal:      building.vacancy_signal,
      fitSummary:         building.fit_summary,
      cautionSummary:     building.caution_summary,
      dealCuriosityScore: cardRow?.deal_curiosity_score ?? 50,
    },
    intent: {
      buyerType:         intent.buyer_type,
      budgetRange:       intent.budget_range,
      preferredRegions:  intent.preferred_regions,
      assetTypes:        intent.asset_types,
      purchasePurpose:   intent.purchase_purpose,
      mustHave:          intent.must_have,
      niceToHave:        intent.nice_to_have,
      riskTolerance:     intent.risk_tolerance,
      inferredPurpose:   intent.inferred_purpose,
      recommendedWeightProfile: intent.recommended_weight_profile,
    },
  };

  // Run engine
  let matchResult;
  try {
    matchResult = await runMatchingEngine(matchInput);
  } catch (err) {
    console.error('[match] engine error', err);
    return NextResponse.json({ error: 'AI 매칭 중 오류가 발생했습니다' }, { status: 500 });
  }

  // Persist match result
  const { data: savedMatch, error: saveErr } = await supabase
    .from('match_results')
    .insert({
      building_ssot_lite_id: buildingId,
      buyer_intent_lite_id:  buyerIntentId,
      broker_id:             user.id,
      grade:                 matchResult.grade,
      score:                 matchResult.score,
      stage1_passed:         matchResult.stage1Passed,
      stage2_similarity:     matchResult.stage2Similarity,
      stage3_score:          matchResult.stage3Score,
      reasoning:             matchResult.reasoning,
      purpose_weight_profile: matchResult.purposeWeightProfile,
    })
    .select('id')
    .single();

  if (saveErr) {
    console.error('[match] save error', saveErr);
  }

  // Save CasePack
  const casePack = extractMatchCasePack({
    buildingId,
    brokerId:      user.id,
    buildingLabel: `${building.area_signal} ${building.asset_type}`,
    matchGrade:    matchResult.grade,
    matchScore:    matchResult.score,
    reasoning:     matchResult.reasoning,
    purposeProfile: matchResult.purposeWeightProfile,
  });

  await supabase.from('deal_casepacks').insert(casePack);

  // Update matched_buyer_count + recalculate promotion score
  const { count: matchedCount } = await supabase
    .from('match_results')
    .select('id', { count: 'exact', head: true })
    .eq('building_ssot_lite_id', buildingId)
    .in('grade', ['S', 'A']);

  const promoResult = computePromotionScore({
    dealCuriosityScore: cardRow?.deal_curiosity_score ?? 50,
    matchedBuyerCount:  matchedCount ?? 0,
    inquiryCount:       building.vacancy_inquiry_count ?? 0,
    vacancyDemandVerified: building.vacancy_demand_verified ?? false,
    createdAt:          building.created_at,
  });

  await supabase
    .from('building_ssot_lite')
    .update({
      matched_buyer_count: matchedCount ?? 0,
      promotion_score:     promoResult.score,
      promotion_updated_at: new Date().toISOString(),
    })
    .eq('id', buildingId);

  // Activity event
  await supabase.from('activity_events').insert({
    building_ssot_lite_id: buildingId,
    broker_id:             user.id,
    event_type:            'match_computed',
    metadata: {
      match_id:   savedMatch?.id,
      grade:      matchResult.grade,
      score:      matchResult.score,
      buyer_intent_id: buyerIntentId,
    },
  });

  // G-X: Create knowledge graph edges (non-blocking)
  onMatchResultCreated({
    buildingId,
    buyerIntentId,
    matchGrade: matchResult.grade,
    matchScore: matchResult.score,
  }).catch((e) => console.warn('[graph] edge create failed', e));

  // G-D: Generate CasePack embedding (non-blocking)
  if (casePack) {
    const cp = casePack as unknown as { id: string };
    if (cp.id) {
      generateCasePackEmbedding(cp.id)
        .catch((e) => console.warn('[graph] casepack embed failed', e));
    }
  }

  // P-D2: Classify buyer into cluster (non-blocking)
  classifyNewBuyer(buyerIntentId)
    .catch((e) => console.warn('[cluster] classify failed', e));

  return NextResponse.json({
    ok: true,
    matchId: savedMatch?.id,
    result: matchResult,
    promotionScore: promoResult.score,
  });
}
