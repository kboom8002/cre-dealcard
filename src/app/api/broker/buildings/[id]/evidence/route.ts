/**
 * POST /api/broker/buildings/[id]/evidence
 * Uploads evidence file metadata and recalculates completeness score
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { computeCompletenessAfterUpload } from '@/domain/building/evidence-upload';
import { computeLayerScore } from '@/domain/building/layer-score-engine';
import { recordEvent } from '@/domain/analytics/record-event';
import { LayerCategory } from '@/types/database';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';

import { z } from 'zod';

const postSchema = z.object({
  fileName: z.string().optional(),
  fileSizeBytes: z.number().optional(),
  mimeType: z.string().optional(),
  layerCategory: z.enum([
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
  ]),
  storageBucket: z.string(),
  storagePath: z.string(),
  visibility: z.string().optional(),
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

  const {
    fileName,
    fileSizeBytes,
    mimeType,
    layerCategory,
    storageBucket,
    storagePath,
    visibility,
  } = body;

  // 1. Fetch previously uploaded evidence file categories
  const { data: existingFiles } = await supabase
    .from('evidence_files')
    .select('layer_category')
    .eq('building_id', id);

  const previouslyUploaded = existingFiles?.map((f: any) => f.layer_category) || [];

  // 2. Insert new evidence file details
  const { data: insertedFile, error: insErr } = await supabase
    .from('evidence_files')
    .insert({
      building_id: id,
      owner_id: user!.id,
      file_name: fileName || null,
      file_size_bytes: fileSizeBytes || null,
      mime_type: mimeType || null,
      layer_category: layerCategory,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      visibility: visibility || 'private',
      contains_sensitive_data: ['rent_roll', 'repair_history'].includes(layerCategory),
      training_allowed: false,
      is_verified: false,
    })
    .select()
    .single();

  if (insErr) {
    console.error('[evidence] Insert failed:', insErr);
    return NextResponse.json({ error: '증빙 파일 등록에 실패했습니다.' }, { status: 500 });
  }

  // 3. Recalculate completeness using computeCompletenessAfterUpload
  const newCompletenessByIncremental = computeCompletenessAfterUpload(
    building.completeness_score || 0,
    layerCategory,
    previouslyUploaded,
  );

  // Also build the full checklist to update layer_scores and verify full completeness
  const allUploaded = [...previouslyUploaded, layerCategory];

  const rentRollChecked =
    allUploaded.includes('rent_roll') ||
    (building.lease_summary &&
      Object.keys(building.lease_summary).length > 0 &&
      Array.isArray((building.lease_summary as any).tenants) &&
      (building.lease_summary as any).tenants.length > 0);

  const floorPlanChecked = allUploaded.includes('floor_plan') || !!building.floor_plan_url;
  
  const repairHistoryChecked =
    allUploaded.includes('repair_history') ||
    (building.repair_history && Object.keys(building.repair_history).length > 0);

  const disclosurePolicyChecked =
    allUploaded.includes('disclosure_policy') ||
    (building.disclosure_prefs && Object.keys(building.disclosure_prefs).length > 0);

  const checklist = {
    buildingRegister: allUploaded.includes('building_register'),
    registry: allUploaded.includes('registry_docs'),
    landUsePlan: allUploaded.includes('land_use_plan'),
    rentRoll: rentRollChecked,
    photos: allUploaded.includes('photos'),
    floorPlan: floorPlanChecked,
    repairHistory: repairHistoryChecked,
    vacancyStatus: allUploaded.includes('vacancy_docs'),
    askingPrice: !!building.price_band,
    disclosurePolicy: disclosurePolicyChecked,
  };

  const computedScores = computeLayerScore(checklist);

  // If layerCategory is floor_plan, we can also update the building's floor_plan_url
  const buildingUpdates: any = {
    completeness_score: computedScores.total,
    layer_scores: computedScores as any,
  };

  if (layerCategory === 'floor_plan') {
    buildingUpdates.floor_plan_url = storagePath;
  }

  // 4. Update building_ssot_lite
  const { error: updateErr } = await supabase
    .from('building_ssot_lite')
    .update(buildingUpdates)
    .eq('id', id);

  if (updateErr) {
    console.error('[evidence] Update failed:', updateErr);
    return NextResponse.json(
      { error: '매물 완성도 업데이트에 실패했습니다.' },
      { status: 500 },
    );
  }

  // 5. Record activity event
  await recordEvent(supabase, {
    actorId: user!.id,
    actorRole: 'broker',
    eventType: 'evidence_file_uploaded' as any,
    entityType: 'evidence_file' as any,
    entityId: insertedFile.id,
    metadata: {
      building_id: id,
      file_name: fileName || null,
      layer_category: layerCategory,
      completeness_score: computedScores.total,
      incremental_completeness: newCompletenessByIncremental,
    },
  });

  return NextResponse.json({
    ok: true,
    evidenceFileId: insertedFile.id,
    newCompletenessScore: computedScores.total,
    layerScores: computedScores,
  });
}
