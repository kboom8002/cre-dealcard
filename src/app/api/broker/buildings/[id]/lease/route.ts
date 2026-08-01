/**
 * POST /api/broker/buildings/[id]/lease
 * Updates Rent Roll data, normalizes it, and recalculates completeness score
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildLeaseSummaryFromInput } from '@/domain/building/lease-normalizer';
import { computeLayerScore, getEligibleOutputs } from '@/domain/building/layer-score-engine';
import { recordEvent } from '@/domain/analytics/record-event';
import { validateAssetConstraints } from '@/domain/asset/constraint-validator';
import { buildAttrsFromSsotLite, readWithMigration } from '@/lib/ssot-adapter';
import { persistLeaseUnits } from '@/domain/building/mobile-im/lease-adapter';
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
  const result = await readWithMigration(id);
  const building = result.data as any;

  if (!building || Object.keys(building).length === 0 || building.owner_id !== user!.id) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 });
  }

  const tenantsInput = body.tenants;
  if (!Array.isArray(tenantsInput)) {
    return NextResponse.json({ error: 'tenants 배열이 필요합니다' }, { status: 400 });
  }

  // Normalize and calculate vacancy/WALT/income
  const normalizedSummary = buildLeaseSummaryFromInput(tenantsInput);

  // ─── v3 Constraint Validation on updated lease data ───
  const updatedBuilding = { ...building, lease_summary: normalizedSummary.privateLayer };
  const attrs = buildAttrsFromSsotLite(updatedBuilding);
  const constraintResult = validateAssetConstraints(attrs);
  const criticalViolations = constraintResult.violations?.filter(
    (v: any) => ['C01', 'C03'].includes(v.code)
  ) || [];

  if (criticalViolations.length > 0) {
    return NextResponse.json({
      error: '치명적 데이터 무결성 위반이 감지되었습니다',
      violations: criticalViolations,
    }, { status: 422 });
  }

  // Update building_ssot_lite with public and private layers
  const updatedLayers = {
    ...(building.layers || {}),
    lease_summary: normalizedSummary.publicLayer,
  };

  // Re-fetch evidence files to compute completeness score
  const { data: files } = await supabase
    .from('evidence_files')
    .select('layer_category')
    .eq('building_id', id);

  const uploadedCategories = files?.map((f: any) => f.layer_category) || [];
  
  const rentRollChecked = uploadedCategories.includes('rent_roll') || normalizedSummary.privateLayer.tenants.length > 0;
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

  const { error: updateErr } = await supabase
    .from('building_ssot_lite')
    .update({
      lease_summary: normalizedSummary.privateLayer as any,
      layers: updatedLayers,
      completeness_score: computedScores.total,
      layer_scores: computedScores as any,
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: '임대차 정보 업데이트 중 오류가 발생했습니다: ' + updateErr.message }, { status: 500 });
  }

  // Sync to v3 assets table if it exists
  const updatedAttrs = {
    ...attrs,
    leaseSummary: normalizedSummary.privateLayer,
    layerScores: computedScores,
  };
  await supabase
    .from('assets')
    .update({ attrs: updatedAttrs })
    .eq('id', id);

  // v3: Persist normalized lease units to dedicated table (S2-T11)
  try {
    const leaseUnits = (normalizedSummary.privateLayer?.tenants || []).map((t: any, idx: number) => ({
      floor: t.floor || `${idx + 1}F`,
      tenant_sector: t.sector || t.업종 || '',
      area_pyung: Number(t.area_pyung || t.면적 || 0),
      deposit_krw: Number(t.deposit_krw || t.보증금 || 0),
      monthly_rent_krw: Number(t.monthly_rent_krw || t.월세 || 0),
      mgmt_fee_krw: Number(t.mgmt_fee_krw || t.관리비 || 0),
      source_tier: 'broker_input',
    }));
    if (leaseUnits.length > 0) {
      const persistResult = await persistLeaseUnits(id, leaseUnits);
      console.info(`[lease] Persisted ${persistResult.inserted} units to lease_units table`);
    }
  } catch (err) {
    console.warn('[lease] Failed to persist lease units:', err);
  }

  // Record activity event
  await recordEvent(supabase, {
    actorId: user!.id,
    actorRole: 'broker',
    eventType: 'building_lease_roll_updated',
    entityType: 'building_ssot_lite',
    entityId: id,
    metadata: {
      tenant_count: normalizedSummary.privateLayer.tenants.length,
      walt_months: normalizedSummary.privateLayer.walt_months,
      vacancy_rate: normalizedSummary.privateLayer.vacancy_rate,
      completeness_score: computedScores.total,
    },
  });

  return NextResponse.json({
    ok: true,
    newCompletenessScore: computedScores.total,
    leaseSummary: normalizedSummary.privateLayer,
    constraintWarnings: constraintResult.violations || [],
  });
}
