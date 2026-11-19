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

const MAX_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_EVIDENCE_STORAGE_BUCKETS = new Set([
  'building-photos',
  'building_photos',
  'evidence-files',
  'evidence',
  'evidence-private',
]);

const layerCategoryEnum = z.enum([
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

function detectEvidenceMagicMime(bytes: Uint8Array): { mimeType: string; ext: string } | null {
  // %PDF-
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return { mimeType: 'application/pdf', ext: 'pdf' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  return null;
}

function isValidEvidenceStoragePath(storagePath: string, buildingId: string): boolean {
  const trimmed = storagePath.trim();
  if (!trimmed || trimmed.length > 512) return false;
  if (trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes('..')) return false;
  if (!/^[A-Za-z0-9_./-]+$/.test(trimmed)) return false;
  const segments = trimmed.split('/').filter(Boolean);
  return segments.includes(buildingId);
}

const postSchema = z.object({
  fileName: z.string().max(255).optional(),
  fileSizeBytes: z.number().nonnegative().optional(),
  mimeType: z.string().max(128).optional(),
  layerCategory: layerCategoryEnum,
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

  const contentTypeHeader = String(req.headers.get('content-type') || '').toLowerCase();
  let fileName: string | undefined;
  let fileSizeBytes: number | undefined;
  let mimeType: string | undefined;
  let layerCategory: LayerCategory;
  let storageBucket: string;
  let storagePath: string;
  let visibility: string | undefined;

  if (contentTypeHeader.includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { ok: false, code: 'INVALID_FORM_DATA', error: '잘못된 파일 업로드 요청 형식입니다.' },
        { status: 400 },
      );
    }

    const rawFile = formData.get('file');
    const rawCategory = String(formData.get('layerCategory') || '').trim();
    const parsedCategory = layerCategoryEnum.safeParse(rawCategory);
    if (!parsedCategory.success) {
      return NextResponse.json(
        { ok: false, code: 'VALIDATION_FAILED', error: '증빙 서류 분류가 올바르지 않습니다.' },
        { status: 400 },
      );
    }
    if (!rawFile || typeof (rawFile as Blob).arrayBuffer !== 'function') {
      return NextResponse.json(
        { ok: false, code: 'MISSING_FILE', error: '업로드할 파일을 선택해 주세요.' },
        { status: 400 },
      );
    }

    const fileObj = rawFile as File;
    if (!fileObj.size || fileObj.size <= 0) {
      return NextResponse.json(
        { ok: false, code: 'EMPTY_FILE', error: '비어 있는 파일은 업로드할 수 없습니다.' },
        { status: 400 },
      );
    }
    if (fileObj.size > MAX_EVIDENCE_FILE_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          code: 'FILE_TOO_LARGE',
          error: '파일 크기는 10MB 이하여야 합니다.',
        },
        { status: 413 },
      );
    }

    const arrayBuffer = await fileObj.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_EVIDENCE_FILE_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          code: bytes.byteLength > MAX_EVIDENCE_FILE_BYTES ? 'FILE_TOO_LARGE' : 'EMPTY_FILE',
          error:
            bytes.byteLength > MAX_EVIDENCE_FILE_BYTES
              ? '파일 크기는 10MB 이하여야 합니다.'
              : '비어 있는 파일은 업로드할 수 없습니다.',
        },
        { status: bytes.byteLength > MAX_EVIDENCE_FILE_BYTES ? 413 : 400 },
      );
    }

    const detected = detectEvidenceMagicMime(bytes);
    if (!detected) {
      return NextResponse.json(
        {
          ok: false,
          code: 'UNSUPPORTED_FILE_TYPE',
          error: '지원하지 않는 파일 형식입니다. PDF, PNG, JPEG, WEBP 파일만 업로드할 수 있습니다.',
        },
        { status: 400 },
      );
    }

    const rawOriginalName =
      typeof fileObj.name === 'string' && fileObj.name.trim()
        ? fileObj.name.trim()
        : `evidence.${detected.ext}`;
    const safeStem =
      rawOriginalName
        .replace(/[^A-Za-z0-9_.-]/g, '_')
        .replace(/\.+/g, '.')
        .replace(/^[_.-]+|[_.-]+$/g, '')
        .slice(0, 80) || `evidence.${detected.ext}`;
    const safeFileName = /\.[A-Za-z0-9]{2,5}$/.test(safeStem)
      ? safeStem
      : `${safeStem}.${detected.ext}`;
    const safeBuildingSeg = id.replace(/[^A-Za-z0-9_-]/g, '');
    const safeCategory = parsedCategory.data.replace(/[^a-z0-9_]/g, '');

    layerCategory = parsedCategory.data;
    fileName = rawOriginalName.slice(0, 255);
    fileSizeBytes = bytes.byteLength;
    mimeType = detected.mimeType;
    storageBucket = 'evidence-private';
    storagePath = `${safeBuildingSeg}/${safeCategory}/${Date.now()}_${safeFileName}`;
    visibility = 'private';

    const storageApi = (supabase as unknown as { storage?: { from?: (b: string) => any } })?.storage;
    if (!storageApi || typeof storageApi.from !== 'function') {
      return NextResponse.json(
        {
          ok: false,
          code: 'STORAGE_UPLOAD_FAILED',
          error: '파일 스토리지 업로드에 실패했습니다.',
        },
        { status: 502 },
      );
    }

    try {
      const uploadRes = await storageApi
        .from(storageBucket)
        .upload(storagePath, Buffer.from(bytes), {
          contentType: detected.mimeType,
          upsert: false,
        });
      if (uploadRes?.error) {
        console.error('[evidence] Storage upload error:', uploadRes.error);
        return NextResponse.json(
          {
            ok: false,
            code: 'STORAGE_UPLOAD_FAILED',
            error: '파일 스토리지 업로드에 실패했습니다.',
          },
          { status: 502 },
        );
      }
    } catch (uploadErr) {
      console.error('[evidence] Storage upload exception:', uploadErr);
      return NextResponse.json(
        {
          ok: false,
          code: 'STORAGE_UPLOAD_FAILED',
          error: '파일 스토리지 업로드에 실패했습니다.',
        },
        { status: 502 },
      );
    }
  } else {
    let body;
    try {
      const raw = await req.json();
      body = postSchema.parse(raw);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return NextResponse.json(
          { ok: false, code: 'VALIDATION_FAILED', error: '입력값이 올바르지 않습니다.' },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: false, error: '잘못된 요청 형식입니다' }, { status: 400 });
    }

    fileName = body.fileName;
    fileSizeBytes = body.fileSizeBytes;
    mimeType = body.mimeType;
    layerCategory = body.layerCategory;
    storageBucket = body.storageBucket;
    storagePath = body.storagePath;
    visibility = body.visibility;

    if (!ALLOWED_EVIDENCE_STORAGE_BUCKETS.has(storageBucket)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'INVALID_STORAGE_BUCKET',
          error: '허용되지 않은 저장소 버킷입니다.',
        },
        { status: 400 },
      );
    }

    if (!isValidEvidenceStoragePath(storagePath, id)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'INVALID_STORAGE_PATH',
          error: '유효하지 않은 증빙 파일 경로입니다.',
        },
        { status: 400 },
      );
    }

    const storageBucketClient =
      typeof (supabase as unknown as { storage?: { from?: (b: string) => any } })?.storage?.from ===
      'function'
        ? (supabase as unknown as { storage: { from: (b: string) => any } }).storage.from(
            storageBucket,
          )
        : null;
    if (storageBucketClient && typeof storageBucketClient.download === 'function') {
      const dlRes = await storageBucketClient.download(storagePath);
      if (dlRes?.error || !dlRes?.data) {
        return NextResponse.json(
          {
            ok: false,
            code: 'EVIDENCE_FILE_NOT_UPLOADED',
            error: '업로드된 원본 파일을 확인할 수 없습니다.',
          },
          { status: 400 },
        );
      }
    }
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
