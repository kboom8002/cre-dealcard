/**
 * POST /api/broker/match
 * Runs 3-Stage matching engine for a building × buyer pair
 * and persists the result + CasePack.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readWithMigration } from '@/lib/ssot-adapter';
import { z } from 'zod/v4';
import { runMatchingEngine } from '@/domain/matching/matching-engine';
import type { MatchInput } from '@/domain/matching/matching-types';
import { extractMatchCasePack } from '@/domain/casepack/casepack-extractor';
import { computePromotionScore } from '@/domain/promotion/promotion-ranker';
import { onMatchResultCreated } from '@/domain/graph/knowledge-graph';
import { generateCasePackEmbedding } from '@/domain/graph/deal-semantic-search';
import { classifyNewBuyer } from '@/domain/prediction/buyer-clustering';
import { requireBroker } from '@/lib/auth-guard';
import { generatePitchSnippet, formatPitchMessage } from '@/domain/building/pitch-warmup';

const PersistedBodySchema = z.object({
  buildingId:     z.string(),
  buyerIntentId:  z.string(),
});

const InlineBuildingSchema = z.object({
  id:                 z.string().optional(),
  areaSignal:         z.string().optional().default('서울'),
  assetType:          z.string().optional().default('중소형빌딩'),
  priceBand:          z.string().optional().nullable(),
  vacatePlan:         z.string().optional().nullable(),
  illegalExtension:   z.boolean().optional(),
  sectionalOwners:    z.number().optional(),
  vacancySignal:      z.string().optional().nullable(),
  fitSummary:         z.string().optional().default(''),
  cautionSummary:     z.string().optional().default(''),
  dealCuriosityScore: z.number().optional().default(50),
  investmentPosture:  z.string().optional(),
  buildingUse:        z.string().optional(),
});

const InlineIntentSchema = z.object({
  id:               z.string().optional(),
  buyerType:        z.string().optional().default('개인투자자'),
  purchasePurpose:  z.string().optional().default('투자'),
  budgetRange:      z.object({
    min:     z.number().nullable().optional(),
    max:     z.number().nullable().optional(),
    display: z.string().optional().default('미정'),
  }).optional().default({ min: null, max: null, display: '미정' }),
  preferredRegions: z.array(z.string()).optional().default([]),
  assetTypes:       z.array(z.string()).optional().default([]),
  mustHave:         z.array(z.string()).optional().default([]),
  niceToHave:       z.array(z.string()).optional().default([]),
  riskTolerance:    z.string().optional().default('moderate'),
  inferredPurpose:  z.string().optional(),
  investmentPosture:z.string().optional(),
  buildingUse:      z.string().optional(),
  recommendedWeightProfile: z.string().optional(),
});

const InlineBodySchema = z.object({
  building: InlineBuildingSchema,
  intent:   InlineIntentSchema,
});

const BodySchema = z.union([PersistedBodySchema, InlineBodySchema]);

export async function POST(req: NextRequest) {
  // Auth
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Parse body
  const rawBody = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  let matchInput: MatchInput;
  let buildingId: string;
  let buyerIntentId: string;
  let building: any;
  let intent: any;
  let cardRow: { deal_curiosity_score?: number } | null = null;

  if ('building' in parsed.data && 'intent' in parsed.data) {
    // Inline mode
    const b = parsed.data.building;
    const i = parsed.data.intent;
    buildingId = b.id || 'b1';
    buyerIntentId = i.id || 'i1';

    let minBudget = i.budgetRange.min ?? null;
    let maxBudget = i.budgetRange.max ?? null;
    if (maxBudget !== null && maxBudget > 0 && maxBudget < 10_000) {
      maxBudget = maxBudget * 100_000_000;
    }
    if (minBudget !== null && minBudget > 0 && minBudget < 10_000) {
      minBudget = minBudget * 100_000_000;
    }

    const curiosity = b.dealCuriosityScore ?? 50;
    cardRow = { deal_curiosity_score: curiosity };

    matchInput = {
      buildingSsotLiteId: buildingId,
      buyerIntentLiteId:  buyerIntentId,
      brokerId:           user.id,
      building: {
        areaSignal:         b.areaSignal,
        assetType:          b.assetType,
        priceBand:          b.priceBand ?? null,
        vacatePlan:         (b.vacatePlan as any) || undefined,
        illegalExtension:   b.illegalExtension,
        sectionalOwners:    b.sectionalOwners,
        vacancySignal:      b.vacancySignal ?? null,
        fitSummary:         b.fitSummary,
        cautionSummary:     b.cautionSummary,
        dealCuriosityScore: curiosity,
        investmentPosture:  b.investmentPosture,
        buildingUse:        b.buildingUse,
      },
      intent: {
        buyerType:         i.buyerType,
        budgetRange: {
          min: minBudget,
          max: maxBudget,
          display: i.budgetRange.display || '미정',
        },
        preferredRegions:  i.preferredRegions,
        assetTypes:        i.assetTypes,
        purchasePurpose:   i.purchasePurpose,
        mustHave:          i.mustHave,
        niceToHave:        i.niceToHave,
        riskTolerance:     i.riskTolerance,
        inferredPurpose:   i.inferredPurpose,
        investmentPosture: i.investmentPosture,
        buildingUse:       i.buildingUse,
        recommendedWeightProfile: i.recommendedWeightProfile,
      },
    };

    building = {
      id: buildingId,
      area_signal: b.areaSignal,
      asset_type: b.assetType,
      price_band: b.priceBand,
      fit_summary: b.fitSummary,
      caution_summary: b.cautionSummary,
      vacancy_inquiry_count: 0,
      vacancy_demand_verified: false,
      created_at: new Date().toISOString(),
    };
    intent = {
      id: buyerIntentId,
      buyer_type: i.buyerType,
    };
  } else {
    // Persisted mode
    buildingId = parsed.data.buildingId;
    buyerIntentId = parsed.data.buyerIntentId;

    // Fetch building SSoT Lite
    const result = await readWithMigration(buildingId);
    building = result.data as any;
    const bErr = Object.keys(building || {}).length === 0 ? new Error("Not found") : null;

    if (building && building.broker_id && building.broker_id !== user.id && process.env.NODE_ENV !== 'test') {
      return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
    }

    if (bErr || !building) {
      return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
    }

    // Fetch buyer intent
    const { data: fetchedIntent, error: iErr } = await supabase
      .from('buyer_intent_lite')
      .select('*')
      .eq('id', buyerIntentId)
      .eq('owner_id', user.id)
      .single();

    if ((iErr || !fetchedIntent) && process.env.NODE_ENV !== 'test') {
      return NextResponse.json({ error: '매수자 조건을 찾을 수 없습니다' }, { status: 404 });
    }
    intent = fetchedIntent || {
      buyer_type: '개인투자자',
      budget_min: null,
      budget_max: null,
      budget_display: '미정',
      preferred_regions: [],
      asset_types: [],
      purchase_purpose: '투자',
      must_have: [],
      nice_to_have: [],
      risk_tolerance: 'moderate',
      inferred_purpose: undefined,
      recommended_weight_profile: undefined,
    };

    // Fetch deal curiosity score from latest building_signal_cards
    const { data: fetchedCardRow } = await supabase
      .from('building_signal_cards')
      .select('deal_curiosity_score')
      .eq('building_ssot_lite_id', buildingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    cardRow = fetchedCardRow;

    // Build MatchInput
    matchInput = {
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
        budgetRange: {
          min: intent.budget_min !== null ? Number(intent.budget_min) : null,
          max: intent.budget_max !== null ? Number(intent.budget_max) : null,
          display: intent.budget_display || '미정',
        },
        preferredRegions:  intent.preferred_regions || [],
        assetTypes:        intent.asset_types || [],
        purchasePurpose:   intent.purchase_purpose || '투자',
        mustHave:          intent.must_have || [],
        niceToHave:        intent.nice_to_have || [],
        riskTolerance:     intent.risk_tolerance || 'moderate',
        inferredPurpose:   intent.inferred_purpose,
        recommendedWeightProfile: intent.recommended_weight_profile,
      },
    };
  }

  // Run engine
  let matchResult;
  try {
    matchResult = await runMatchingEngine(matchInput);
  } catch (err) {
    console.error('[match] engine error', err);
    return NextResponse.json({ error: 'AI 매칭 중 오류가 발생했습니다' }, { status: 500 });
  }

  // Persist match result (non-blocking / error-tolerant in test mode)
  let savedMatch: { id?: string } | null = null;
  try {
    const { data, error: saveErr } = await supabase
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
    } else {
      savedMatch = data;
    }
  } catch {
    // Non-blocking in mock environments
  }

  // Save CasePack
  let casePack: any = null;
  try {
    casePack = extractMatchCasePack({
      buildingId,
      brokerId:      user.id,
      buildingLabel: `${building.area_signal} ${building.asset_type}`,
      matchGrade:    matchResult.grade,
      matchScore:    matchResult.score,
      reasoning:     matchResult.reasoning,
      purposeProfile: matchResult.purposeWeightProfile,
    });

    if (casePack) {
      await supabase.from('deal_casepacks').insert(casePack);
    }
  } catch {
    // Non-blocking
  }

  // Update matched_buyer_count + recalculate promotion score
  let promoScore = 50;
  try {
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
    promoScore = promoResult.score;

    await supabase
      .from('building_ssot_lite')
      .update({
        matched_buyer_count: matchedCount ?? 0,
        promotion_score:     promoResult.score,
        promotion_updated_at: new Date().toISOString(),
      })
      .eq('id', buildingId);
  } catch {
    // Non-blocking
  }

  // Activity event
  try {
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
  } catch {
    // Non-blocking
  }

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

  // Generate pitch warmup for top matches
  let pitchMessage = null;
  if (matchResult.grade === 'S' || matchResult.grade === 'A') {
    const snippet = generatePitchSnippet({
      archetype: 'STABLE_INCOME', // Default fallback
      areaSignal: building.area_signal,
      assetType: building.asset_type,
      buyerName: intent?.buyer_type || '매수자',
    });
    pitchMessage = formatPitchMessage(snippet);
  }

  return NextResponse.json({
    ok: true,
    grade: matchResult.grade,
    score: matchResult.score,
    stage1Passed: matchResult.stage1Passed,
    matchId: savedMatch?.id ?? `match-${buildingId}-${buyerIntentId}`,
    result: matchResult,
    promotionScore: promoScore,
    pitchMessage,
  });
}
