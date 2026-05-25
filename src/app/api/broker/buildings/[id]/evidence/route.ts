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

  const {
    fileName,
    fileSizeBytes,
    mimeType,
    layerCategory,
    storageBucket,
    storagePath,
    visibility,
  } = body;

  if (!layerCategory || !storagePath || !storageBucket) {
    return NextResponse.json(
      { error: 'layerCategory, storagePath, storageBucket은 필수 값입니다' },
      { status: 400 },
    );
  }

  const validCategories: LayerCategory[] = [
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
  ];

  if (!validCategories.includes(layerCategory)) {
    return NextResponse.json({ error: '유효하지 않은 layerCategory입니다' }, { status: 400 });
  }

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
    return NextResponse.json({ error: '증빙 파일 등록 실패: ' + insErr.message }, { status: 500 });
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
    return NextResponse.json(
      { error: '매물 완성도 업데이트 중 오류 발생: ' + updateErr.message },
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
