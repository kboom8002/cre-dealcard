/**
 * GET /api/broker/buildings/[id]/studio
 * Returns building completeness scores, checklists, and eligible outputs
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeLayerScore, getEligibleOutputs } from '@/domain/building/layer-score-engine';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { computeDataGrade } from '@/domain/asset/grade-engine';
import { computeFinancialSummary, calculateNOI, calculateCapRate } from '@/domain/building/financials';
import { validateAssetConstraints } from '@/domain/asset/constraint-validator';
import { buildAttrsFromSsotLite, buildProvenanceFromSsotLite, buildFinancialInputsFromSsotLite } from '@/lib/ssot-adapter';
import { computeDerivedFields } from '@/domain/building/derived-enricher';
import { syncLeaseLedgerToSummary } from '@/domain/building/mobile-im/lease-adapter';

const KNOWN_EVIDENCE_CATEGORIES = new Set([
  'building_register',
  'registry_docs',
  'land_use_plan',
  'rent_roll',
  'photos',
  'floor_plan',
  'repair_history',
  'vacancy_docs',
  'asking_price',
  'disclosure_policy',
  'other',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEvidenceCategory(row: Record<string, any> | null | undefined): string | null {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.layer_category === 'string' && row.layer_category.trim()) {
    return row.layer_category.trim();
  }
  if (typeof row.file_type === 'string' && row.file_type.trim()) {
    const raw = row.file_type.trim();
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.layer_category === 'string' && parsed.layer_category.trim()) {
          return parsed.layer_category.trim();
        }
      } catch {
        // ignore malformed json
      }
    }
    if (KNOWN_EVIDENCE_CATEGORIES.has(raw)) return raw;
  }
  if (typeof row.storage_path === 'string') {
    for (const seg of row.storage_path.split('/').filter(Boolean)) {
      if (KNOWN_EVIDENCE_CATEGORIES.has(seg)) return seg;
    }
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { user } = guard;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    // P0-SEC SEC-2: 소유권은 building_ssot_lite.owner_id 직접 판정.
    // (이전: readWithMigration 이 assets 행을 돌려주면 owner_id 가 없어 정당한 소유자도 항상 404)
    // 표시 데이터도 building_ssot_lite 원본 행(lease_summary·floor_plan_url·disclosure_prefs 등 보유)을 사용한다.
    const ownership = await assertBuildingOwner<Record<string, any>>(supabase, id, user!.id, {
      allowAdmin: true,
      role: guard.role,
      select: '*',
    });
    if (!ownership.ok) return ownership.response;
    const building = ownership.row as any;

    const existingLayers = (
      building.layers && typeof building.layers === 'object' ? building.layers : {}
    ) as Record<string, any>;
    let effectiveLeaseSummary = (existingLayers.lease_summary ?? building.lease_summary ?? {}) as Record<string, any>;

    // Hydrate from canonical lease_ledger if layers.lease_summary lacks tenant rows
    if (!Array.isArray(effectiveLeaseSummary?.tenants) || effectiveLeaseSummary.tenants.length === 0) {
      const { data: ledgerRows } = await supabase
        .from('lease_ledger')
        .select('*')
        .eq('asset_id', id);
      if (Array.isArray(ledgerRows) && ledgerRows.length > 0) {
        effectiveLeaseSummary = {
          ...effectiveLeaseSummary,
          ...syncLeaseLedgerToSummary(ledgerRows),
        };
      }
    }

    const floorPlanUrl = existingLayers.floor_plan_url ?? building.floor_plan_url;
    const repairHistory = existingLayers.repair_history ?? building.repair_history;
    const disclosurePrefs = existingLayers.disclosure_prefs ?? building.disclosure_prefs ?? {};
    const prevCompleteness = existingLayers.completeness_score ?? building.completeness_score;
    const prevLayerScores = existingLayers.layer_scores ?? building.layer_scores;

    // Fetch uploaded evidence file categories using real schema columns
    const { data: files } = await supabase
      .from('evidence_files')
      .select('id, file_type, storage_path')
      .eq('building_id', id);

    const uploadedCategories = (files || [])
      .map((f: any) => extractEvidenceCategory(f))
      .filter((c): c is string => Boolean(c));

    // Determine checklist values
    const rentRollChecked = uploadedCategories.includes('rent_roll') ||
      (effectiveLeaseSummary && Object.keys(effectiveLeaseSummary).length > 0 && Array.isArray((effectiveLeaseSummary as any).tenants) && (effectiveLeaseSummary as any).tenants.length > 0);

    const floorPlanChecked = uploadedCategories.includes('floor_plan') || !!floorPlanUrl;
    const repairHistoryChecked = uploadedCategories.includes('repair_history') ||
      (repairHistory && Object.keys(repairHistory).length > 0);

    const disclosurePolicyChecked = uploadedCategories.includes('disclosure_policy') ||
      (disclosurePrefs && Object.keys(disclosurePrefs).length > 0);

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

    // ─── v3 Domain Module Integration ───
    const hydratedBuilding = {
      ...building,
      lease_summary: effectiveLeaseSummary,
      layers: { ...existingLayers, lease_summary: effectiveLeaseSummary },
    };
    const attrs = buildAttrsFromSsotLite(hydratedBuilding);
    const provenanceMap = buildProvenanceFromSsotLite(hydratedBuilding);

    const derived = computeDerivedFields(attrs);

    // Data Grade (A~D)
    const gradeResult = computeDataGrade(attrs, provenanceMap);

    // Financial Summary (gated by grade)
    const finInputs = buildFinancialInputsFromSsotLite(hydratedBuilding);
    let financialSummary = null;
    if (finInputs.grossAnnualIncomeKrw > 0 && finInputs.askingPriceKrw > 0) {
      const noiResult = calculateNOI(finInputs.grossAnnualIncomeKrw, finInputs.opexRatioPct, finInputs.vacancyReservePct);
      const capRateResult = calculateCapRate(noiResult.value, finInputs.askingPriceKrw);
      financialSummary = {
        noi: noiResult,
        capRate: capRateResult,
        grade: gradeResult.grade,
        isDcfEligible: gradeResult.grade === 'A',
      };
    }

    // Constraint Validation (C01~C12)
    const constraintResult = validateAssetConstraints(attrs);

    // Update building_ssot_lite.layers if there's any discrepancy
    if (
      prevCompleteness !== computedScores.total ||
      JSON.stringify(prevLayerScores) !== JSON.stringify(computedScores)
    ) {
      await supabase
        .from('building_ssot_lite')
        .update({
          layers: {
            ...existingLayers,
            completeness_score: computedScores.total,
            layer_scores: computedScores,
          },
          updated_at: new Date().toISOString(),
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
      disclosurePrefs,
      leaseSummary: effectiveLeaseSummary,
      // v3 Domain Module Results
      dataGrade: gradeResult.grade,
      gradeDetails: gradeResult,
      financialSummary,
      constraints: constraintResult,
      derivedFields: derived,
    });
  } catch (err) {
    console.error('[broker-buildings-id-studio-get] Error:', err);
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
