/**
 * POST /api/broker/buildings/[id]/disclosure
 * Updates Disclosure preferences, normalizes them, and recalculates completeness score
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeLayerScore } from '@/domain/building/layer-score-engine';
import { recordEvent } from '@/domain/analytics/record-event';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Verify ownership
  const { data: building, error: bErr } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .single();

  if (bErr || !building) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 });
  }

  const prefs = body.disclosurePrefs;
  if (!prefs || typeof prefs !== 'object') {
    return NextResponse.json({ error: 'disclosurePrefs 객체가 필요합니다' }, { status: 400 });
  }

  // Update building_ssot_lite with new prefs
  const updatedPrefs = {
    show_area_signal: !!prefs.show_area_signal,
    show_asset_type: !!prefs.show_asset_type,
    show_price_band: !!prefs.show_price_band,
    show_tenant_count: !!prefs.show_tenant_count,
    show_walt: !!prefs.show_walt,
    show_vacancy_rate: !!prefs.show_vacancy_rate,
    hide_exact_address: !!prefs.hide_exact_address,
    hide_tenant_names: !!prefs.hide_tenant_names,
    hide_unit_rent: !!prefs.hide_unit_rent,
  };

  // Re-fetch evidence files to compute completeness score
  const { data: files } = await supabase
    .from('evidence_files')
    .select('layer_category')
    .eq('building_id', id);

  const uploadedCategories = files?.map((f: any) => f.layer_category) || [];
  
  const rentRollChecked = uploadedCategories.includes('rent_roll') || 
    (building.lease_summary && Object.keys(building.lease_summary).length > 0 && Array.isArray((building.lease_summary as any).tenants) && (building.lease_summary as any).tenants.length > 0);
  const floorPlanChecked = uploadedCategories.includes('floor_plan') || !!building.floor_plan_url;
  const repairHistoryChecked = uploadedCategories.includes('repair_history') || 
    (building.repair_history && Object.keys(building.repair_history).length > 0);

  // Since we are setting disclosure preferences, disclosurePolicy is now checked!
  const checklist = {
    buildingRegister: uploadedCategories.includes('building_register'),
    registry: uploadedCategories.includes('registry_docs'),
    landUsePlan: uploadedCategories.includes('land_use_plan'),
    rentRoll: rentRollChecked,
    photos: uploadedCategories.includes('photos'),
    floorPlan: floorPlanChecked,
    repairHistory: repairHistoryChecked,
    vacancyStatus: uploadedCategories.includes('vacancy_docs'),
    askingPrice: !!building.price_band,
    disclosurePolicy: true, // we just updated it!
  };

  const computedScores = computeLayerScore(checklist);

  const { error: updateErr } = await supabase
    .from('building_ssot_lite')
    .update({
      disclosure_prefs: updatedPrefs as any,
      completeness_score: computedScores.total,
      layer_scores: computedScores as any,
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: '공개 설정 업데이트 중 오류가 발생했습니다: ' + updateErr.message }, { status: 500 });
  }

  // Record activity event
  await recordEvent(supabase, {
    actorId: user!.id,
    actorRole: 'broker',
    eventType: 'building_disclosure_prefs_updated' as any,
    entityType: 'building_ssot_lite',
    entityId: id,
    metadata: {
      completeness_score: computedScores.total,
    },
  });

  return NextResponse.json({
    ok: true,
    newCompletenessScore: computedScores.total,
    disclosurePrefs: updatedPrefs,
  });
}
