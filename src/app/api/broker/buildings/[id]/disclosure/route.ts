/**
 * POST /api/broker/buildings/[id]/disclosure
 * Updates Disclosure preferences, normalizes them, and recalculates completeness score
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeLayerScore } from '@/domain/building/layer-score-engine';
import { recordEvent } from '@/domain/analytics/record-event';
import { z } from 'zod';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';

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

const postSchema = z.object({
  blind_teaser: z.boolean().optional(),
  disclosurePrefs: z.object({
    blind_teaser: z.boolean().optional(),
    show_area_signal: z.boolean().optional(),
    show_asset_type: z.boolean().optional(),
    show_price_band: z.boolean().optional(),
    show_tenant_count: z.boolean().optional(),
    show_walt: z.boolean().optional(),
    show_vacancy_rate: z.boolean().optional(),
    hide_exact_address: z.boolean().optional(),
    hide_tenant_names: z.boolean().optional(),
    hide_unit_rent: z.boolean().optional(),
  }),
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

  // P0-SEC SEC-2: 소유권은 building_ssot_lite.owner_id 직접 판정 (readWithMigration 결과로 판정하지 않음 —
  // assets 행은 owner_id 가 없어 검사를 건너뛰던 fail-open 결함). 완성도 계산도 원본 행의 컬럼을 사용한다.
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

  const existingLayers = (
    building.layers && typeof building.layers === 'object' ? building.layers : {}
  ) as Record<string, any>;
  const existingDisclosurePrefs = existingLayers.disclosure_prefs ?? building.disclosure_prefs;
  const existingLeaseSummary = existingLayers.lease_summary ?? building.lease_summary;
  const existingFloorPlanUrl = existingLayers.floor_plan_url ?? building.floor_plan_url;
  const existingRepairHistory = existingLayers.repair_history ?? building.repair_history;

  const prefs = body.disclosurePrefs;
  const blindTeaserEnabled =
    prefs.blind_teaser !== undefined
      ? Boolean(prefs.blind_teaser)
      : body.blind_teaser !== undefined
      ? Boolean(body.blind_teaser)
      : Boolean(existingDisclosurePrefs?.blind_teaser);

  // Update building_ssot_lite with new prefs (blind_teaser forces server-side PII/address/rent redaction)
  const updatedPrefs = {
    ...(blindTeaserEnabled
      ? { blind_teaser: true }
      : prefs.blind_teaser === false || body.blind_teaser === false
      ? { blind_teaser: false }
      : {}),
    show_area_signal: !!prefs.show_area_signal,
    show_asset_type: !!prefs.show_asset_type,
    show_price_band: !!prefs.show_price_band,
    show_tenant_count: !!prefs.show_tenant_count,
    show_walt: !!prefs.show_walt,
    show_vacancy_rate: !!prefs.show_vacancy_rate,
    hide_exact_address: blindTeaserEnabled ? true : !!prefs.hide_exact_address,
    hide_tenant_names: blindTeaserEnabled ? true : !!prefs.hide_tenant_names,
    hide_unit_rent: blindTeaserEnabled ? true : !!prefs.hide_unit_rent,
  };

  // Re-fetch evidence files using real schema columns to compute completeness score
  const { data: files } = await supabase
    .from('evidence_files')
    .select('id, file_type, storage_path')
    .eq('building_id', id);

  const uploadedCategories = (files || [])
    .map((f: any) => extractEvidenceCategory(f))
    .filter((c): c is string => Boolean(c));

  const rentRollChecked = uploadedCategories.includes('rent_roll') ||
    (existingLeaseSummary && Object.keys(existingLeaseSummary).length > 0 && Array.isArray((existingLeaseSummary as any).tenants) && (existingLeaseSummary as any).tenants.length > 0);
  const floorPlanChecked = uploadedCategories.includes('floor_plan') || !!existingFloorPlanUrl;
  const repairHistoryChecked = uploadedCategories.includes('repair_history') ||
    (existingRepairHistory && Object.keys(existingRepairHistory).length > 0);

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

  const updatedLayers = {
    ...existingLayers,
    disclosure_prefs: updatedPrefs,
    completeness_score: computedScores.total,
    layer_scores: computedScores,
  };

  const { error: updateErr } = await supabase
    .from('building_ssot_lite')
    .update({
      layers: updatedLayers,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    console.error('[disclosure] Update failed:', updateErr);
    return NextResponse.json({ error: '공개 설정 업데이트에 실패했습니다.' }, { status: 500 });
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
