/**
 * Vacancy Signal Enricher — Phase 3 ⑦
 * Reads leasing_inquiries + tenant_fit_results from the shared Supabase
 * and updates building_ssot_lite promotion columns.
 *
 * Uses same Supabase project (unified schema via 00007_aipage_schema_merge).
 */
import { createServiceClient } from '@/lib/supabase/service';

export interface VacancyEnrichResult {
  buildingId: string;
  inquiryCount: number;
  avgFitScore: number | null;
  demandVerified: boolean;
  promotionDelta: number; // how much promotion_score changed
}

/**
 * For a given building_ssot_lite, find related spaces via space_ai_handoffs,
 * then aggregate leasing_inquiries + tenant_fit_results.
 */
export async function enrichFromVacancyData(
  buildingId: string,
): Promise<VacancyEnrichResult> {
  const supabase = createServiceClient();

  // 1. Find space_ai_handoff for this building
  const { data: handoffs } = await supabase
    .from('space_ai_handoffs')
    .select('id, space_drafts')
    .eq('building_ssot_lite_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(1);

  let inquiryCount = 0;
  let avgFitScore: number | null = null;

  if (handoffs && handoffs.length > 0) {
    const drafts = handoffs[0].space_drafts as Array<{ space_id?: string }> | null;
    const spaceIds = (drafts ?? []).map((d) => d.space_id).filter(Boolean) as string[];

    if (spaceIds.length > 0) {
      // 2. Count leasing inquiries
      const { count: iqCount } = await supabase
        .from('leasing_inquiries')
        .select('id', { count: 'exact', head: true })
        .in('space_id', spaceIds);

      inquiryCount = iqCount ?? 0;

      // 3. Average tenant fit score
      const { data: fitRows } = await supabase
        .from('tenant_fit_results')
        .select('fit_score')
        .in('space_id', spaceIds)
        .not('fit_score', 'is', null);

      if (fitRows && fitRows.length > 0) {
        const scores = fitRows.map((r) => r.fit_score as number);
        avgFitScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        avgFitScore = Math.round(avgFitScore * 100) / 100;
      }
    }
  }

  const { data: building } = await supabase
    .from('building_ssot_lite')
    .select('iot_daily_footfall, iot_avg_dwell_minutes')
    .eq('id', buildingId)
    .single();

  const iotFootfall = building?.iot_daily_footfall as number | null;
  const iotDwell = building?.iot_avg_dwell_minutes as number | null;

  const demandVerified = 
    (inquiryCount >= 2 && (avgFitScore ?? 0) >= 65) ||
    (!!iotFootfall && iotFootfall >= 200 && (iotDwell ?? 0) >= 5);

  // 4. Update building_ssot_lite
  await supabase
    .from('building_ssot_lite')
    .update({
      vacancy_inquiry_count: inquiryCount,
      vacancy_avg_fit_score: avgFitScore,
      vacancy_demand_verified: demandVerified,
      promotion_updated_at: new Date().toISOString(),
    })
    .eq('id', buildingId);

  return {
    buildingId,
    inquiryCount,
    avgFitScore,
    demandVerified,
    promotionDelta: 0, // computed when promotion score is recalculated
  };
}

/**
 * Batch enrichment for all active buildings of a broker
 */
export async function batchEnrichBrokerBuildings(
  brokerId: string,
): Promise<VacancyEnrichResult[]> {
  const supabase = createServiceClient();

  const { data: buildings } = await supabase
    .from('building_ssot_lite')
    .select('id')
    .eq('broker_id', brokerId)
    .eq('is_active', true);

  if (!buildings?.length) return [];

  const results = await Promise.allSettled(
    buildings.map((b) => enrichFromVacancyData(b.id)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<VacancyEnrichResult> => r.status === 'fulfilled')
    .map((r) => r.value);
}
