/**
 * POST /api/broker/buildings/[id]/snapshot/generate
 * Generates an AI Snapshot Draft for buildings with completeness_score >= 60.
 */
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runBuildingSnapshotAgent } from '@/ai/agents/BuildingSnapshotAgent';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { validateSnapshotOutput } from '@/domain/building/snapshot-generator';
import { recordEvent } from '@/domain/analytics/record-event';
import { requireBroker } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { enforceBrokerAiQuota } from '@/lib/ai-quota-guard';

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const rateAllowed = await checkRateLimit(user!.id, 'building_snapshot_generate', 10, 60_000);
  if (!rateAllowed) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', error: '스냅샷 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // P0-SEC SEC-1: 소유권 검사 + building_ssot_lite 원본 행 조회 (이전: 소유권 검사 없이 남의 매물로 스냅샷 생성 가능)
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
  const currentScore = Number(existingLayers.completeness_score ?? building.completeness_score ?? 0);
  const resolvedLeaseSummary = existingLayers.lease_summary ?? building.lease_summary ?? {};

  // Check completeness score >= 60
  if (currentScore < 60) {
    return NextResponse.json(
      {
        error: {
          code: 'COMPLETENESS_INSUFFICIENT',
          currentScore,
          message: '스냅샷을 생성하려면 완성도 점수가 최소 60점 이상이어야 합니다.',
        },
      },
      { status: 422 },
    );
  }

  // Enforce daily AI generation quota before invoking LLM (gracefully degrades on partial unit-test mocks)
  const quotaErr = await enforceBrokerAiQuota(req, user!.id, 'building_snapshot_generate', {
    perMinute: 10,
  });
  if (quotaErr) return quotaErr;

  // Fetch evidence files using real schema columns to get available layers
  const { data: files } = await supabase
    .from('evidence_files')
    .select('id, file_type, storage_path')
    .eq('building_id', id);
  const uploadedCategories = (files || [])
    .map((f: any) => extractEvidenceCategory(f))
    .filter((c): c is string => Boolean(c));

  // Generate snapshot via AI Agent
  let result;
  try {
    result = await runBuildingSnapshotAgent({
      building: {
        ...building,
        completeness_score: currentScore,
        lease_summary: resolvedLeaseSummary,
      },
      leaseSummary: resolvedLeaseSummary,
      availableEvidenceLayers: uploadedCategories,
    });
  } catch (agentErr: any) {
    console.error('[snapshot/generate] AI agent failed:', agentErr);
    return NextResponse.json(
      { error: 'AI 스냅샷 생성 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }

  const { snapshot, model, promptVersion } = result;

  // Run safety guardrail checks
  const safety = validateSnapshotOutput(snapshot);
  if (!safety.passed) {
    return NextResponse.json(
      {
        error: 'Safety check failed',
        violations: safety.violations,
      },
      { status: 400 },
    );
  }

  // Save to document_objects table
  const generatedDocId = crypto.randomUUID();
  const { data: doc, error: docErr } = await supabase
    .from('document_objects')
    .insert({
      id: generatedDocId,
      owner_id: user!.id,
      source_type: 'building_ssot_lite',
      source_id: id,
      building_id: id,
      document_type: 'building_snapshot_draft',
      visibility: 'public_blind',
      status: 'draft',
      title: snapshot.headline,
      body: snapshot as any,
      model_version: model,
      prompt_version: promptVersion,
    })
    .select('id')
    .single();

  if (docErr || !doc) {
    console.error('[snapshot/generate] document_objects insert failed:', docErr);
    return NextResponse.json(
      { error: '스냅샷 문서 저장에 실패했습니다.' },
      { status: 500 },
    );
  }

  const documentId = doc.id ?? generatedDocId;

  // Record activity event
  await recordEvent(supabase, {
    actorId: user!.id,
    actorRole: 'broker',
    eventType: 'building_snapshot_generated',
    entityType: 'building_ssot_lite',
    entityId: id,
    metadata: {
      document_id: documentId,
      model_version: model,
    },
  });

  return NextResponse.json({
    ok: true,
    documentId,
    documentType: 'building_snapshot_draft',
    status: 'draft',
  });
}
