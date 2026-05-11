/**
 * Deal Feature Extractor — P-X
 * Extracts 28 features from DB for deal conversion prediction.
 * Saves snapshot to deal_conversion_features for training.
 */
import { createClient } from '@supabase/supabase-js';

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface DealFeatureVector {
  // Identity
  buildingId: string;
  brokerId:   string;
  // Target (null = pending)
  converted:  boolean | null;
  // Features (28)
  curiosityScore:          number;
  hiddenFieldsCount:       number;
  bestMatchGrade:          number;
  avgMatchScore:           number;
  matchedBuyerCount:       number;
  sGradeCount:             number;
  currentStageOrd:         number;
  totalHoldDays:           number;
  avgStageVelocity:        number;
  promotionScore:          number;
  vacancyDemandVerified:   number;
  vacancyInquiryCount:     number;
  eventCount7d:            number;
  eventCount30d:           number;
  gateRequestCount:        number;
  buyerMemoCount:          number;
  casepacksCount:          number;
  warningTextLength:       number;
  missingDataCount:        number;
  daysSinceCreation:       number;
  hasIm:                   number;
  hasSpaceAi:              number;
  buyerClusterId:          number;
  // Context
  areaSignalEncoded:       number;
  assetTypeEncoded:        number;
  priceBandNumeric:        number;
  dayOfWeekCreated:        number;
  imReadinessScore:        number;
}

const STAGE_ORD: Record<string, number> = {
  memo_input: 0, deal_card_created: 1, gate_requested: 2,
  im_created: 3, buyer_meeting: 4, loi: 5, contract: 6,
  closed: 7, failed: 8,
};

const AREA_MAP: Record<string, number> = {
  '강남': 1, '서초': 2, '송파': 3, '용산': 4, '마포': 5,
  '성동': 6, '성수': 6, '합정': 5, '홍대': 5, '여의도': 7,
};

const ASSET_MAP: Record<string, number> = {
  '근린': 1, '사무': 2, '주상': 3, '업무': 2, '복합': 4,
};

function encodeArea(areaSignal: string): number {
  for (const [key, val] of Object.entries(AREA_MAP)) {
    if (areaSignal.includes(key)) return val;
  }
  return 0;
}

function encodeAsset(assetType: string): number {
  for (const [key, val] of Object.entries(ASSET_MAP)) {
    if (assetType.includes(key)) return val;
  }
  return 0;
}

function extractPriceNum(priceBand: string | null): number {
  if (!priceBand) return 0;
  const m = priceBand.match(/(\d+(?:\.\d+)?)\s*억/);
  return m ? parseFloat(m[1]) : 0;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

export async function extractDealFeatures(
  buildingId: string,
): Promise<DealFeatureVector | null> {
  const supabase = getClient();

  // Base building data
  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', buildingId)
    .single();
  if (!building) return null;

  // Match data
  const { data: matches } = await supabase
    .from('match_results')
    .select('grade, score')
    .eq('building_ssot_lite_id', buildingId);

  const gradeScore: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };
  const bestGrade  = matches?.length
    ? Math.max(...matches.map((m) => gradeScore[m.grade] ?? 0)) : 0;
  const avgScore   = matches?.length
    ? matches.reduce((s, m) => s + m.score, 0) / matches.length : 0;
  const sCount     = matches?.filter((m) => m.grade === 'S').length ?? 0;

  // Pipeline data
  const { data: pipeline } = await supabase
    .from('deal_pipeline_states')
    .select('stage, entered_at')
    .eq('building_ssot_lite_id', buildingId)
    .order('entered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const stageOrd    = STAGE_ORD[pipeline?.stage ?? 'memo_input'] ?? 0;
  const holdDays    = pipeline ? daysSince(pipeline.entered_at) : 0;

  // Activity events
  const { data: events7d } = await supabase
    .from('activity_events')
    .select('id', { count: 'exact', head: true })
    .eq('building_ssot_lite_id', buildingId)
    .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString());

  const { data: events30d } = await supabase
    .from('activity_events')
    .select('id', { count: 'exact', head: true })
    .eq('building_ssot_lite_id', buildingId)
    .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString());

  // Gate requests
  const { count: gateCount } = await supabase
    .from('gate_requests')
    .select('id', { count: 'exact', head: true })
    .eq('building_ssot_lite_id', buildingId);

  // CasePacks
  const { data: casepacks } = await supabase
    .from('deal_casepacks')
    .select('warning')
    .eq('building_ssot_lite_id', buildingId);

  const warningLen = casepacks?.reduce((s, cp) => s + (cp.warning?.length ?? 0), 0) ?? 0;

  // IM
  const { data: imHandoff } = await supabase
    .from('full_im_handoffs')
    .select('im_project_id')
    .eq('building_ssot_lite_id', buildingId)
    .limit(1)
    .maybeSingle();

  const { data: imProject } = imHandoff?.im_project_id
    ? await supabase.from('im_projects').select('readiness_score').eq('id', imHandoff.im_project_id).single()
    : { data: null };

  // Space AI
  const { data: spaceHandoff } = await supabase
    .from('space_ai_handoffs')
    .select('id')
    .eq('building_ssot_lite_id', buildingId)
    .limit(1)
    .maybeSingle();

  // Signal card (curiosity score)
  const { data: card } = await supabase
    .from('building_signal_cards')
    .select('deal_curiosity_score')
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Buyer cluster (from best match)
  const { data: topBuyerMatch } = await supabase
    .from('match_results')
    .select('buyer_intent_lite_id, grade')
    .eq('building_ssot_lite_id', buildingId)
    .eq('grade', 'S')
    .limit(1)
    .maybeSingle();

  let buyerClusterId = -1;
  if (topBuyerMatch) {
    const { data: bIntent } = await supabase
      .from('buyer_intent_lite')
      .select('cluster_id')
      .eq('id', topBuyerMatch.buyer_intent_lite_id)
      .maybeSingle();
    buyerClusterId = bIntent?.cluster_id ?? -1;
  }

  // Determine target
  const hasClosed = pipeline?.stage === 'closed';
  const hasFailed = pipeline?.stage === 'failed';
  const converted = hasClosed ? true : hasFailed ? false : null;

  return {
    buildingId,
    brokerId:               building.owner_id ?? building.broker_id,
    converted,
    curiosityScore:         card?.deal_curiosity_score ?? 50,
    hiddenFieldsCount:      (building.hidden_fields as string[] ?? []).length,
    bestMatchGrade:         bestGrade,
    avgMatchScore:          Math.round(avgScore * 100) / 100,
    matchedBuyerCount:      matches?.length ?? 0,
    sGradeCount:            sCount,
    currentStageOrd:        stageOrd,
    totalHoldDays:          holdDays,
    avgStageVelocity:       stageOrd > 0 ? daysSince(building.created_at) / stageOrd : 0,
    promotionScore:         building.promotion_score ?? 0,
    vacancyDemandVerified:  building.vacancy_demand_verified ? 1 : 0,
    vacancyInquiryCount:    building.vacancy_inquiry_count ?? 0,
    eventCount7d:           (events7d as unknown as { count?: number })?.count ?? 0,
    eventCount30d:          (events30d as unknown as { count?: number })?.count ?? 0,
    gateRequestCount:       gateCount ?? 0,
    buyerMemoCount:         0, // derived from activity_events if needed
    casepacksCount:         casepacks?.length ?? 0,
    warningTextLength:      warningLen,
    missingDataCount:       (building.missing_data as string[] ?? []).length,
    daysSinceCreation:      daysSince(building.created_at),
    hasIm:                  imHandoff ? 1 : 0,
    hasSpaceAi:             spaceHandoff ? 1 : 0,
    buyerClusterId,
    areaSignalEncoded:      encodeArea(building.area_signal),
    assetTypeEncoded:       encodeAsset(building.asset_type),
    priceBandNumeric:       extractPriceNum(building.price_band),
    dayOfWeekCreated:       new Date(building.created_at).getDay(),
    imReadinessScore:       (imProject as { readiness_score?: number } | null)?.readiness_score ?? 0,
  };
}

// ─── Save snapshot ─────────────────────────────────────────────────────

export async function snapshotDealFeatures(buildingId: string): Promise<void> {
  const features = await extractDealFeatures(buildingId);
  if (!features) return;

  const supabase = getClient();
  await supabase.from('deal_conversion_features').insert({
    building_ssot_lite_id:    features.buildingId,
    broker_id:                features.brokerId,
    converted:                features.converted,
    curiosity_score:          features.curiosityScore,
    hidden_fields_count:      features.hiddenFieldsCount,
    best_match_grade:         features.bestMatchGrade,
    avg_match_score:          features.avgMatchScore,
    matched_buyer_count:      features.matchedBuyerCount,
    s_grade_count:            features.sGradeCount,
    current_stage_ord:        features.currentStageOrd,
    total_hold_days:          features.totalHoldDays,
    avg_stage_velocity:       features.avgStageVelocity,
    promotion_score:          features.promotionScore,
    vacancy_demand_verified:  features.vacancyDemandVerified === 1,
    vacancy_inquiry_count:    features.vacancyInquiryCount,
    event_count_7d:           features.eventCount7d,
    event_count_30d:          features.eventCount30d,
    gate_request_count:       features.gateRequestCount,
    buyer_memo_count:         features.buyerMemoCount,
    casepacks_count:          features.casepacksCount,
    missing_data_count:       features.missingDataCount,
    days_since_creation:      features.daysSinceCreation,
    has_im:                   features.hasIm === 1,
    has_space_ai:             features.hasSpaceAi === 1,
    buyer_cluster_id:         features.buyerClusterId,
    snapshot_at:              new Date().toISOString(),
  });
}
