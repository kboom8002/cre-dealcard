/**
 * Knowledge Graph Service — G-X
 * Manages knowledge_edges table:
 * - Auto-creates edges from existing table events
 * - Graph traversal queries (2-hop recommendations)
 * - comparable_to batch computation
 */
import { createServiceClient } from '@/lib/supabase/service';

// ─── Edge Creation ─────────────────────────────────────────────────────

export async function createEdge(params: {
  fromType: string;
  fromId:   string;
  toType:   string;
  toId:     string;
  edgeType: string;
  weight?:  number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('knowledge_edges')
    .upsert(
      {
        from_type:  params.fromType,
        from_id:    params.fromId,
        to_type:    params.toType,
        to_id:      params.toId,
        edge_type:  params.edgeType,
        weight:     params.weight ?? 0.5,
        metadata:   params.metadata ?? {},
      },
      { onConflict: 'from_type,from_id,to_type,to_id,edge_type', ignoreDuplicates: false },
    );
}

// ─── Match Result → matched_with edge ─────────────────────────────────

export async function onMatchResultCreated(params: {
  buildingId:    string;
  buyerIntentId: string;
  matchGrade:    string;
  matchScore:    number;
}): Promise<void> {
  const gradeWeight: Record<string, number> = { S: 1.0, A: 0.8, B: 0.5, C: 0.2 };
  const weight = gradeWeight[params.matchGrade] ?? 0.5;

  // Building ↔ Buyer (bidirectional)
  await Promise.all([
    createEdge({
      fromType: 'building', fromId: params.buildingId,
      toType:   'buyer',   toId:   params.buyerIntentId,
      edgeType: 'matched_with', weight,
      metadata: { grade: params.matchGrade, score: params.matchScore },
    }),
    createEdge({
      fromType: 'buyer',    fromId: params.buyerIntentId,
      toType:   'building', toId:   params.buildingId,
      edgeType: 'matched_with', weight,
      metadata: { grade: params.matchGrade, score: params.matchScore },
    }),
  ]);
}

// ─── Pipeline → has_deal edge ──────────────────────────────────────────

export async function onPipelineCreated(params: {
  buildingId: string;
  dealId:     string;
  stage:      string;
}): Promise<void> {
  await createEdge({
    fromType: 'building', fromId: params.buildingId,
    toType:   'deal',     toId:   params.dealId,
    edgeType: 'has_deal',
    metadata: { stage: params.stage },
  });
}

// ─── Gate Request → viewed edge ────────────────────────────────────────

export async function onGateRequestCreated(params: {
  buildingId: string;
  buyerId:    string;
  gateLevel:  string;
}): Promise<void> {
  await createEdge({
    fromType: 'buyer',    fromId: params.buyerId,
    toType:   'building', toId:   params.buildingId,
    edgeType: 'viewed', weight: 0.3,
    metadata: { gate_level: params.gateLevel },
  });
}

// ─── comparable_to batch (same district + asset type) ──────────────────

export async function buildComparableEdges(brokerId: string): Promise<number> {
  const supabase = createServiceClient();

  const { data: buildings } = await supabase
    .from('building_ssot_lite')
    .select('id, area_signal, asset_type, price_band')
    .eq('broker_id', brokerId)
    .eq('is_active', true);

  if (!buildings?.length) return 0;

  let edgeCount = 0;
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const a = buildings[i];
      const b = buildings[j];

      // Same district (first 3 chars of area_signal)
      const sameDistrict = a.area_signal.slice(0, 3) === b.area_signal.slice(0, 3);
      const sameAsset    = a.asset_type === b.asset_type;

      if (sameDistrict || sameAsset) {
        const weight = (sameDistrict ? 0.4 : 0) + (sameAsset ? 0.3 : 0);
        await Promise.all([
          createEdge({ fromType: 'building', fromId: a.id, toType: 'building', toId: b.id,
            edgeType: 'comparable_to', weight,
            metadata: { same_district: sameDistrict, same_asset: sameAsset } }),
          createEdge({ fromType: 'building', fromId: b.id, toType: 'building', toId: a.id,
            edgeType: 'comparable_to', weight,
            metadata: { same_district: sameDistrict, same_asset: sameAsset } }),
        ]);
        edgeCount += 2;
      }
    }
  }
  return edgeCount;
}

// ─── G-S: buyer_overlap recommendation ────────────────────────────────

export async function getRelatedBuildings(
  buildingId: string,
  limit = 5,
): Promise<Array<{ buildingId: string; sharedBuyers: number; topGrade: string }>> {
  const supabase = createServiceClient();

  // 2-hop: building → buyer → other_building
  const { data: rows } = await supabase.rpc('get_related_buildings', {
    p_building_id: buildingId,
    p_limit:       limit,
  });

  return rows ?? [];
}

// ─── Graph stats ────────────────────────────────────────────────────────

export async function getGraphStats(brokerId: string): Promise<{
  nodeCount: number;
  edgeCount: number;
  edgesByType: Record<string, number>;
}> {
  const supabase = createServiceClient();

  const { data: edges } = await supabase
    .from('knowledge_edges')
    .select('edge_type')
    .or(`from_id.in.(select id from building_ssot_lite where broker_id = '${brokerId}'),to_id.in.(select id from building_ssot_lite where broker_id = '${brokerId}')`);

  const edgesByType: Record<string, number> = {};
  for (const e of edges ?? []) {
    edgesByType[e.edge_type] = (edgesByType[e.edge_type] ?? 0) + 1;
  }

  return {
    nodeCount: 0, // approximate
    edgeCount: edges?.length ?? 0,
    edgesByType,
  };
}
