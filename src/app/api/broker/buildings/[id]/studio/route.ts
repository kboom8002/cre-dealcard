/**
 * GET /api/broker/buildings/[id]/studio
 * Returns building completeness scores, checklists, and eligible outputs
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeLayerScore, getEligibleOutputs } from '@/domain/building/layer-score-engine';
import { requireBroker } from '@/lib/auth-guard';

export async function GET(
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

  // Verify ownership using correct DB column owner_id
  const { data: building, error: bErr } = await supabase
    .from('building_ssot_lite')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user!.id)
    .single();

  if (bErr || !building) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  // Fetch uploaded evidence file categories
  const { data: files } = await supabase
    .from('evidence_files')
    .select('layer_category')
    .eq('building_id', id);

  const uploadedCategories = files?.map((f: any) => f.layer_category) || [];

  // Determine checklist values
  const rentRollChecked = uploadedCategories.includes('rent_roll') || 
    (building.lease_summary && Object.keys(building.lease_summary).length > 0 && Array.isArray((building.lease_summary as any).tenants) && (building.lease_summary as any).tenants.length > 0);

  const floorPlanChecked = uploadedCategories.includes('floor_plan') || !!building.floor_plan_url;
  const repairHistoryChecked = uploadedCategories.includes('repair_history') || 
    (building.repair_history && Object.keys(building.repair_history).length > 0);

  const disclosurePolicyChecked = uploadedCategories.includes('disclosure_policy') || 
    (building.disclosure_prefs && Object.keys(building.disclosure_prefs).length > 0);

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
    disclosurePolicy: disclosurePolicyChecked,
  };

  const computedScores = computeLayerScore(checklist);
  const eligibleOutputs = getEligibleOutputs(computedScores.total);

  // Update building_ssot_lite if there's any discrepancy
  if (
    building.completeness_score !== computedScores.total ||
    JSON.stringify(building.layer_scores) !== JSON.stringify(computedScores)
  ) {
    await supabase
      .from('building_ssot_lite')
      .update({
        completeness_score: computedScores.total,
        layer_scores: computedScores as any,
      })
      .eq('id', id);
  }

  return NextResponse.json({
    ok: true,
    buildingId: id,
    completenessScore: computedScores.total,
    layerScores: computedScores,
    checklist,
    eligibleOutputs,
    disclosurePrefs: building.disclosure_prefs || {},
    leaseSummary: building.lease_summary || {},
  });
}
