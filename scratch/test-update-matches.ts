import { createClient } from '@supabase/supabase-js';
import { runMatchingEngine } from './src/domain/matching/matching-engine';
import { extractMatchCasePack } from './src/domain/casepack/casepack-extractor';
import { computePromotionScore } from './src/domain/promotion/promotion-ranker';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const buildingId = '013762e5-3f22-4662-8365-8ab9b0122901';
const brokerId = 'f5365a14-bfe4-4f67-9b03-846d0163e5bc';

async function run() {
  console.log('Starting match update...');

  // 1. Delete existing match results and deal casepacks to prevent conflicts
  const { error: delMatchErr } = await supabase
    .from('match_results')
    .delete()
    .eq('building_ssot_lite_id', buildingId);
  if (delMatchErr) console.error('Error deleting match results:', delMatchErr);

  const { error: delCaseErr } = await supabase
    .from('deal_casepacks')
    .delete()
    .eq('building_id', buildingId);
  if (delCaseErr) console.error('Error deleting deal casepacks:', delCaseErr);

  // 2. Fetch building
  const { data: building, error: bErr } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', buildingId)
    .single();

  if (bErr || !building) {
    console.error('Building not found:', bErr);
    return;
  }

  // 3. Fetch curiosity score
  const { data: cardRow } = await supabase
    .from('building_signal_cards')
    .select('deal_curiosity_score')
    .eq('building_ssot_lite_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const dealCuriosityScore = cardRow?.deal_curiosity_score ?? 50;

  // 4. Fetch all intents
  const { data: intents, error: iErr } = await supabase
    .from('buyer_intent_lite')
    .select('*');

  if (iErr || !intents) {
    console.error('Error fetching intents:', iErr);
    return;
  }

  console.log(`Found ${intents.length} intents. Running matching...`);

  // 5. Run matching for each intent
  for (const intent of intents) {
    console.log(`Matching building with buyer ${intent.buyer_type} (${intent.id})...`);

    const matchInput = {
      buildingSsotLiteId: buildingId,
      buyerIntentLiteId: intent.id,
      brokerId: intent.owner_id || brokerId,
      building: {
        areaSignal: building.area_signal,
        assetType: building.asset_type,
        priceBand: building.price_band,
        vacancySignal: building.vacancy_signal,
        fitSummary: building.fit_summary,
        cautionSummary: building.caution_summary,
        dealCuriosityScore,
      },
      intent: {
        buyerType: intent.buyer_type,
        budgetRange: {
          min: intent.budget_min,
          max: intent.budget_max,
          display: intent.budget_display,
        },
        preferredRegions: intent.preferred_regions,
        assetTypes: intent.asset_types,
        purchasePurpose: intent.purchase_purpose,
        mustHave: intent.must_have,
        niceToHave: intent.nice_to_have,
        riskTolerance: intent.risk_tolerance,
        inferredPurpose: intent.normalized?.inferred_purpose || 'unknown',
        recommendedWeightProfile: intent.normalized?.recommended_weight_profile || 'default',
      },
    };

    try {
      const matchResult = await runMatchingEngine(matchInput);
      console.log(`-> Result: Grade ${matchResult.grade}, Score ${matchResult.score}`);

      // Insert
      const { data: savedMatch, error: saveErr } = await supabase
        .from('match_results')
        .insert({
          building_ssot_lite_id: buildingId,
          buyer_intent_lite_id: intent.id,
          broker_id: brokerId,
          grade: matchResult.grade,
          score: matchResult.score,
          stage1_passed: matchResult.stage1Passed,
          stage2_similarity: matchResult.stage2Similarity,
          stage3_score: matchResult.stage3Score,
          reasoning: matchResult.reasoning,
          purpose_weight_profile: matchResult.purposeWeightProfile,
        })
        .select('id')
        .single();

      if (saveErr) {
        console.error('Error saving match result:', saveErr);
        continue;
      }

      if (savedMatch) {
        const casePack = extractMatchCasePack({
          buildingId,
          brokerId,
          buildingLabel: `${building.area_signal} ${building.asset_type}`,
          matchGrade: matchResult.grade,
          matchScore: matchResult.score,
          reasoning: matchResult.reasoning,
          purposeProfile: matchResult.purposeWeightProfile,
        });
        const { error: cpErr } = await supabase.from('deal_casepacks').insert(casePack);
        if (cpErr) console.error('Error inserting casepack:', cpErr);
      }
    } catch (e) {
      console.error('Error matching intent:', e);
    }
  }

  // 6. Update matched_buyer_count
  const { count: matchedCount } = await supabase
    .from('match_results')
    .select('id', { count: 'exact', head: true })
    .eq('building_ssot_lite_id', buildingId)
    .in('grade', ['S', 'A']);

  const promoResult = computePromotionScore({
    dealCuriosityScore,
    matchedBuyerCount: matchedCount ?? 0,
    inquiryCount: building.vacancy_inquiry_count ?? 0,
    vacancyDemandVerified: building.vacancy_demand_verified ?? false,
    createdAt: building.created_at,
  });

  const { error: bUpdateErr } = await supabase
    .from('building_ssot_lite')
    .update({
      matched_buyer_count: matchedCount ?? 0,
      promotion_score: promoResult.score,
      promotion_updated_at: new Date().toISOString(),
    })
    .eq('id', buildingId);

  if (bUpdateErr) console.error('Error updating building:', bUpdateErr);
  else console.log(`Building updated. Matched buyers count: ${matchedCount}, Promotion score: ${promoResult.score}`);

  console.log('Match update complete!');
}

run();
