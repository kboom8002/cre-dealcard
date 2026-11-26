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
import { buildAttrsFromSsotLite } from '@/lib/ssot-adapter';
import {
  persistLeaseUnits,
  syncLeaseLedgerToSummary,
  type LeaseUnitPersistInput,
} from '@/domain/building/mobile-im/lease-adapter';
import { sqmToPyeong } from '@/lib/utils/area-conversion';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';

import { z } from 'zod';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

const toIsoDateOrUndefined = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`;
  return undefined;
};

const postSchema = z.object({
  tenants: z.array(z.any()),
  meta: z.any().optional(),
  rentRollMeta: z.any().optional(),
});

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

  // P0-SEC SEC-2: 소유권은 building_ssot_lite.owner_id 직접 판정.
  // (이전: readWithMigration 이 assets 행을 돌려주면 owner_id 가 없어 정당한 소유자도 항상 404)
  // 데이터도 building_ssot_lite 원본 행을 사용한다 — assets 행에는 layers 가 없어 아래 layers 병합이
  // 기존 layers(대장·사진 등)를 통째로 지우게 되므로 readWithMigration 결과를 쓰면 안 된다.
  const ownership = await assertBuildingOwner<Record<string, any>>(supabase, id, user!.id, {
    allowAdmin: true,
    role: guard.role,
    select: '*',
  });
  if (!ownership.ok) return ownership.response;
  const building = ownership.row as any;

  let body;
  try {
    const raw = await req.json();
    body = postSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 });
  }

  const tenantsInput = body.tenants;
  const incomingMeta = body.rentRollMeta ?? body.meta ?? undefined;
  const existingLayers = (
    building.layers && typeof building.layers === 'object' ? building.layers : {}
  ) as Record<string, any>;

  // Normalize and calculate vacancy/WALT/income + canonical ledger summary
  const normalizedSummary = buildLeaseSummaryFromInput(tenantsInput);
  const syncedSummary = syncLeaseLedgerToSummary(tenantsInput);
  const mergedPrivateSummary = {
    ...normalizedSummary.privateLayer,
    monthly_rent_total_krw: syncedSummary.monthly_rent_total_krw,
    monthly_rent_krw: syncedSummary.monthly_rent_krw,
    monthly_rent_manwon: syncedSummary.monthly_rent_manwon,
    total_deposit_krw: syncedSummary.total_deposit_krw,
    total_deposit_manwon: syncedSummary.total_deposit_manwon,
    mgmt_fee_total_manwon: syncedSummary.mgmt_fee_total_manwon,
    vacancy_pct: syncedSummary.vacancy_pct,
  };

  // ─── v3 Constraint Validation on updated lease data ───
  const updatedBuilding = {
    ...building,
    lease_summary: mergedPrivateSummary,
    layers: { ...existingLayers, lease_summary: mergedPrivateSummary },
  };
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

  // Re-fetch evidence files using real schema columns to compute completeness score
  const { data: files } = await supabase
    .from('evidence_files')
    .select('id, file_type, storage_path')
    .eq('building_id', id);

  const uploadedCategories = (files || [])
    .map((f: any) => extractEvidenceCategory(f))
    .filter((c): c is string => Boolean(c));

  const floorPlanUrl = existingLayers.floor_plan_url ?? building.floor_plan_url;
  const repairHistory = existingLayers.repair_history ?? building.repair_history;
  const disclosurePrefs = existingLayers.disclosure_prefs ?? building.disclosure_prefs;

  const rentRollChecked = uploadedCategories.includes('rent_roll') || (normalizedSummary?.privateLayer?.tenants?.length ?? 0) > 0;
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

  // Merge lease_summary, completeness_score, and layer_scores into building_ssot_lite.layers JSONB
  const updatedLayers = {
    ...existingLayers,
    lease_summary: mergedPrivateSummary,
    lease_summary_public: normalizedSummary.publicLayer,
    completeness_score: computedScores.total,
    layer_scores: computedScores,
    finance: {
      ...(existingLayers.finance && typeof existingLayers.finance === 'object' ? existingLayers.finance : {}),
      monthly_rent_krw: syncedSummary.monthly_rent_krw,
      monthly_rent_manwon: syncedSummary.monthly_rent_manwon,
      total_deposit_krw: syncedSummary.total_deposit_krw,
      total_deposit_manwon: syncedSummary.total_deposit_manwon,
      vacancy_pct: syncedSummary.vacancy_pct,
    },
  };

  const { error: updateErr } = await supabase
    .from('building_ssot_lite')
    .update({
      layers: updatedLayers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    console.error('[lease] Update failed:', updateErr);
    return NextResponse.json({ error: '임대차 정보 업데이트에 실패했습니다.' }, { status: 500 });
  }

  // Sync to v3 assets table if it exists
  const updatedAttrs = {
    ...attrs,
    leaseSummary: mergedPrivateSummary,
    layerScores: computedScores,
  };
  await supabase
    .from('assets')
    .update({ attrs: updatedAttrs })
    .eq('id', id);

  // Canonical Rent-Roll SSOT: ALWAYS persist normalized lease units to lease_ledger (+ lease_ledger_meta)
  try {
    const leaseUnits: LeaseUnitPersistInput[] = (normalizedSummary.privateLayer?.tenants || []).map((t: any, idx: number) => {
      const rawRow = tenantsInput[idx] ?? {};
      const areaSqmNum = Number(t.area_sqm ?? rawRow.area_sqm ?? 0);
      const areaPyungNum = Number(
        rawRow.area_pyung ??
          rawRow.area_pyeong ??
          rawRow.면적 ??
          (areaSqmNum > 0 ? sqmToPyeong(areaSqmNum) : 0),
      );
      const depositKrw = Number(
        t.deposit ??
          rawRow.deposit_krw ??
          (rawRow.deposit_manwon != null ? Number(rawRow.deposit_manwon) * 10000 : undefined) ??
          rawRow.보증금 ??
          0,
      );
      const monthlyRentKrw = Number(
        t.monthly_rent ??
          rawRow.monthly_rent_krw ??
          (rawRow.rent_manwon != null ? Number(rawRow.rent_manwon) * 10000 : undefined) ??
          rawRow.월세 ??
          0,
      );
      const mgmtFeeKrw = Number(
        rawRow.mgmt_fee_krw ??
          (rawRow.mgmt_fee_manwon != null ? Number(rawRow.mgmt_fee_manwon) * 10000 : undefined) ??
          rawRow.관리비 ??
          0,
      );

      return {
        floor: t.floor || rawRow.floor || `${idx + 1}F`,
        tenant_sector: rawRow.sector || rawRow.업종 || t.tenant_type || undefined,
        area_pyung: areaPyungNum > 0 ? areaPyungNum : undefined,
        lease_area_sqm: areaSqmNum > 0 ? areaSqmNum : undefined,
        exclusive_area_sqm: Number(rawRow.exclusive_area_sqm) > 0 ? Number(rawRow.exclusive_area_sqm) : undefined,
        deposit_krw: depositKrw > 0 ? depositKrw : undefined,
        monthly_rent_krw: monthlyRentKrw > 0 ? monthlyRentKrw : undefined,
        // X4: 빈 관리비를 0원으로 저장하지 않는다 (0 → undefined → null)
        mgmt_fee_krw: mgmtFeeKrw > 0 ? mgmtFeeKrw : undefined,
        lease_start: toIsoDateOrUndefined(rawRow.lease_start ?? rawRow.contract_start),
        lease_end: toIsoDateOrUndefined(t.contract_end ?? rawRow.lease_end ?? rawRow.contract_end),
        contract_group: typeof rawRow.contract_group === 'string' ? rawRow.contract_group : undefined,
        legal_basis: rawRow.legal_basis,
        lease_state: rawRow.lease_state ?? (t.tenant_type === 'vacant' ? '공실' : undefined),
        evidence_level: rawRow.evidence_level,
        rent_free_months: rawRow.rent_free_months,
        payment_status: rawRow.payment_status,
        note: typeof rawRow.note === 'string' ? rawRow.note : undefined,
        source_tier: 'studio_input',
      };
    });

    const persistResult = await persistLeaseUnits(id, leaseUnits, undefined, {
      sparse: true,
      pruneSourceTier: 'studio_input',
      meta: incomingMeta,
      supabaseClient: supabase,
    });
    log.info(`[lease] Persisted ${persistResult.inserted} units to lease_ledger table`);
  } catch (err) {
    log.warn('[lease] Failed to persist lease units:', err);
  }

  // Sync matching workspace_items (kind: 'im') draft_payload.rentRoll if present
  try {
    let wsMatch: Record<string, any> | null = null;
    if (UUID_RE.test(id)) {
      const { data: byBld } = await supabase
        .from('workspace_items')
        .select('id, status, draft_payload, version, deleted_at')
        .eq('building_id', id)
        .eq('kind', 'im')
        .limit(1);
      const bldRows = Array.isArray(byBld) ? byBld : byBld ? [byBld] : [];
      wsMatch = bldRows.find((r: any) => r && r.id && !r.deleted_at) ?? null;
    }
    if (!wsMatch) {
      const { data: byLegacy } = await supabase
        .from('workspace_items')
        .select('id, status, draft_payload, version, deleted_at')
        .eq('legacy_id', id)
        .eq('kind', 'im')
        .limit(1);
      const legRows = Array.isArray(byLegacy) ? byLegacy : byLegacy ? [byLegacy] : [];
      wsMatch = legRows.find((r: any) => r && r.id && !r.deleted_at) ?? null;
    }
    if (wsMatch?.id) {
      const prevDraft =
        wsMatch.draft_payload && typeof wsMatch.draft_payload === 'object'
          ? (wsMatch.draft_payload as Record<string, unknown>)
          : {};
      await supabase
        .from('workspace_items')
        .update({
          draft_payload: {
            ...prevDraft,
            rentRoll: syncedSummary.rentRollRows,
            ...(incomingMeta ? { rentRollMeta: incomingMeta } : {}),
            monthlyRentTotalManwon: syncedSummary.monthly_rent_manwon,
            totalDepositManwon: syncedSummary.total_deposit_manwon,
            vacancyPct: syncedSummary.vacancy_pct,
          },
          version: Number(wsMatch.version || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wsMatch.id);
    }
  } catch (wsErr) {
    log.warn('[lease] Workspace IM rentRoll sync warning:', wsErr);
  }

  // Record activity event
  await recordEvent(supabase, {
    actorId: user!.id,
    actorRole: 'broker',
    eventType: 'building_lease_roll_updated',
    entityType: 'building_ssot_lite',
    entityId: id,
    metadata: {
      tenant_count: (normalizedSummary?.privateLayer?.tenants?.length ?? 0),
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
