/**
 * Property Network — G-S
 * Cross-building recommendation via buyer_overlap and comparable_to edges
 */
import { createClient } from '@supabase/supabase-js';

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface RelatedBuilding {
  buildingId:   string;
  areaSignal:   string;
  assetType:    string;
  priceBand:    string | null;
  sharedBuyers: number;
  topGrade:     string;
  relationTypes: string[];
  networkScore:  number;
}

/**
 * G-S: Find buildings related via buyer_overlap (2-hop graph)
 * Building A → Buyer → Building B
 */
export async function getRelatedBuildingsByBuyerOverlap(
  buildingId: string,
  limit = 5,
): Promise<RelatedBuilding[]> {
  const supabase = getClient();

  // Direct SQL via match_results (no pgvector needed)
  const { data } = await supabase
    .from('match_results')
    .select('buyer_intent_lite_id, grade')
    .eq('building_ssot_lite_id', buildingId)
    .in('grade', ['S', 'A', 'B']);

  if (!data?.length) return [];

  const buyerIds = [...new Set(data.map((r) => r.buyer_intent_lite_id))];

  // Find other buildings matched with same buyers
  const { data: otherMatches } = await supabase
    .from('match_results')
    .select(`
      building_ssot_lite_id,
      grade,
      building_ssot_lite!inner(id, area_signal, asset_type, price_band, is_active)
    `)
    .in('buyer_intent_lite_id', buyerIds)
    .neq('building_ssot_lite_id', buildingId)
    .in('grade', ['S', 'A', 'B'])
    .eq('building_ssot_lite.is_active', true);

  if (!otherMatches?.length) return [];

  // Aggregate by building
  const agg: Record<string, {
    building: { area_signal: string; asset_type: string; price_band: string | null };
    sharedBuyers: number;
    grades: string[];
  }> = {};

  for (const m of otherMatches) {
    const bid = m.building_ssot_lite_id;
    const b   = m.building_ssot_lite as unknown as { area_signal: string; asset_type: string; price_band: string | null };
    if (!agg[bid]) {
      agg[bid] = { building: b, sharedBuyers: 0, grades: [] };
    }
    agg[bid].sharedBuyers++;
    agg[bid].grades.push(m.grade);
  }

  const gradeScore: Record<string, number> = { S: 4, A: 3, B: 2, C: 1 };

  return Object.entries(agg)
    .map(([bid, info]) => {
      const topGrade = info.grades.sort((a, b) => gradeScore[b] - gradeScore[a])[0];
      const networkScore = info.sharedBuyers * 0.6 + gradeScore[topGrade] * 0.1;
      return {
        buildingId:    bid,
        areaSignal:    info.building.area_signal,
        assetType:     info.building.asset_type,
        priceBand:     info.building.price_band,
        sharedBuyers:  info.sharedBuyers,
        topGrade,
        relationTypes: ['buyer_overlap'],
        networkScore,
      };
    })
    .sort((a, b) => b.networkScore - a.networkScore)
    .slice(0, limit);
}

/**
 * G-S: Combined network recommendation (buyer_overlap + comparable_to)
 */
export async function getNetworkRecommendations(
  buildingId: string,
  limit = 5,
): Promise<RelatedBuilding[]> {
  const supabase = getClient();

  const [buyerOverlap, comparableEdges] = await Promise.all([
    getRelatedBuildingsByBuyerOverlap(buildingId, limit * 2),
    // comparable_to edges from knowledge_edges
    supabase
      .from('knowledge_edges')
      .select('to_id, weight, metadata')
      .eq('from_type', 'building')
      .eq('from_id', buildingId)
      .eq('edge_type', 'comparable_to')
      .order('weight', { ascending: false })
      .limit(limit),
  ]);

  // Merge results, dedup by buildingId
  const seen = new Set<string>();
  const results: RelatedBuilding[] = [];

  for (const b of buyerOverlap) {
    if (!seen.has(b.buildingId)) {
      seen.add(b.buildingId);
      results.push(b);
    }
  }

  // Fetch details for comparable edges not already in results
  const comparableIds = (comparableEdges.data ?? [])
    .map((e) => e.to_id)
    .filter((id) => !seen.has(id));

  if (comparableIds.length > 0) {
    const { data: compBuildings } = await supabase
      .from('building_ssot_lite')
      .select('id, area_signal, asset_type, price_band')
      .in('id', comparableIds)
      .eq('is_active', true);

    for (const b of compBuildings ?? []) {
      const edge = (comparableEdges.data ?? []).find((e) => e.to_id === b.id);
      results.push({
        buildingId:    b.id,
        areaSignal:    b.area_signal,
        assetType:     b.asset_type,
        priceBand:     b.price_band,
        sharedBuyers:  0,
        topGrade:      '-',
        relationTypes: ['comparable_to'],
        networkScore:  (edge?.weight ?? 0.3) * 5,
      });
      seen.add(b.id);
    }
  }

  return results
    .sort((a, b) => b.networkScore - a.networkScore)
    .slice(0, limit);
}
